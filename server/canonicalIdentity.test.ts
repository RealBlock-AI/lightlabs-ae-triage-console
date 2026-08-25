import { describe, expect, it } from "vitest";
import { canReceiveComanCoas, resolveCanonicalUserBySlackIdentity } from "./canonicalIdentity";
import { and, eq } from "drizzle-orm";
import { accountMemberships, accounts, contacts } from "../drizzle/schema";
import { getDb } from "./db";

const dbTest = process.env.DATABASE_URL ? it : it.skip;

describe("canonical identity resolution", () => {
  dbTest("resolves a verified user and its active account memberships from the canonical users table", async () => {
    const result = await resolveCanonicalUserBySlackIdentity({ slackWorkspaceId: "T_DEMO", slackUserId: "U_NORTH_OPS" });
    expect(result.status).toBe("verified");
    expect(result.user?.email).toBe("priya@northwind.demo");
    expect(result.memberships.length).toBeGreaterThan(0);
    expect(result.memberships[0]?.account.id).toBe("acct_northwind");
  });

  dbTest("does not grant a buyer the CoMan-only COA entitlement", async () => {
    expect(await canReceiveComanCoas({ userId: 9001, accountId: "acct_northwind" })).toBe(false);
  });

  dbTest("backfills owner routing and enforces a single active buyer membership per user", async () => {
    const db = await getDb();
    const linkedContacts = await db!.select().from(contacts).where(and(eq(contacts.userId, 9001), eq(contacts.accountId, "acct_northwind")));
    expect(linkedContacts[0]?.internalOwnerUserId).not.toBeNull();
    const activeBuyerMemberships = await db!.select().from(accountMemberships).where(and(eq(accountMemberships.userId, 9001), eq(accountMemberships.membershipType, "buyer"), eq(accountMemberships.status, "active")));
    expect(activeBuyerMemberships).toHaveLength(1);
  });

  dbTest("backfills known HubSpot and testing-platform account identifiers without guessing unmatched accounts", async () => {
    const db = await getDb();
    const northwind = (await db!.select().from(accounts).where(eq(accounts.id, "acct_northwind")).limit(1))[0];
    expect(northwind).toMatchObject({ hubspotCompanyId: "hs_north", testingPlatformAccountId: "co_northwind" });
    const harborline = (await db!.select().from(accounts).where(eq(accounts.id, "acct_harborline")).limit(1))[0];
    expect(harborline?.hubspotCompanyId).toBeNull();
    expect(harborline?.testingPlatformAccountId).toBeNull();
  });

  dbTest("permits a CoMan to hold an additional active account membership and receive COAs only when explicitly enabled", async () => {
    const db = await getDb();
    const id = "am_test_coman_9001_pinecrest";
    await db!.insert(accountMemberships).values({ id, accountId: "acct_pinecrest", userId: 9001, membershipType: "coman", status: "active", buyerUserId: null, internalOwnerUserId: 1, receiveComanCoas: 1, createdAt: new Date(), updatedAt: new Date() }).onDuplicateKeyUpdate({ set: { status: "active", receiveComanCoas: 1, updatedAt: new Date() } });
    try {
      expect(await canReceiveComanCoas({ userId: 9001, accountId: "acct_pinecrest" })).toBe(true);
      const memberships = await db!.select().from(accountMemberships).where(eq(accountMemberships.userId, 9001));
      expect(memberships.filter(membership => membership.status === "active").length).toBeGreaterThan(1);
    } finally {
      await db!.delete(accountMemberships).where(eq(accountMemberships.id, id));
    }
  });
});
