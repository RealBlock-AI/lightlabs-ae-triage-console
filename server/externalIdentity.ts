import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { accounts, contactIdentities, contacts, externalSlackIdentityCandidates, interactions } from "../drizzle/schema";
import { getDb } from "./db";

export type ContactBySlackUserStatus = "verified" | "pending_candidate" | "unmapped" | "revoked";

export async function getContactBySlackUser(input: { workspaceId: string; slackUserId: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const identity = (await db.select({ identity: contactIdentities, contact: contacts }).from(contactIdentities).leftJoin(contacts, eq(contactIdentities.contactId, contacts.id)).where(and(eq(contactIdentities.provider, "slack"), eq(contactIdentities.tenantId, input.workspaceId), eq(contactIdentities.externalId, input.slackUserId))).limit(1))[0];
  if (identity?.identity.verificationStatus === "verified" && identity.contact) return { status: "verified" as const, workspace_id: input.workspaceId, slack_user_id: input.slackUserId, contact: { id: identity.contact.id, account_id: identity.contact.accountId, name: identity.contact.name }, candidate: null };
  if (identity?.identity.verificationStatus === "revoked") return { status: "revoked" as const, workspace_id: input.workspaceId, slack_user_id: input.slackUserId, contact: null, candidate: null };
  const candidate = (await db.select().from(externalSlackIdentityCandidates).where(and(eq(externalSlackIdentityCandidates.slackWorkspaceId, input.workspaceId), eq(externalSlackIdentityCandidates.slackUserId, input.slackUserId), eq(externalSlackIdentityCandidates.status, "pending"))).orderBy(desc(externalSlackIdentityCandidates.lastSeenAt)).limit(1))[0];
  if (candidate) return { status: "pending_candidate" as const, workspace_id: input.workspaceId, slack_user_id: input.slackUserId, contact: null, candidate: { id: candidate.id, first_seen_at: candidate.firstSeenAt, last_seen_at: candidate.lastSeenAt, last_channel_id: candidate.lastChannelId, externally_shared_channel: Boolean(candidate.externallySharedChannel) } };
  return { status: "unmapped" as const, workspace_id: input.workspaceId, slack_user_id: input.slackUserId, contact: null, candidate: null };
}

export async function captureExternalSlackIdentityCandidate(input: { workspaceId: string; slackUserId: string; channelId: string; channelType: string; externallySharedChannel: boolean; sourceTransport: "custom_bridge" | "native_slack"; interactionId: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existingVerified = await getContactBySlackUser({ workspaceId: input.workspaceId, slackUserId: input.slackUserId });
  if (existingVerified.status === "verified" || existingVerified.status === "revoked") return existingVerified;
  const now = new Date(); const existing = (await db.select().from(externalSlackIdentityCandidates).where(and(eq(externalSlackIdentityCandidates.slackWorkspaceId, input.workspaceId), eq(externalSlackIdentityCandidates.slackUserId, input.slackUserId))).limit(1))[0];
  if (existing) await db.update(externalSlackIdentityCandidates).set({ status: "pending", lastSeenAt: now, lastChannelId: input.channelId, lastChannelType: input.channelType, externallySharedChannel: input.externallySharedChannel ? 1 : 0, sourceTransport: input.sourceTransport, lastInteractionId: input.interactionId, resolvedContactId: null, resolvedAt: null, resolvedByUserId: null }).where(eq(externalSlackIdentityCandidates.id, existing.id));
  else await db.insert(externalSlackIdentityCandidates).values({ id: `esc_${nanoid(18)}`, slackWorkspaceId: input.workspaceId, slackUserId: input.slackUserId, status: "pending", firstSeenAt: now, lastSeenAt: now, lastChannelId: input.channelId, lastChannelType: input.channelType, externallySharedChannel: input.externallySharedChannel ? 1 : 0, sourceTransport: input.sourceTransport, lastInteractionId: input.interactionId, resolvedContactId: null, resolvedAt: null, resolvedByUserId: null });
  return getContactBySlackUser({ workspaceId: input.workspaceId, slackUserId: input.slackUserId });
}

export async function listExternalSlackIdentityCandidates() {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.select().from(externalSlackIdentityCandidates).where(eq(externalSlackIdentityCandidates.status, "pending")).orderBy(desc(externalSlackIdentityCandidates.lastSeenAt));
}

export async function resolveExternalSlackIdentityCandidate(input: { workspaceId: string; slackUserId: string; contactId: string; resolvedByUserId?: string | null }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const candidate = (await db.select().from(externalSlackIdentityCandidates).where(and(eq(externalSlackIdentityCandidates.slackWorkspaceId, input.workspaceId), eq(externalSlackIdentityCandidates.slackUserId, input.slackUserId), eq(externalSlackIdentityCandidates.status, "pending"))).limit(1))[0];
  const contact = (await db.select().from(contacts).where(eq(contacts.id, input.contactId)).limit(1))[0]; const account = contact ? (await db.select().from(accounts).where(eq(accounts.id, contact.accountId)).limit(1))[0] : undefined;
  if (!candidate || !contact) return;
  const resolvedAt = new Date();
  await db.update(externalSlackIdentityCandidates).set({ status: "mapped", resolvedContactId: input.contactId, resolvedAt, resolvedByUserId: input.resolvedByUserId ?? null }).where(eq(externalSlackIdentityCandidates.id, candidate.id));
  if (candidate.lastInteractionId) await db.update(interactions).set({ contactId: contact.id, accountId: contact.accountId, ownerId: account?.ownerId ?? null }).where(eq(interactions.id, candidate.lastInteractionId));
}
