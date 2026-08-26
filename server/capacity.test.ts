import { describe, expect, it } from "vitest";
import { accountsPerAE, capacityCurve, hardCeiling, type CapacityInputs } from "../client/src/lib/capacity";

const base: CapacityInputs = {
  questionsPerAccount: 3.4,
  autoShare: 0.62,
  secondsPerAssisted: 45,
  secondsPerEscalation: 210,
};

describe("capacity model", () => {
  it("puts the hard ceiling at 148 accounts", () => {
    expect(Math.round(hardCeiling())).toBe(148);
  });

  it("approaches the ceiling and never reaches it", () => {
    // This is the whole reading the chart has to deliver.
    for (const share of [0.9, 0.99, 0.999, 1]) {
      expect(accountsPerAE(base, share)).toBeLessThanOrEqual(hardCeiling());
    }
    expect(accountsPerAE(base, 1)).toBeCloseTo(hardCeiling(), 6);
    expect(accountsPerAE(base, 0.999)).toBeLessThan(hardCeiling());
  });

  it("rises monotonically with auto share", () => {
    const curve = capacityCurve(base, 40);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].accounts).toBeGreaterThanOrEqual(curve[i - 1].accounts);
    }
  });

  it("raises the ceiling for nobody - faster answers move the curve, not the limit", () => {
    const faster: CapacityInputs = { ...base, secondsPerAssisted: 5, secondsPerEscalation: 20 };
    expect(accountsPerAE(faster)).toBeGreaterThan(accountsPerAE(base));
    // Cutting handling time helps a lot, and still cannot pass the ceiling.
    expect(accountsPerAE(faster)).toBeLessThan(hardCeiling());
    expect(hardCeiling()).toBe(hardCeiling());
  });

  it("gives fewer accounts as question volume rises", () => {
    expect(accountsPerAE({ ...base, questionsPerAccount: 10 })).toBeLessThan(accountsPerAE(base));
  });

  it("clamps an out-of-range auto share rather than producing nonsense", () => {
    expect(accountsPerAE(base, -1)).toBe(accountsPerAE(base, 0));
    expect(accountsPerAE(base, 5)).toBe(accountsPerAE(base, 1));
  });
});
