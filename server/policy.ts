export const INTENTS = [
  "ORDER_STATUS", "OPS_SHIPPING", "OPS_DATA_EXPORT", "STABILITY_SCHEDULE",
  "OPS_ORDER_ENTRY", "SPEC_INTAKE", "TEST_RECOMMENDATION", "ASSAY_SCOPE_QUESTION", "PRICING_QUOTE", "RELATIONSHIP_COMMERCIAL", "OOS_RESULT", "LABEL_CLAIM_VARIANCE",
  "HUMAN_ESCALATION_REQUEST", "REGULATORY_LIMIT_QUESTION", "UNKNOWN",
] as const;

export type Intent = (typeof INTENTS)[number];
export type Lane = "auto" | "assisted" | "escalate";

export const CATEGORY_LANE: Readonly<Record<Intent, Lane>> = Object.freeze({
  ORDER_STATUS: "auto", OPS_SHIPPING: "auto", OPS_DATA_EXPORT: "auto", STABILITY_SCHEDULE: "auto",
  OPS_ORDER_ENTRY: "assisted", SPEC_INTAKE: "assisted", TEST_RECOMMENDATION: "assisted", ASSAY_SCOPE_QUESTION: "assisted", PRICING_QUOTE: "assisted", RELATIONSHIP_COMMERCIAL: "assisted", OOS_RESULT: "assisted", LABEL_CLAIM_VARIANCE: "assisted",
  HUMAN_ESCALATION_REQUEST: "escalate", REGULATORY_LIMIT_QUESTION: "escalate", UNKNOWN: "escalate",
});

export const AUTO_TEMPLATE_INTENTS: ReadonlySet<Intent> = new Set<Intent>(["ORDER_STATUS", "OPS_SHIPPING", "OPS_DATA_EXPORT", "STABILITY_SCHEDULE"]);
export const AUTO_CONFIDENCE_FLOOR = 0.9;
export const GENERAL_CONFIDENCE_FLOOR = 0.75;
const severity: Record<Lane, number> = { auto: 0, assisted: 1, escalate: 2 };

export function baseLane(intents: readonly Intent[]): Lane {
  return intents.reduce<Lane>((worst, intent) => severity[CATEGORY_LANE[intent]] > severity[worst] ? CATEGORY_LANE[intent] : worst, "auto");
}

export function demoteLane(current: Lane, candidate: Lane): Lane {
  return severity[candidate] > severity[current] ? candidate : current;
}

