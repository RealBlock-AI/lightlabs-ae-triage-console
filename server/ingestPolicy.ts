import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ingestChannelPolicies } from "../drizzle/schema";
import { getDb } from "./db";

export type IngestTransport = "native_slack" | "custom_bridge";
export type AuthoritativeTransport = IngestTransport | "disabled";
const now = () => new Date();

export async function evaluateIngestPolicy(input: { workspaceId: string | null; channelId: string; transport: IngestTransport }) {
  if (!input.workspaceId) return input.transport === "native_slack" ? { allowed: true as const, reason: "native_without_workspace_policy" } : { allowed: false as const, reason: "bridge_requires_workspace_policy" };
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const exactPolicy = (await db.select().from(ingestChannelPolicies).where(and(eq(ingestChannelPolicies.slackWorkspaceId, input.workspaceId), eq(ingestChannelPolicies.channelId, input.channelId))).limit(1))[0];
  const workspacePolicy = exactPolicy ? undefined : (await db.select().from(ingestChannelPolicies).where(and(eq(ingestChannelPolicies.slackWorkspaceId, input.workspaceId), eq(ingestChannelPolicies.channelId, "*"))).limit(1))[0];
  const policy = exactPolicy ?? workspacePolicy;
  if (!policy) return input.transport === "native_slack" ? { allowed: true as const, reason: "native_default" } : { allowed: true as const, reason: "bridge_permissive_default" };
  if (!policy.enabled || policy.authoritativeTransport === "disabled") return { allowed: false as const, reason: "channel_disabled" };
  if (policy.authoritativeTransport !== input.transport) return { allowed: false as const, reason: `authoritative_${policy.authoritativeTransport}` };
  return { allowed: true as const, reason: workspacePolicy ? "workspace_authoritative_transport" : "authoritative_transport" };
}

export async function listIngestPolicies() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(ingestChannelPolicies).orderBy(ingestChannelPolicies.updatedAt).limit(20);
}

export async function setIngestPolicy(input: { workspaceId: string; channelId: string; authoritativeTransport: AuthoritativeTransport; enabled: boolean }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existing = (await db.select({ id: ingestChannelPolicies.id }).from(ingestChannelPolicies).where(and(eq(ingestChannelPolicies.slackWorkspaceId, input.workspaceId), eq(ingestChannelPolicies.channelId, input.channelId))).limit(1))[0];
  if (existing) await db.update(ingestChannelPolicies).set({ authoritativeTransport: input.authoritativeTransport, enabled: input.enabled ? 1 : 0, updatedAt: now() }).where(eq(ingestChannelPolicies.id, existing.id));
  else await db.insert(ingestChannelPolicies).values({ id: `ipol_${nanoid(18)}`, slackWorkspaceId: input.workspaceId, channelId: input.channelId, authoritativeTransport: input.authoritativeTransport, enabled: input.enabled ? 1 : 0, createdAt: now(), updatedAt: now() });
  return { success: true };
}
