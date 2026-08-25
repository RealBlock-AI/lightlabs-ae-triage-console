export type RefusalCode = "NON_DETECT" | "MISSING_VALUE" | "MISSING_SERVING_SIZE" | "SERVING_SIZE_AMBIGUOUS" | "UNIT_MISMATCH" | "NO_APPLIED_LIMIT" | "NO_BOUND";
export type Refusal = { code: RefusalCode; reason: string };
export type SpecStatus = "no_spec" | "in_spec" | "out_spec";
export type DisagreementCause = "serving_size_ambiguous" | "missing_serving_size" | "stale_verdict" | "limit_source_drift" | "unit_mismatch" | "bound_direction";
export type LimitBasis = "per_serving" | "per_kg" | "per_capsule" | "per_100g" | null;

export type TestInput = { specStatus: SpecStatus; updatedAt: Date; publishedAt?: Date | null };
export type ResultInput = { concentration: string | number | null; unit: string; loq?: string | number | null; evaluation?: string | null };
export type LimitInput = { upperBound?: string | number | null; lowerBound?: string | number | null; limitUnit?: string | null; limitBasis?: LimitBasis; updatedAt: Date; source: string; customized: boolean };
export type SampleInput = { servingSizeGrams?: string | number | null; labReportedServingSize?: string | number | null };
export type CurrentSpecInput = Pick<LimitInput, "upperBound" | "lowerBound" | "limitUnit" | "limitBasis"> | null;

