import { and, eq } from "drizzle-orm";
import { accounts, slackAccountBindings, teamMembers, users } from "../drizzle/schema";
import { getDb } from "./db";
import { capturePendingMcpIdentity } from "./mcpIdentity";
import { resolveCanonicalUserBySlackIdentity } from "./canonicalIdentity";

export type SlackIdentity = { userId: string; workspaceId: string; enterpriseId?: string | null };
export type McpActor =
  | { kind: "staff"; identity: SlackIdentity; teamMemberId: string; teamRole: "ae" | "lab_director" | "admin"; userId: number }
  | { kind: "account"; identity: SlackIdentity; userId: number; accountIds: string[]; contactId: string };

export function readSlackIdentity(value: unknown): SlackIdentity | null {
  if (!value || typeof value !== "object") return null;
  const slack = (value as { slack?: unknown }).slack;
  if (!slack || typeof slack !== "object") return null;
  const record = slack as Record<string, unknown>;
  const userId = typeof record.user_id === "string" ? record.user_id : typeof record.userId === "string" ? record.userId : null;
  const workspaceId = typeof record.team_id === "string" ? record.team_id : typeof record.teamId === "string" ? record.teamId : null;
  const enterpriseId = typeof record.enterprise_id === "string" ? record.enterprise_id : null;
  return userId && workspaceId ? { userId, workspaceId, enterpriseId } : null;
}

export async function resolveMcpActor(identity: SlackIdentity): Promise<McpActor> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const staff = (await db.select({ member: teamMembers, user: users }).from(teamMembers).innerJoin(users, eq(teamMembers.userId, users.id)).where(and(
    eq(teamMembers.slackWorkspaceId, identity.workspaceId),
    eq(teamMembers.slackUserId, identity.userId),
    eq(users.identityStatus, "verified"),
  )).limit(1))[0];
  if (staff?.user && staff.member.userId) {
    return { kind: "staff", identity, teamMemberId: staff.member.id, teamRole: staff.member.role, userId: staff.member.userId };
  }

  const binding = (await db.select().from(slackAccountBindings).where(and(
    eq(slackAccountBindings.slackTeamId, identity.workspaceId),
    eq(slackAccountBindings.slackUserId, identity.userId),
    eq(slackAccountBindings.status, "bound"),
  )).limit(1))[0];
  const canonical = await resolveCanonicalUserBySlackIdentity({ slackWorkspaceId: identity.workspaceId, slackUserId: identity.userId });
  const activeAccountIds = canonical.memberships.map(({ account }) => account.id);
  if (binding?.accountId && binding.contactId && canonical.user && activeAccountIds.includes(binding.accountId)) {
    return { kind: "account", identity, userId: canonical.user.id, contactId: binding.contactId, accountIds: [binding.accountId] };
  }

  await capturePendingMcpIdentity({ slackWorkspaceId: identity.workspaceId, slackUserId: identity.userId, enterpriseId: identity.enterpriseId });
  throw new Error("This signed Slack identity is not approved for Light Labs data. Complete or approve the account binding before retrying.");
}

export async function assertAccountAccess(actor: McpActor, accountId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const account = (await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1))[0];
  if (!account) throw new Error("Light Labs account not found.");
  const allowed = actor.kind === "account"
    ? actor.accountIds.includes(accountId)
    : actor.teamRole === "admin" || actor.teamRole === "lab_director" || account.ownerId === actor.teamMemberId;
  if (!allowed) throw new Error("The signed Slack identity is not authorized for this account.");
  return account;
}
