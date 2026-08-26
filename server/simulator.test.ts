import { describe, expect, it } from "vitest";
import { firstIntent, risksIn, simulate, type PastItem } from "./simulator";

const item = (over: Partial<PastItem> = {}): PastItem => ({
  id: "int_1", intents: ["OOS_RESULT"], lane: "escalate", draft: "", evidence: [], ...over,
});

describe("policy simulator", () => {
  it("reads risk from the same rules the live output guard uses", () => {
    expect(risksIn(item({ evidence: [{ citable: false, refusalCode: "SERVING_SIZE_AMBIGUOUS", source: "domain" }] })))
      .toEqual(["contested_serving_basis"]);
    expect(risksIn(item({ draft: "The cost is $450 per sample." }))).toContain("currency_figure");
    expect(risksIn(item({ draft: "This is Prop 65 compliant." }))).toContain("regulatory_citation");
    expect(risksIn(item({ draft: "The lot passed." }))).toContain("asserted_verdict");
    expect(risksIn(item({ draft: "Your order is on the instrument." }))).toEqual([]);
  });

  it("counts an item as changed only when the proposal moves its lane", () => {
    const items = [
      item({ id: "a", lane: "escalate" }),
      item({ id: "b", lane: "auto" }), // already where the proposal would put it
    ];
    const result = simulate(items, { OOS_RESULT: "auto" });
    expect(result.consideredItems).toBe(2);
    expect(result.changedItems).toBe(1);
  });

  it("ignores a category the AE has not moved off its live lane", () => {
    // OOS_RESULT is assisted in live policy; proposing assisted changes nothing.
    const result = simulate([item()], { OOS_RESULT: "assisted" });
    // The item still counts toward the corpus the question is asked against.
    expect(result.consideredItems).toBe(1);
    expect(result.changedItems).toBe(0);
  });

  it("only counts danger when the proposal would send automatically", () => {
    const risky = item({ id: "r", lane: "escalate", draft: "The cost is $450 per sample." });
    // Moving toward auto is the dangerous direction...
    expect(simulate([risky], { OOS_RESULT: "auto" }).unsafeItems).toBe(1);
    // ...moving toward escalate never is.
    expect(simulate([risky], { ORDER_STATUS: "escalate" }).unsafeItems).toBe(0);
  });

  it("breaks the danger down and names the items, so a count can be checked", () => {
    const items = [
      item({ id: "a", lane: "escalate", draft: "The price is $450." }),
      item({ id: "b", lane: "escalate", evidence: [{ citable: false, refusalCode: "SERVING_SIZE_AMBIGUOUS", source: "domain" }] }),
      item({ id: "c", lane: "escalate", draft: "Your export is ready." }),
    ];
    const result = simulate(items, { OOS_RESULT: "auto" });
    expect(result.changedItems).toBe(3);
    expect(result.unsafeItems).toBe(2);
    expect(result.unsafeSample.map(entry => entry.id)).toEqual(["a", "b"]);
    // Each sampled item says why it is unsafe, so the count can be audited.
    expect(result.unsafeSample[0].risks).toEqual(["currency figure in draft"]);
    expect(result.unsafeSample[1].risks).toEqual(["contested serving basis"]);
    expect(result.breakdown.map(entry => entry.code).sort()).toEqual(["contested_serving_basis", "currency_figure"]);
  });

  it("skips rows with no recognisable intent", () => {
    expect(firstIntent(["not_real", "OOS_RESULT"])).toBe("OOS_RESULT");
    expect(firstIntent(null)).toBeUndefined();
    expect(simulate([item({ intents: null })], { OOS_RESULT: "auto" }).consideredItems).toBe(0);
  });
});
