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
