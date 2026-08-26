import { CATEGORY_LANE, FORBIDDEN_IN_AUTO, INTENTS, type Intent, type Lane } from "./policy";

/**
 * The policy simulator.
 *
 * A place to argue about the lane boundary. It replays interactions that have
 * already happened and asks what a different category-to-lane mapping would
 * have done with them.
 *
 * It never writes. Live routing is untouched by anything in this module - the
 * proposals arrive as an argument and leave as a count.
 */

export type PastItem = {
  id: string;
  intents: unknown;
  lane: Lane;
  draft: string | null;
  evidence: Array<{ citable: boolean; advisory?: boolean; refusalCode?: string; source: string }> | null;
};

export type RiskCode = "contested_serving_basis" | "currency_figure" | "regulatory_citation" | "asserted_verdict";

export const RISK_LABEL: Readonly<Record<RiskCode, string>> = Object.freeze({
  contested_serving_basis: "contested serving basis",
  currency_figure: "currency figure in draft",
  regulatory_citation: "regulatory citation in draft",
  asserted_verdict: "verdict asserted in draft",
});

/**
 * What in this item must not go out without a human.
 *
 * Deliberately built on the same FORBIDDEN_IN_AUTO rules the live output guard
 * uses, so the simulator cannot quietly disagree with the thing it is modelling.
 */
export function risksIn(item: PastItem): RiskCode[] {
  const found: RiskCode[] = [];
  const evidence = item.evidence ?? [];
  if (evidence.some(entry => entry.refusalCode === "SERVING_SIZE_AMBIGUOUS")) found.push("contested_serving_basis");

  const text = item.draft ?? "";
  for (const rule of FORBIDDEN_IN_AUTO) {
    if (!rule.test.test(text)) continue;
    if (rule.code === "PRICE") found.push("currency_figure");
    else if (rule.code === "REGULATORY") found.push("regulatory_citation");
    else if (rule.code === "VERDICT") found.push("asserted_verdict");
  }
  return found;
}

export function firstIntent(intents: unknown): Intent | undefined {
  if (!Array.isArray(intents)) return undefined;
  return intents.find((value): value is Intent => typeof value === "string" && (INTENTS as readonly string[]).includes(value));
}

export type SimulationResult = {
  consideredItems: number;
  changedItems: number;
  unsafeItems: number;
  breakdown: Array<{ code: RiskCode; label: string; count: number }>;
  /** Ids of the unsafe items, so the AE can open them rather than trust a count. */
  unsafeSample: string[];
};

/**
 * What a proposed mapping would have done.
 *
 * An item "would have routed differently" when the proposal moves its category
 * to a lane other than the one it actually took. Of those, an item is unsafe
 * only when the proposal would have sent it automatically - moving something
 * to escalate is never the dangerous direction.
 */
export function simulate(items: readonly PastItem[], proposals: Partial<Record<Intent, Lane>>): SimulationResult {
  const counts = new Map<RiskCode, number>();
  const unsafeSample: string[] = [];
  let considered = 0;
  let changed = 0;
  let unsafe = 0;

  for (const item of items) {
    const intent = firstIntent(item.intents);
    if (!intent) continue;
    // The denominator is the whole replayable corpus - "214 of 1,842 past
    // items" - not just the categories that were moved.
    considered += 1;
    const proposed = proposals[intent];
    // Only categories the AE has actually moved can change anything.
    if (!proposed || proposed === CATEGORY_LANE[intent]) continue;
    if (item.lane === proposed) continue;
    changed += 1;

    if (proposed !== "auto") continue;
    const risks = risksIn(item);
    if (!risks.length) continue;
    unsafe += 1;
    if (unsafeSample.length < 50) unsafeSample.push(item.id);
    for (const risk of risks) counts.set(risk, (counts.get(risk) ?? 0) + 1);
  }

  return {
    consideredItems: considered,
    changedItems: changed,
    unsafeItems: unsafe,
    breakdown: Array.from(counts.keys())
      .map(code => ({ code, label: RISK_LABEL[code], count: counts.get(code) ?? 0 }))
      .sort((a, b) => b.count - a.count),
    unsafeSample,
  };
}
