import { asc, eq, sql } from "drizzle-orm";
import { accountRelationships, accounts, comanContactBrandAccess, contacts, supportOwners } from "../drizzle/schema";
import { getDb } from "./db";
import { brandsForComan, COMANS_PER_OWNER, DIRECT_BRANDS_PER_OWNER, PORTFOLIO_OWNERS } from "./portfolioModel";

const now = () => new Date();
const pad = (value: number, width = 3) => String(value).padStart(width, "0");

export async function seedOwnerPortfolios() {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const timestamp = now();
  const ownerRows = PORTFOLIO_OWNERS.map(owner => ({ ...owner, active: 1, createdAt: timestamp, updatedAt: timestamp }));
  const accountRows: Array<typeof accounts.$inferInsert> = [];
  const relationshipRows: Array<typeof accountRelationships.$inferInsert> = [];
  const contactRows: Array<typeof contacts.$inferInsert> = [];
  const accessRows: Array<typeof comanContactBrandAccess.$inferInsert> = [];

  for (const owner of PORTFOLIO_OWNERS) {
    for (let brandIndex = 1; brandIndex <= DIRECT_BRANDS_PER_OWNER; brandIndex += 1) {
      const id = `acct_${owner.id}_direct_brand_${pad(brandIndex)}`;
      accountRows.push({ id, name: `${owner.name.split(" ")[0]} Direct Brand ${pad(brandIndex)}`, accountType: "brand", annualSpend: 18000 + brandIndex * 250, slackChannel: null, ownerId: owner.id, ownerUserId: null, hubspotPortalId: "demo_portal", hubspotCompanyId: `hs_${id}`, testingPlatformAccountId: `tp_${id}` });
    }

    for (let comanIndex = 1; comanIndex <= COMANS_PER_OWNER; comanIndex += 1) {
      const comanId = `acct_${owner.id}_coman_${pad(comanIndex, 2)}`;
      const comanName = `${owner.name.split(" ")[0]} Co-Man ${pad(comanIndex, 2)}`;
      accountRows.push({ id: comanId, name: comanName, accountType: "coman", annualSpend: 95000 + comanIndex * 1200, slackChannel: null, ownerId: owner.id, ownerUserId: null, hubspotPortalId: "demo_portal", hubspotCompanyId: `hs_${comanId}`, testingPlatformAccountId: `tp_${comanId}` });

      const primaryContactId = `contact_${owner.id}_coman_${pad(comanIndex, 2)}_primary`;
      const restrictedContactId = `contact_${owner.id}_coman_${pad(comanIndex, 2)}_restricted`;
      contactRows.push(
        { id: primaryContactId, userId: null, accountId: comanId, internalOwnerUserId: null, name: `${comanName} Portfolio Lead`, email: `portfolio.lead.${owner.id}.${comanIndex}@demo.lightlabs`, slackUserId: null, slackWorkspaceId: null, hubspotPortalId: "demo_portal", hubspotContactId: `hs_${primaryContactId}`, identityStatus: "verified", verifiedAt: timestamp, roleTitle: "Portfolio Lead", hasPlatformLogin: 1 },
        { id: restrictedContactId, userId: null, accountId: comanId, internalOwnerUserId: null, name: `${comanName} Quality Approver`, email: `quality.approver.${owner.id}.${comanIndex}@demo.lightlabs`, slackUserId: null, slackWorkspaceId: null, hubspotPortalId: "demo_portal", hubspotContactId: `hs_${restrictedContactId}`, identityStatus: "verified", verifiedAt: timestamp, roleTitle: "Quality Approver", hasPlatformLogin: 1 },
      );

      for (let brandIndex = 1; brandIndex <= brandsForComan(comanIndex); brandIndex += 1) {
        const brandId = `acct_${owner.id}_coman_${pad(comanIndex, 2)}_brand_${pad(brandIndex, 2)}`;
        accountRows.push({ id: brandId, name: `${comanName} Brand ${pad(brandIndex, 2)}`, accountType: "brand", annualSpend: 28000 + brandIndex * 500, slackChannel: null, ownerId: owner.id, ownerUserId: null, hubspotPortalId: "demo_portal", hubspotCompanyId: `hs_${brandId}`, testingPlatformAccountId: `tp_${brandId}` });
        relationshipRows.push({ id: `rel_${comanId}_${brandId}`, comanAccountId: comanId, brandAccountId: brandId, relationshipType: "coman_brand", active: 1, createdAt: timestamp, updatedAt: timestamp });
        accessRows.push({ id: `access_${primaryContactId}_${brandId}`, contactId: primaryContactId, comanAccountId: comanId, brandAccountId: brandId, canView: 1, canEdit: 1, approvalScope: "edit", active: 1, createdAt: timestamp, updatedAt: timestamp });
        if (brandIndex % 2 === 0) accessRows.push({ id: `access_${restrictedContactId}_${brandId}`, contactId: restrictedContactId, comanAccountId: comanId, brandAccountId: brandId, canView: 1, canEdit: brandIndex % 4 === 0 ? 1 : 0, approvalScope: brandIndex % 4 === 0 ? "edit" : "view", active: 1, createdAt: timestamp, updatedAt: timestamp });
      }
    }
  }

  await db.insert(supportOwners).values(ownerRows).onDuplicateKeyUpdate({ set: { name: sql`values(name)`, email: sql`values(email)`, role: sql`values(role)`, active: 1, updatedAt: timestamp } });
  await db.insert(accounts).values(accountRows).onDuplicateKeyUpdate({ set: { name: sql`values(name)`, accountType: sql`values(account_type)`, annualSpend: sql`values(annual_spend)`, ownerId: sql`values(owner_id)`, hubspotPortalId: sql`values(hubspot_portal_id)`, hubspotCompanyId: sql`values(hubspot_company_id)`, testingPlatformAccountId: sql`values(testing_platform_account_id)` } });
  await db.insert(accountRelationships).values(relationshipRows).onDuplicateKeyUpdate({ set: { active: 1, updatedAt: timestamp } });
  await db.insert(contacts).values(contactRows).onDuplicateKeyUpdate({ set: { accountId: sql`values(account_id)`, name: sql`values(name)`, email: sql`values(email)`, identityStatus: "verified", verifiedAt: timestamp, roleTitle: sql`values(role_title)`, hasPlatformLogin: 1 } });
  await db.insert(comanContactBrandAccess).values(accessRows).onDuplicateKeyUpdate({ set: { canView: sql`values(can_view)`, canEdit: sql`values(can_edit)`, approvalScope: sql`values(approval_scope)`, active: 1, updatedAt: timestamp } });
  return { owners: ownerRows.length, accounts: accountRows.length, relationships: relationshipRows.length, contactAccessRules: accessRows.length };
}

