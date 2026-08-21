import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { integrationAuditEvents } from "../drizzle/schema";
import { getDb } from "./db";

export async function recordIntegrationAudit(event: { surface: "slack_ingest" | "mcp"; eventType: string; outcome: "accepted" | "rejected" | "error"; statusCode: number; slackWorkspaceId?: string | null; slackUserId?: string | null; method?: string | null; toolName?: string | null; interactionId?: string | null; metadata?: Record<string, unknown> }) {
  try { const db = await getDb(); if (!db) return; await db.insert(integrationAuditEvents).values({ id: `audit_${nanoid(18)}`, surface: event.surface, eventType: event.eventType, outcome: event.outcome, statusCode: event.statusCode, slackWorkspaceId: event.slackWorkspaceId ?? null, slackUserId: event.slackUserId ?? null, method: event.method ?? null, toolName: event.toolName ?? null, interactionId: event.interactionId ?? null, metadata: event.metadata ?? {}, createdAt: new Date() }); } catch (error) { console.error("integration audit write failed", error); }
}

export async function listIntegrationAudit(surface?: "slack_ingest" | "mcp") { const db = await getDb(); if (!db) return []; const query = db.select().from(integrationAuditEvents).orderBy(desc(integrationAuditEvents.createdAt)).limit(25); return surface ? db.select().from(integrationAuditEvents).where(eq(integrationAuditEvents.surface, surface)).orderBy(desc(integrationAuditEvents.createdAt)).limit(25) : query; }
