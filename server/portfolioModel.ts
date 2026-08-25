export type PortfolioOwnerSeed = { id: string; name: string; email: string; role: "ae" | "am" };

export const PORTFOLIO_OWNERS: PortfolioOwnerSeed[] = [
  { id: "owner_sarah", name: "Sarah Chen", email: "sarah.chen@lightlabs.demo", role: "ae" },
  { id: "owner_marcus", name: "Marcus Reid", email: "marcus.reid@lightlabs.demo", role: "am" },
];

export const DIRECT_BRANDS_PER_OWNER = 120;
export const COMANS_PER_OWNER = 40;

export function brandsForComan(comanOrdinal: number) {
  return 5 + ((comanOrdinal - 1) % 11);
}

export function portfolioTotals() {
  const brandsUnderComans = Array.from({ length: COMANS_PER_OWNER }, (_, index) => brandsForComan(index + 1)).reduce((total, count) => total + count, 0);
  return { directBrands: DIRECT_BRANDS_PER_OWNER, comans: COMANS_PER_OWNER, brandsUnderComans, totalManagedAccounts: DIRECT_BRANDS_PER_OWNER + COMANS_PER_OWNER + brandsUnderComans };
}
