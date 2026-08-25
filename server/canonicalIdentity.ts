import { and, eq } from "drizzle-orm";
import { accountMemberships, accounts, users } from "../drizzle/schema";
import { getDb } from "./db";

export async function resolveCanonicalUserBySlackIdentity(input: { slackWorkspaceId: string; slackUserId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const user = (await db.select().from(users).where(and(
    eq(users.slackWorkspaceId, input.slackWorkspaceId),
    eq(users.slackUserId, input.slackUserId),
  )).limit(1))[0];

  if (!user) return { status: "unmapped" as const, user: null, memberships: [] };
  if (user.identityStatus !== "verified") return { status: "pending" as const, user, memberships: [] };

  const memberships = await db.select({
    membership: accountMemberships,
    account: accounts,
  }).from(accountMemberships).innerJoin(accounts, eq(accountMemberships.accountId, accounts.id)).where(and(
    eq(accountMemberships.userId, user.id),
    eq(accountMemberships.status, "active"),
  ));

  return {
    status: memberships.length ? "verified" as const : "verified_without_active_account" as const,
    user,
    memberships,
  };
}

export async function canReceiveComanCoas(input: { userId: number; accountId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const membership = (await db.select().from(accountMemberships).where(and(
    eq(accountMemberships.userId, input.userId),
    eq(accountMemberships.accountId, input.accountId),
    eq(accountMemberships.membershipType, "coman"),
    eq(accountMemberships.status, "active"),
    eq(accountMemberships.receiveComanCoas, 1),
  )).limit(1))[0];
  return Boolean(membership);
}