export async function listOwnerPortfolios() {
  await seedOwnerPortfolios(); const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const [owners, accountRows, relationships] = await Promise.all([db.select().from(supportOwners).where(eq(supportOwners.active, 1)).orderBy(asc(supportOwners.name)), db.select().from(accounts), db.select().from(accountRelationships).where(eq(accountRelationships.active, 1))]);
  const nestedBrandIds = new Set(relationships.map(row => row.brandAccountId));
  return owners.map(owner => {
    const owned = accountRows.filter(account => account.ownerId === owner.id);
    const comans = owned.filter(account => account.accountType === "coman");
    const directBrands = owned.filter(account => account.accountType === "brand" && !nestedBrandIds.has(account.id));
    const brandsUnderComans = owned.filter(account => nestedBrandIds.has(account.id));
    return { id: owner.id, name: owner.name, role: owner.role, directBrandCount: directBrands.length, comanCount: comans.length, brandsUnderComanCount: brandsUnderComans.length, totalManagedAccounts: directBrands.length + comans.length + brandsUnderComans.length };
  });
}

export async function getOwnerPortfolio(ownerId: string) {
  const portfolios = await listOwnerPortfolios(); const summary = portfolios.find(portfolio => portfolio.id === ownerId); if (!summary) throw new Error("Support owner not found.");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const [accountRows, relationships, contactRows, accessRows] = await Promise.all([db.select().from(accounts).where(eq(accounts.ownerId, ownerId)).orderBy(asc(accounts.name)), db.select().from(accountRelationships).where(eq(accountRelationships.active, 1)), db.select().from(contacts), db.select().from(comanContactBrandAccess).where(eq(comanContactBrandAccess.active, 1))]);
  const ownedIds = new Set(accountRows.map(account => account.id)); const ownedRelationships = relationships.filter(row => ownedIds.has(row.comanAccountId));
  const relationshipByBrand = new Map(ownedRelationships.map(row => [row.brandAccountId, row]));
  const brandsByComan = new Map<string, number>(); for (const row of ownedRelationships) brandsByComan.set(row.comanAccountId, (brandsByComan.get(row.comanAccountId) ?? 0) + 1);
  const contactsByComan = new Map<string, number>(); for (const contact of contactRows.filter(contact => ownedIds.has(contact.accountId))) contactsByComan.set(contact.accountId, (contactsByComan.get(contact.accountId) ?? 0) + 1);
  const accessByBrand = new Map<string, number>(); for (const access of accessRows.filter(access => ownedIds.has(access.brandAccountId))) accessByBrand.set(access.brandAccountId, (accessByBrand.get(access.brandAccountId) ?? 0) + 1);
  const names = new Map(accountRows.map(account => [account.id, account.name]));
  return { summary, accounts: accountRows.map(account => {
    const relationship = relationshipByBrand.get(account.id);
    if (account.accountType === "coman") return { id: account.id, name: account.name, accountType: "Co-Man", portfolio: `${brandsByComan.get(account.id) ?? 0} associated brands`, contactScope: `${contactsByComan.get(account.id) ?? 0} contacts with scoped brand access` };
    if (relationship) return { id: account.id, name: account.name, accountType: "Brand", portfolio: `In ${names.get(relationship.comanAccountId) ?? "Co-Man"} portfolio`, contactScope: `${accessByBrand.get(account.id) ?? 0} Co-Man contact permissions` };
    return { id: account.id, name: account.name, accountType: "Brand", portfolio: "Direct owner portfolio", contactScope: "Direct brand account" };
  }) };
}
