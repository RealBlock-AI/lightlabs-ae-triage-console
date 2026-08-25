import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { slackMcpIdentityRequests, teamMembers, users } from "../drizzle/schema";
import { getDb } from "./db";

const now = () => new Date();

export async function capturePendingMcpIdentity(input: { slackWorkspaceId: string; slackUserId: string; enterpriseId?: string | null }) {
  const db = await getDb(); if (!db) return;
  await db.insert(slackMcpIdentityRequests).values({ id: `mcpid_${nanoid(18)}`, slackWorkspaceId: input.slackWorkspaceId, slackUserId: input.slackUserId, enterpriseId: input.enterpriseId ?? null, status: "pending", firstSeenAt: now(), lastSeenAt: now(), approvedTeamMemberId: null, approvedAt: null }).onDuplicateKeyUpdate({ set: { lastSeenAt: now(), enterpriseId: input.enterpriseId ?? null } });
}

export async function listMcpIdentityRequests() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(slackMcpIdentityRequests).where(eq(slackMcpIdentityRequests.status, "pending"));
}

export async function listInternalTeamMembers() {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: teamMembers.id, userId: users.id, name: users.name, email: users.email, role: teamMembers.role, slackWorkspaceId: users.slackWorkspaceId, slackUserId: users.slackUserId }).from(teamMembers).innerJoin(users, eq(teamMembers.userId, users.id));
}

export async function approveMcpIdentityRequest(input: { requestId: string; teamMemberId: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const request = (await db.select().from(slackMcpIdentityRequests).where(and(eq(slackMcpIdentityRequests.id, input.requestId), eq(slackMcpIdentityRequests.status, "pending"))).limit(1))[0];
  if (!request) throw new Error("Pending Slackbot identity request not found.");
  const member = (await db.select().from(teamMembers).where(eq(teamMembers.id, input.teamMemberId)).limit(1))[0];
  if (!member) throw new Error("Internal team member not found.");
  if (!member.userId) throw new Error("Internal team member has not been migrated to a canonical user.");
  const canonicalUser = (await db.select().from(users).where(and(eq(users.id, member.userId), eq(users.role, "admin"))).limit(1))[0];
  if (!canonicalUser) throw new Error("The selected canonical user is not an internal administrator.");
  const occupied = (await db.select().from(users).where(and(eq(users.slackWorkspaceId, request.slackWorkspaceId), eq(users.slackUserId, request.slackUserId))).limit(1))[0];
  if (occupied && occupied.id !== canonicalUser.id) throw new Error("This Slack identity is already assigned to a different canonical user.");
  await db.update(users).set({ slackWorkspaceId: request.slackWorkspaceId, slackUserId: request.slackUserId, loginMethod: "google", identityStatus: "verified", verifiedAt: now() }).where(eq(users.id, canonicalUser.id));
  await db.update(teamMembers).set({ slackWorkspaceId: request.slackWorkspaceId, slackUserId: request.slackUserId }).where(eq(teamMembers.id, member.id));
  await db.update(slackMcpIdentityRequests).set({ status: "approved", approvedTeamMemberId: member.id, approvedAt: now() }).where(eq(slackMcpIdentityRequests.id, request.id));
  return { success: true };
}
