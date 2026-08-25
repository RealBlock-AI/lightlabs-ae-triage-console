import { describe, expect, it } from "vitest";
import { brandsForComan, COMANS_PER_OWNER, DIRECT_BRANDS_PER_OWNER, portfolioTotals } from "./portfolioModel";

describe("owner portfolio model", () => {
  it("creates the requested direct brand and Co-Man account targets", () => {
    expect(DIRECT_BRANDS_PER_OWNER).toBe(120);
    expect(COMANS_PER_OWNER).toBe(40);
  });

  it("keeps every Co-Man portfolio between five and fifteen brands", () => {
    const counts = Array.from({ length: COMANS_PER_OWNER }, (_, index) => brandsForComan(index + 1));
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...counts)).toBeLessThanOrEqual(15);
    expect(portfolioTotals().totalManagedAccounts).toBe(portfolioTotals().directBrands + portfolioTotals().comans + portfolioTotals().brandsUnderComans);
  });
});

