import { describe, expect, it } from "vitest";
import { evaluateTest } from "./domain";
import { toDualVerdict } from "./verdict";

const timestamp = new Date("2026-06-01T00:00:00Z");
const base = {
  test: { specStatus: "in_spec" as const, updatedAt: timestamp },
  result: { concentration: "12.4", unit: "ppb", evaluation: "detected" },
  testLimit: { upperBound: "0.5", lowerBound: null, limitUnit: "ug/serving", limitBasis: "per_serving" as const, updatedAt: timestamp, source: "supplier spec v4", customized: true },
  currentSpec: null,
};

/**
 * The verdict component is built once and reused. These are the three
 * situations the design handoff requires it to cover without a structural
 * change - if one of them needs a different shape, the component is wrong.
 */
describe("dual-answer verdict projection", () => {
  it("projects two serving bases with symmetrical, comparable readings", () => {
    const verdict = evaluateTest({ ...base, sample: { servingSizeGrams: "40", labReportedServingSize: "45" } });
    const dual = toDualVerdict(verdict, { analyte: "lead" });

    expect(dual).toBeDefined();
    expect(dual!.decidingVariable).toBe("serving size");
    expect(dual!.decidingValues).toBe("40 vs 45 g");
    expect(dual!.branches).toHaveLength(2);

    const [a, b] = dual!.branches;
    expect(a.verdict).toBe("in spec");
    expect(a.delta).toBe("by 0.8%");
    expect(a.context).toBe("99.2% of limit");
    expect(b.verdict).toBe("out of spec");
    expect(b.delta).toBe("by 11.6%");
    expect(b.context).toBe("111.6% of limit");
    expect(dual!.reason).toContain("requires a serving size");
  });

  it("keeps the two branches structurally identical - no branch is the default", () => {
    const verdict = evaluateTest({ ...base, sample: { servingSizeGrams: "40", labReportedServingSize: "45" } });
    const [a, b] = toDualVerdict(verdict)!.branches;
    // Same fields, all populated, on both sides. A missing field on one side is
    // how one answer starts reading as the real one.
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    for (const branch of [a, b]) {
      for (const value of Object.values(branch)) expect(String(value).length).toBeGreaterThan(0);
    }
  });

  it("projects a non-detect as two readings, never as zero", () => {
    const verdict = evaluateTest({ ...base, result: { concentration: null, unit: "ppb", evaluation: "non-detect" }, sample: { servingSizeGrams: "40" } });
    const dual = toDualVerdict(verdict, {
      analyte: "lead",
      resultRef: "res_8812",
      halfLod: { value: 0.2, unit: "ug/serving", percentOfBound: 40 },
    });

    expect(dual).toBeDefined();
    expect(dual!.decidingVariable).toBe("how ND is read");
    expect(dual!.branches[0].verdict).toBe("no result");
    expect(dual!.branches[0].context).toBe("a non-detect is not zero");
    expect(dual!.branches[1].verdict).toBe("at ½ LOD");
    expect(dual!.branches[1].context).toBe("40% of limit");
    expect(dual!.reason).toBe("No numeric value is stored for lead on result res_8812. A non-detect is not zero and cannot be compared to a limit.");
  });

  it("projects two competing limits over one measurement", () => {
    const verdict = evaluateTest({ ...base, sample: { servingSizeGrams: "40", labReportedServingSize: "40" } });
    const dual = toDualVerdict(verdict, {
      appliedLimitLabel: "supplier spec v4",
      alternateLimit: {
        label: "PROP65 CA",
        passes: false,
        percentOfBound: 248,
        note: "PROP65 CA limit is an unverified placeholder shown for routing only and may not be quoted.",
      },
    });

    expect(dual).toBeDefined();
    expect(dual!.decidingVariable).toBe("which limit");
    expect(dual!.decidingValues).toBe("supplier spec v4 vs PROP65 CA");
    expect(dual!.branches[0].verdict).toBe("pass");
    expect(dual!.branches[1].verdict).toBe("fail");
    expect(dual!.reason).toContain("unverified placeholder");
  });

  it("returns undefined when there is only one defensible answer", () => {
    const verdict = evaluateTest({ ...base, sample: { servingSizeGrams: "40", labReportedServingSize: "40" } });
    expect(toDualVerdict(verdict)).toBeUndefined();
  });
});
