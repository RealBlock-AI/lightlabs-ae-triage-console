import { describe, expect, it } from "vitest";
import { getOwnerPortfolio, listOwnerPortfolios, seedOwnerPortfolios } from "./portfolioService";

describe("owner portfolio service", () => {
  it("seeds each owner with direct brands, Co-Mans, nested brand portfolios, and scoped permissions", async () => {
    await seedOwnerPortfolios();
    const owners = await listOwnerPortfolios();

    expect(owners).toHaveLength(2);
    for (const owner of owners) {
      expect(owner.directBrandCount).toBeGreaterThanOrEqual(120);
      expect(owner.comanCount).toBe(40);
      expect(owner.brandsUnderComanCount).toBeGreaterThanOrEqual(200);
      expect(owner.totalManagedAccounts).toBe(owner.directBrandCount + owner.comanCount + owner.brandsUnderComanCount);
    }

    const detail = await getOwnerPortfolio(owners[0].id);
    const firstComan = detail.accounts.find(account => account.accountType === "Co-Man");
    const nestedBrand = detail.accounts.find(account => account.portfolio.includes("portfolio"));
    expect(firstComan?.portfolio).toMatch(/(?:5|6|7|8|9|10|11|12|13|14|15) associated brands/);
    expect(nestedBrand?.contactScope).toMatch(/Co-Man contact permissions/);
  });
});
