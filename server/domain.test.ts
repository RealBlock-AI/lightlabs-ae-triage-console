import { describe, expect, it } from "vitest";
import { capacityMultiple, evaluateTest, percentOfLabelClaim, stabilityStatus } from "./domain";

const timestamp = new Date("2026-06-01T00:00:00Z");
const base = {
  test: { specStatus: "in_spec" as const, updatedAt: timestamp },
  result: { concentration: "12.4", unit: "ppb", evaluation: "detected" },
  testLimit: { upperBound: "0.5", lowerBound: null, limitUnit: "ug/serving", limitBasis: "per_serving" as const, updatedAt: timestamp, source: "Applied snapshot", customized: true },
  currentSpec: null,
};

describe("deterministic domain safety", () => {
  it("escalates a serving-size verdict flip without choosing a branch", () => {
    const result = evaluateTest({ ...base, sample: { servingSizeGrams: "40", labReportedServingSize: "45" } });
    expect(result.agreement).toBe("disagrees");
    expect(result.disagreementCause).toBe("serving_size_ambiguous");
    expect(result.branches).toHaveLength(2);
    expect(result.branches?.map(branch => branch.passes)).toEqual([true, false]);
  });

  it("calculates matching serving sizes against the applied limit snapshot", () => {
    const result = evaluateTest({ ...base, sample: { servingSizeGrams: "40", labReportedServingSize: "40" } });
    expect(result.agreement).toBe("agrees");
    expect(result.computed?.percentOfBound).toBe(99.2);
  });

  it("detects a stale platform verdict before treating a comparison as settled", () => {
    const result = evaluateTest({ ...base, test: { ...base.test, updatedAt: new Date("2026-05-01T00:00:00Z") }, testLimit: { ...base.testLimit, updatedAt: new Date("2026-06-02T00:00:00Z") }, sample: { servingSizeGrams: "40", labReportedServingSize: "40" } });
    expect(result.agreement).toBe("disagrees");
    expect(result.disagreementCause).toBe("stale_verdict");
  });

  it("uses lower bounds for potency-style comparisons", () => {
    const result = evaluateTest({ test: { specStatus: "out_spec", updatedAt: timestamp }, result: { concentration: "78", unit: "IU", evaluation: "detected" }, testLimit: { upperBound: null, lowerBound: "80", limitUnit: "IU", limitBasis: null, updatedAt: timestamp, source: "Potency snapshot", customized: false }, sample: {}, currentSpec: null });
    expect(result.computed?.boundType).toBe("lower");
    expect(result.computed?.percentOfBound).toBe(97.5);
    expect(result.agreement).toBe("agrees");
  });

  it("refuses non-detect values rather than treating them as zero", () => {
    const result = evaluateTest({ ...base, result: { concentration: null, unit: "ppb", evaluation: "non-detect" }, sample: { servingSizeGrams: "40" } });
    expect(result.agreement).toBe("not_computable");
    expect(result.refusal?.code).toBe("NON_DETECT");
  });

  it("shows both label-claim branches without asserting the nutrient class", () => {
    const result = percentOfLabelClaim({ concentration: "890", unit: "IU", evaluation: "detected" }, { value: "1000", unit: "IU" });
    expect(result).toMatchObject({ percentOfClaim: 89, classI: false, classII: true, determinative: false });
  });

  it("uses the named non-circular capacity equation", () => {
    expect(capacityMultiple(.05, .68, 6.7)).toBeCloseTo(10.5, 0);
  });

  it("calculates a not-yet-due stability time point without interpretation", () => {
    const result = stabilityStatus({ monthOffset: 6, scheduledFor: new Date("2026-07-01T00:00:00Z"), now: new Date("2026-05-01T00:00:00Z") });
    expect(result).toMatchObject({ monthOffset: 6, due: false, remainingDays: 61 });
  });
});