export function operationalIntent(text: string): Intent | undefined {
  const lower = text.toLowerCase();
  if (/\$|\b(price|pricing|quote|prop\s?65|regulatory|fda|compliance|result|assay|lead|cadmium|arsenic|fail|pass|spec|quarantine|recall|urgent|today)\b/.test(lower)) return undefined;
  if (/\b(stability|time point|month\s*\d+)\b/.test(lower)) return "STABILITY_SCHEDULE";
  if (/\b(shipping label|shipping labels|pickup|pallet|delivery|driver|shipment)\b/.test(lower)) return "OPS_SHIPPING";
  if (/\b(export|everything we('ve| have) tested|testing history)\b/.test(lower)) return "OPS_DATA_EXPORT";
  if (/\b(where is|where's|status|update|latest).{0,70}\b(order|coa|protein)\b|\b(order|coa).{0,70}\b(status|update|latest)\b/.test(lower)) return "ORDER_STATUS";
  return undefined;
}

export const FORBIDDEN_IN_AUTO = [
  { code: "PRICE", test: /[$£€]\s?\d|\b\d[\d,]*\.?\d*\s?(usd|dollars)\b|\b(price|pricing|quote|invoice)\b/i, reason: "An auto-lane response may not contain pricing." },
  { code: "REGULATORY", test: /\b(prop\s?65|ab\s?899|21\s?cfr|fda|compliant|non-?compliant|misbrand)\b/i, reason: "An auto-lane response may not contain a regulatory citation or compliance conclusion." },
  { code: "VERDICT", test: /\b(pass(es|ed)?|fail(s|ed|ure)?|safe|unsafe|within spec|out of spec|recall)\b/i, reason: "An auto-lane response may not assert a verdict." },
] as const;

export function enforceAutoLaneOutput(lane: Lane, text: string) {
  if (lane !== "auto") return { lane, demotions: [] as string[] };
  const hits = FORBIDDEN_IN_AUTO.filter(rule => rule.test.test(text));
  return hits.length ? { lane: "assisted" as Lane, demotions: hits.map(hit => `Auto-lane output guard ${hit.code}: ${hit.reason}`) } : { lane, demotions: [] as string[] };
}

/* ---------------------------------------------------------------------------
   Gate trace.

   The packet shows the checks in order, top to bottom, and the design is
   explicit about what that list has to contain: passes are shown, not hidden;
   the check that stopped is the only tinted row; and every check after the stop
   is marked "not reached" rather than omitted, because its absence is itself
   information.

   A trace assembled from only the checks that happened to run cannot satisfy
   that. So the list is declared up front from the intents, and the builder
   below fills it in - which also makes the invariants structural: at most one
   stop, nothing recorded after it, and the full declared list always emitted.
--------------------------------------------------------------------------- */

export const GATE_CHECKS = [
  "identity_verified",
  "result_ownership",
  "limit_resolved",
  "serving_basis_agreement",
  "output_guard",
] as const;

export type GateCheck = (typeof GATE_CHECKS)[number];

/** pass: the check ran and cleared. stop: it ran and halted the pipeline.
 *  not_reached: an earlier check stopped first, so this one never ran. */
export type GateStatus = "pass" | "stop" | "not_reached";

export type GateTraceRow = {
  check: GateCheck;
  status: GateStatus;
  /** What it read, or what it changed. Shown mono and muted, right-aligned. */
  read: string;
};

/**
 * Which checks apply to this interaction, in the order they run.
 *
 * Scoped by intent so the trace stays true: an order-status question has no
 * result to own and no serving basis to agree on, and listing those as "not
 * reached" would imply the pipeline stopped short when it did no such thing.
 */
export function declareGateChecks(intents: readonly Intent[]): GateCheck[] {
  // Scoped to what the pipeline can actually record, not to what the intent
  // sounds like it should involve. Result evidence is assembled only for
  // OOS_RESULT (prototype.ts), so declaring result_ownership for a label-claim
  // or regulatory question produced rows nothing could ever fill - and an
  // unfilled row renders as "not reached", which asserts that an earlier check
  // stopped the pipeline. Nothing had. The trace was stating a falsehood about
  // its own run.
  //
  // Widening these predicates is the wrong repair: the fix is to extend result
  // assembly to LABEL_CLAIM_VARIANCE, and to widen this at the same time.
  const reads = intents.includes("OOS_RESULT");
  const limits = reads;
  const serving = reads;
  return GATE_CHECKS.filter(check =>
    check === "result_ownership" ? reads
      : check === "limit_resolved" ? limits
      : check === "serving_basis_agreement" ? serving
      : true);
}

export type GateTraceBuilder = {
  pass(check: GateCheck, read: string): void;
  stop(check: GateCheck, read: string): void;
  stopped(): boolean;
  rows(): GateTraceRow[];
};

export function gateTrace(declared: readonly GateCheck[]): GateTraceBuilder {
  const recorded = new Map<GateCheck, GateTraceRow>();
  const applies = new Set(declared);
  let halted = false;

  const record = (check: GateCheck, status: GateStatus, read: string) => {
    // Once something has stopped, nothing further ran - so nothing further is
    // recorded, whatever the caller does next.
    if (halted || !applies.has(check)) return;
    recorded.set(check, { check, status, read });
    if (status === "stop") halted = true;
  };

  return {
    pass: (check, read) => record(check, "pass", read),
    stop: (check, read) => record(check, "stop", read),
    stopped: () => halted,
    rows: () => declared.map(check => recorded.get(check) ?? { check, status: "not_reached", read: "not reached" }),
  };
}