export type Verdict = {
  specStatus: SpecStatus;
  agreement: "agrees" | "disagrees" | "not_computable";
  disagreementCause?: DisagreementCause;
  computed?: { value: number; unit: string; bound: number; boundType: "upper" | "lower"; percentOfBound: number; basis: string; servingSizeUsed?: { grams: number; source: "declared" | "lab_reported" } };
  branches?: Array<{ servingSource: "declared" | "lab_reported"; grams: number; value: number; unit: string; passes: boolean }>;
  appliedLimit: { table: "test_limits" | "limit_groups"; source: string; customized: boolean };
  currentSpecDiffers: boolean;
  refusal?: Refusal;
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const number = (value: string | number | null | undefined) => value === null || value === undefined || value === "" ? undefined : Number(value);
const massFractionToUgKg: Record<string, number> = { ppb: 1, "ug/kg": 1, ppm: 1000, "mg/kg": 1000, "ug/g": 1000 };

export function convertToBasis(value: number, unit: string, targetUnit: string, targetBasis: LimitBasis, servingSizeGrams?: number): number | Refusal {
  const source = unit.toLowerCase().trim(); const target = targetUnit.toLowerCase().trim();
  if (!Number.isFinite(value)) return { code: "MISSING_VALUE", reason: "No finite result value is available." };
  if (source === target && targetBasis !== "per_serving") return value;
  const sourceUgKg = massFractionToUgKg[source];
  if (target === "ug/serving" || target === "µg/serving") {
    if (sourceUgKg === undefined) return { code: "UNIT_MISMATCH", reason: `No deterministic conversion is defined from ${unit} to ${targetUnit}.` };
    if (!servingSizeGrams || servingSizeGrams <= 0) return { code: "MISSING_SERVING_SIZE", reason: "A serving size is required to convert a mass-fraction result to a per-serving limit." };
    return sourceUgKg * value * (servingSizeGrams / 1000);
  }
  const targetUgKg = massFractionToUgKg[target];
  if (sourceUgKg !== undefined && targetUgKg !== undefined) return value * sourceUgKg / targetUgKg;
  if (source === target) return value;
  return { code: "UNIT_MISMATCH", reason: `No deterministic conversion is defined from ${unit} to ${targetUnit}.` };
}

function differs(a: CurrentSpecInput, b: LimitInput) {
  if (!a) return false;
  return String(a.upperBound ?? "") !== String(b.upperBound ?? "") || String(a.lowerBound ?? "") !== String(b.lowerBound ?? "") || String(a.limitUnit ?? "") !== String(b.limitUnit ?? "") || (a.limitBasis ?? null) !== (b.limitBasis ?? null);
}

function branch(value: number, resultUnit: string, limit: LimitInput, grams: number, source: "declared" | "lab_reported") {
  const boundType = limit.upperBound != null ? "upper" as const : "lower" as const;
  const bound = number(boundType === "upper" ? limit.upperBound : limit.lowerBound);
  const converted = convertToBasis(value, resultUnit, limit.limitUnit ?? "", limit.limitBasis ?? null, grams);
  if (typeof converted !== "number" || !bound || bound <= 0) return undefined;
  return { servingSource: source, grams, value: round1(converted), unit: limit.limitUnit ?? resultUnit, passes: boundType === "upper" ? converted <= bound : converted >= bound };
}

export function evaluateTest(input: { test: TestInput; result: ResultInput; testLimit?: LimitInput; sample: SampleInput; currentSpec: CurrentSpecInput; missingServingSize?: boolean; appliedTable?: "test_limits" | "limit_groups" }): Verdict {
  const limit = input.testLimit;
  const appliedLimit = { table: input.appliedTable ?? "test_limits" as const, source: limit?.source ?? "No applied limit", customized: Boolean(limit?.customized) };
  const currentSpecDiffers = limit ? differs(input.currentSpec, limit) : false;
  if (!limit) return { specStatus: input.test.specStatus, agreement: "not_computable", appliedLimit, currentSpecDiffers, refusal: { code: "NO_APPLIED_LIMIT", reason: "No applied test limit was found for this result." } };
  const concentration = number(input.result.concentration);
  if (concentration === undefined || /non.?detect|below\s+loq/i.test(input.result.evaluation ?? "")) return { specStatus: input.test.specStatus, agreement: "not_computable", appliedLimit, currentSpecDiffers, refusal: { code: "NON_DETECT", reason: "The result is non-detect or has no numeric concentration; it is not treated as zero." } };
  const boundType = limit.upperBound != null ? "upper" as const : limit.lowerBound != null ? "lower" as const : undefined;
  const bound = number(boundType === "upper" ? limit.upperBound : limit.lowerBound);
  if (!boundType || bound === undefined || bound <= 0 || !limit.limitUnit) return { specStatus: input.test.specStatus, agreement: "not_computable", appliedLimit, currentSpecDiffers, refusal: { code: "NO_BOUND", reason: "The applied limit has no usable upper or lower bound." } };
  const declared = number(input.sample.servingSizeGrams); const lab = number(input.sample.labReportedServingSize);
  const needsServing = (limit.limitBasis === "per_serving") && (limit.limitUnit.toLowerCase().includes("/serving") || massFractionToUgKg[input.result.unit.toLowerCase()] !== undefined);
  if (input.missingServingSize || (needsServing && !declared && !lab)) return { specStatus: input.test.specStatus, agreement: "not_computable", disagreementCause: "missing_serving_size", appliedLimit, currentSpecDiffers, refusal: { code: "MISSING_SERVING_SIZE", reason: "The applied comparison requires a serving size, but no safe serving-size basis is available." } };
  if (needsServing && declared && lab && Math.abs(declared - lab) / Math.max(declared, lab) > 0.02) {
    const declaredBranch = branch(concentration, input.result.unit, limit, declared, "declared"); const labBranch = branch(concentration, input.result.unit, limit, lab, "lab_reported");
    if (declaredBranch && labBranch && declaredBranch.passes !== labBranch.passes) return { specStatus: input.test.specStatus, agreement: "disagrees", disagreementCause: "serving_size_ambiguous", branches: [declaredBranch, labBranch], appliedLimit, currentSpecDiffers };
  }
  const selectedServing = needsServing ? declared ?? lab : undefined;
  const value = convertToBasis(concentration, input.result.unit, limit.limitUnit, limit.limitBasis ?? null, selectedServing);
  if (typeof value !== "number") return { specStatus: input.test.specStatus, agreement: "not_computable", disagreementCause: value.code === "UNIT_MISMATCH" ? "unit_mismatch" : undefined, appliedLimit, currentSpecDiffers, refusal: value };
  const passes = boundType === "upper" ? value <= bound : value >= bound;
  const expected = passes ? "in_spec" : "out_spec";
  const disagreementCause: DisagreementCause | undefined = limit.updatedAt.getTime() > input.test.updatedAt.getTime() ? "stale_verdict" : currentSpecDiffers ? "limit_source_drift" : input.test.specStatus !== "no_spec" && expected !== input.test.specStatus ? "bound_direction" : undefined;
  return { specStatus: input.test.specStatus, agreement: disagreementCause ? "disagrees" : "agrees", disagreementCause, computed: { value: round1(value), unit: limit.limitUnit, bound, boundType, percentOfBound: round1((value / bound) * 100), basis: limit.limitBasis ?? "not_stated", servingSizeUsed: selectedServing ? { grams: selectedServing, source: declared ? "declared" : "lab_reported" } : undefined }, appliedLimit, currentSpecDiffers };
}

export function percentOfLabelClaim(result: ResultInput, claim: { value: string | number | null; unit: string }) {
  const measured = number(result.concentration); const declared = number(claim.value);
  if (measured === undefined || declared === undefined || /non.?detect/i.test(result.evaluation ?? "")) return { refusal: { code: "NON_DETECT" as const, reason: "A numeric released measurement and an explicitly stated claim are required." } };
  if (result.unit.toLowerCase() !== claim.unit.toLowerCase()) return { refusal: { code: "UNIT_MISMATCH" as const, reason: "The measurement and stated claim use incompatible units." } };
  const percent = round1((measured / declared) * 100); const classI = percent >= 100; const classII = percent >= 80;
  return { percentOfClaim: percent, classI, classII, determinative: classI === classII };
}

export function summarizeTrend(points: Array<{ value: number; unit: string; collectedAt: Date; lotLabel: string | null }>) {
  if (!points.length) return { refusal: { code: "MISSING_VALUE" as const, reason: "No prior samples are available for this SKU." } };
  const units = new Set(points.map(point => point.unit.toLowerCase()));
  if (units.size !== 1) return { refusal: { code: "UNIT_MISMATCH" as const, reason: "Prior samples use mixed units and cannot be summarized safely." } };
  const values = points.map(point => point.value); return { points: [...points].sort((a, b) => b.collectedAt.getTime() - a.collectedAt.getTime()), min: Math.min(...values), max: Math.max(...values), mean: round1(values.reduce((sum, value) => sum + value, 0) / values.length) };
}

export function benchmark(values: number[], customerValue: number) {
  if (!values.length) return undefined; const sorted = [...values].sort((a, b) => a - b); const percentile = round1((sorted.filter(value => value <= customerValue).length / sorted.length) * 100); return { count: sorted.length, min: sorted[0], max: sorted[sorted.length - 1], mean: round1(sorted.reduce((sum, value) => sum + value, 0) / sorted.length), percentile };
}

export function stabilityStatus(input: { monthOffset: number; scheduledFor: Date; now?: Date }) {
  const now = input.now ?? new Date();
  return { monthOffset: input.monthOffset, scheduledFor: input.scheduledFor, due: input.scheduledFor.getTime() <= now.getTime(), remainingDays: Math.max(0, Math.ceil((input.scheduledFor.getTime() - now.getTime()) / 86_400_000)) };
}

export function capacityMultiple(n: number, d: number, throughput: number) { return 1 / (n + ((1 - n) * (1 - d) / throughput)); }
export const formatNumber = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
export const formatDate = (value: Date) => value.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
export const formatCurrency = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
export const formatStatus = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
