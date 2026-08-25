import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { accountMemberships, contacts, externalSlackIdentityCandidates, interactions, teamMembers, users } from "../drizzle/schema";
import { getDb } from "./db";
import { resolveCanonicalUserBySlackIdentity } from "./canonicalIdentity";

export type ContactBySlackUserStatus = "verified" | "pending_candidate" | "unmapped" | "revoked";

export async function getContactBySlackUser(input: { workspaceId: string; slackUserId: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const canonical = await resolveCanonicalUserBySlackIdentity({ slackWorkspaceId: input.workspaceId, slackUserId: input.slackUserId });
  if (canonical.status === "verified" && canonical.user) {
    const primaryMembership = canonical.memberships[0];
    const contact = primaryMembership ? (await db.select().from(contacts).where(and(eq(contacts.userId, canonical.user.id), eq(contacts.accountId, primaryMembership.account.id))).limit(1))[0] : undefined;
    return { status: "verified" as const, workspace_id: input.workspaceId, slack_user_id: input.slackUserId, user_id: canonical.user.id, contact: { id: contact?.id ?? null, account_id: primaryMembership?.account.id ?? null, name: canonical.user.name }, candidate: null, internal_owner_user_id: primaryMembership?.membership.internalOwnerUserId ?? null };
  }
  if (canonical.status === "pending") return { status: "pending_user" as const, workspace_id: input.workspaceId, slack_user_id: input.slackUserId, user_id: canonical.user?.id ?? null, contact: null, candidate: null };
  const candidate = (await db.select().from(externalSlackIdentityCandidates).where(and(eq(externalSlackIdentityCandidates.slackWorkspaceId, input.workspaceId), eq(externalSlackIdentityCandidates.slackUserId, input.slackUserId), eq(externalSlackIdentityCandidates.status, "pending"))).orderBy(desc(externalSlackIdentityCandidates.lastSeenAt)).limit(1))[0];
  if (candidate) return { status: "pending_candidate" as const, workspace_id: input.workspaceId, slack_user_id: input.slackUserId, contact: null, candidate: { id: candidate.id, first_seen_at: candidate.firstSeenAt, last_seen_at: candidate.lastSeenAt, last_channel_id: candidate.lastChannelId, externally_shared_channel: Boolean(candidate.externallySharedChannel) } };
  return { status: "unmapped" as const, workspace_id: input.workspaceId, slack_user_id: input.slackUserId, contact: null, candidate: null };
}

export async function captureExternalSlackIdentityCandidate(input: { workspaceId: string; slackUserId: string; channelId: string; channelType: string; externallySharedChannel: boolean; sourceTransport: "custom_bridge" | "native_slack"; interactionId: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existingVerified = await getContactBySlackUser({ workspaceId: input.workspaceId, slackUserId: input.slackUserId });
  if (existingVerified.status === "verified") return existingVerified;
  const now = new Date(); const existing = (await db.select().from(externalSlackIdentityCandidates).where(and(eq(externalSlackIdentityCandidates.slackWorkspaceId, input.workspaceId), eq(externalSlackIdentityCandidates.slackUserId, input.slackUserId))).limit(1))[0];
  if (existing) await db.update(externalSlackIdentityCandidates).set({ status: "pending", lastSeenAt: now, lastChannelId: input.channelId, lastChannelType: input.channelType, externallySharedChannel: input.externallySharedChannel ? 1 : 0, sourceTransport: input.sourceTransport, lastInteractionId: input.interactionId, resolvedContactId: null, resolvedAt: null, resolvedByUserId: null }).where(eq(externalSlackIdentityCandidates.id, existing.id));
  else await db.insert(externalSlackIdentityCandidates).values({ id: `esc_${nanoid(18)}`, slackWorkspaceId: input.workspaceId, slackUserId: input.slackUserId, status: "pending", firstSeenAt: now, lastSeenAt: now, lastChannelId: input.channelId, lastChannelType: input.channelType, externallySharedChannel: input.externallySharedChannel ? 1 : 0, sourceTransport: input.sourceTransport, lastInteractionId: input.interactionId, resolvedContactId: null, resolvedAt: null, resolvedByUserId: null });
  return getContactBySlackUser({ workspaceId: input.workspaceId, slackUserId: input.slackUserId });
}

export async function listExternalSlackIdentityCandidates() {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.select().from(externalSlackIdentityCandidates).where(eq(externalSlackIdentityCandidates.status, "pending")).orderBy(desc(externalSlackIdentityCandidates.lastSeenAt));
}

export async function resolveExternalSlackIdentityCandidate(input: { workspaceId: string; slackUserId: string; userId: number; accountId?: string; resolvedByUserId?: string | null }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const candidate = (await db.select().from(externalSlackIdentityCandidates).where(and(eq(externalSlackIdentityCandidates.slackWorkspaceId, input.workspaceId), eq(externalSlackIdentityCandidates.slackUserId, input.slackUserId), eq(externalSlackIdentityCandidates.status, "pending"))).limit(1))[0];
  const user = (await db.select().from(users).where(and(eq(users.id, input.userId), eq(users.identityStatus, "verified"))).limit(1))[0];
  const membershipConditions = [eq(accountMemberships.userId, input.userId), eq(accountMemberships.status, "active")];
  if (input.accountId) membershipConditions.push(eq(accountMemberships.accountId, input.accountId));
  const membership = (await db.select().from(accountMemberships).where(and(...membershipConditions)).limit(1))[0];
  if (!candidate || !user || !membership) return;
  const contact = (await db.select().from(contacts).where(and(eq(contacts.userId, user.id), eq(contacts.accountId, membership.accountId))).limit(1))[0];
  const resolvedAt = new Date();
  await db.update(externalSlackIdentityCandidates).set({ status: "mapped", resolvedContactId: contact?.id ?? null, resolvedAt, resolvedByUserId: input.resolvedByUserId ?? null }).where(eq(externalSlackIdentityCandidates.id, candidate.id));
  const ownerTeamMember = (await db.select().from(teamMembers).where(eq(teamMembers.userId, membership.internalOwnerUserId)).limit(1))[0];
  if (candidate.lastInteractionId) await db.update(interactions).set({ contactId: contact?.id ?? null, accountId: membership.accountId, ownerId: ownerTeamMember?.id ?? null, requestingUserId: user.id }).where(eq(interactions.id, candidate.lastInteractionId));
}
