import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { bobbySupportRequests, contactIdentities, contacts, hubspotContextSnapshots } from "../drizzle/schema";
import { getDb } from "./db";
import { getContactBySlackUser } from "./externalIdentity";
import { recordIntegrationAudit } from "./integrationAudit";
import { retrieveKnowledge } from "./knowledge";
import { runTriage } from "./triage";

function secretMatches(provided: string | undefined) {
  const expected = process.env.BOBBY_MCP_TOKEN;
  if (!expected || !provided || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function hasValidBobbyCredential(req: Request) {
  const authorization = req.header("authorization");
  return secretMatches(authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined);
}

export function bobbyHealth(req: Request, res: Response) {
  if (!hasValidBobbyCredential(req)) { res.setHeader("WWW-Authenticate", "Bearer realm=\"light-labs-bobby\""); return res.status(401).json({ ok: false, error: "Unauthorized Bobby credential." }); }
  return res.json({ ok: true, service: "light-labs-bobby-support" });
}

type BobbyRequest = { request_id: string; schema_version: string; requested_at: string; customer: { slack_user_id: string; slack_team_id: string; is_external?: boolean }; conversation: { channel_id: string; channel_type: "channel" | "im" | "group" | "mpim"; thread_ts?: string; messages: Array<{ ts: string; user_id: string; role: string; text: string; files?: Array<{ name?: string; mimetype?: string }> }> }; analysis?: { question?: string; urgency?: string } };
type BobbyResponseStatus = "answered" | "needs_more_info" | "escalate" | "no_match";

function parsedRequest(input: unknown): BobbyRequest | undefined {
  const body = input as Record<string, unknown>; const customer = body?.customer as Record<string, unknown> | undefined; const conversation = body?.conversation as Record<string, unknown> | undefined; const messages = conversation?.messages;
  if (typeof body?.request_id !== "string" || typeof body.schema_version !== "string" || typeof body.requested_at !== "string" || typeof customer?.slack_user_id !== "string" || typeof customer?.slack_team_id !== "string" || typeof conversation?.channel_id !== "string" || typeof conversation?.channel_type !== "string" || !Array.isArray(messages) || !messages.length) return undefined;
  if (!body.request_id.trim() || !customer.slack_user_id.trim() || !customer.slack_team_id.trim() || Number.isNaN(Date.parse(body.requested_at)) || !["channel", "im", "group", "mpim"].includes(conversation.channel_type)) return undefined;
  const safeMessages = messages.filter((message): message is Record<string, unknown> => Boolean(message) && typeof message === "object").map(message => ({ ts: typeof message.ts === "string" ? message.ts : "", user_id: typeof message.user_id === "string" ? message.user_id : "", role: typeof message.role === "string" ? message.role : "customer", text: typeof message.text === "string" ? message.text : "", files: Array.isArray(message.files) ? message.files.map(file => ({ name: typeof (file as Record<string, unknown>)?.name === "string" ? (file as Record<string, unknown>).name as string : undefined, mimetype: typeof (file as Record<string, unknown>)?.mimetype === "string" ? (file as Record<string, unknown>).mimetype as string : undefined })) : undefined })).filter(message => message.text.trim());
  if (!safeMessages.length) return undefined;
  return { request_id: body.request_id, schema_version: body.schema_version, requested_at: body.requested_at, customer: { slack_user_id: customer.slack_user_id, slack_team_id: customer.slack_team_id, is_external: customer.is_external === true }, conversation: { channel_id: conversation.channel_id, channel_type: conversation.channel_type as BobbyRequest["conversation"]["channel_type"], thread_ts: typeof conversation.thread_ts === "string" ? conversation.thread_ts : undefined, messages: safeMessages }, analysis: typeof body.analysis === "object" && body.analysis ? { question: typeof (body.analysis as Record<string, unknown>).question === "string" ? (body.analysis as Record<string, unknown>).question as string : undefined, urgency: typeof (body.analysis as Record<string, unknown>).urgency === "string" ? (body.analysis as Record<string, unknown>).urgency as string : undefined } : undefined };
}

function safeResponse(requestId: string, status: BobbyResponseStatus, reasons: string[], suggestedReply: string, interactionId: string | null = null) {
  return { request_id: requestId, status, answer_markdown: null, confidence: null, sources: [], suggested_reply: suggestedReply, follow_up_questions: status === "needs_more_info" ? ["Please share the relevant Light Labs order, lot, or product name so the team can locate the right record."] : [], ticket: { created: false, id: null, url: null }, policy: { verified_to_reply: false, reasons }, interaction_id: interactionId };
}

export async function resolveBobbySupportRequest(input: BobbyRequest) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existing = (await db.select().from(bobbySupportRequests).where(eq(bobbySupportRequests.requestId, input.request_id)).limit(1))[0];
  if (existing) return { duplicate: true, response: existing.response };
  const identity = (await db.select({ identity: contactIdentities, contact: contacts }).from(contactIdentities).innerJoin(contacts, eq(contactIdentities.contactId, contacts.id)).where(and(eq(contactIdentities.provider, "slack"), eq(contactIdentities.tenantId, input.customer.slack_team_id), eq(contactIdentities.externalId, input.customer.slack_user_id), eq(contactIdentities.verificationStatus, "verified"))).limit(1))[0];
  let status: BobbyResponseStatus; let response: Record<string, unknown>; let interactionId: string | null = null;
  if (!identity) { status = "no_match"; response = safeResponse(input.request_id, status, ["No verified Light Labs contact mapping exists for this Slack identity."], "Thanks — I’ve routed this to the Light Labs team so we can verify the account context."); }
  else {
    const snapshot = (await db.select().from(hubspotContextSnapshots).where(and(eq(hubspotContextSnapshots.contactId, identity.contact.id), eq(hubspotContextSnapshots.status, "available"), gt(hubspotContextSnapshots.retrievedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))).orderBy(desc(hubspotContextSnapshots.retrievedAt)).limit(1))[0];
    const lastText = input.conversation.messages.at(-1)?.text ?? "";
    const triage = await runTriage({ source: "bobby", channelRef: `bobby|${input.conversation.channel_id}|${input.request_id}`, externalEventId: input.request_id, sourceSchemaVersion: `bobby-support-${input.schema_version}`, threadRef: input.conversation.thread_ts ?? null, sourceReceivedAt: new Date(input.requested_at), slackUserId: input.customer.slack_user_id, slackWorkspaceId: input.customer.slack_team_id, rawText: lastText }); interactionId = triage.interaction.id;
    if (!snapshot) { status = "escalate"; response = safeResponse(input.request_id, status, ["The verified contact does not have a fresh approved CRM context snapshot."], "Thanks — I’ve routed this to the Light Labs team for review.", interactionId); }
    else if (lastText.trim().length < 3) { status = "needs_more_info"; response = safeResponse(input.request_id, status, ["The customer message did not contain enough detail to identify a safe support request."], "I can help route this. Please share the relevant order, lot, or product name.", interactionId); }
    else { status = "escalate"; response = safeResponse(input.request_id, status, ["No versioned customer-response template has been approved for this support request.", "Classification and retrieval signals are non-dispositive."], "Thanks — I’ve routed this to the Light Labs team for review.", interactionId); }
  }
  await db.insert(bobbySupportRequests).values({ requestId: input.request_id, schemaVersion: input.schema_version, slackWorkspaceId: input.customer.slack_team_id, slackUserId: input.customer.slack_user_id, interactionId, status, response, createdAt: new Date(), updatedAt: new Date() });
  return { duplicate: false, response };
}

export async function bobbyMcp(req: Request, res: Response) {
  if (!hasValidBobbyCredential(req)) { res.setHeader("WWW-Authenticate", "Bearer realm=\"light-labs-bobby\""); await recordIntegrationAudit({ surface: "bobby", eventType: "credential_rejected", outcome: "rejected", statusCode: 401, metadata: {} }); return res.status(401).json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid Bobby credential." } }); }
  res.setHeader("Mcp-Protocol-Version", "2025-06-18"); const body = req.body as { id?: string | number | null; method?: string; params?: Record<string, unknown> }; const id = body.id ?? null; const respond = (result: unknown) => res.json({ jsonrpc: "2.0", id, result });
  if (body.method === "initialize") return respond({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "light-labs-bobby-support", version: "0.1.0" } });
  if (body.method === "notifications/initialized") return res.status(202).end();
  if (body.method === "tools/list") return respond({
    tools: [{
      name: "resolve_support_request",
      description: "Resolve one Bobby support request through verified Light Labs identity and deterministic safety policy. Never posts to Slack.",
      inputSchema: {
        type: "object",
        additionalProperties: true,
        required: ["request_id", "schema_version", "requested_at", "customer", "conversation"],
      },
    }, {
      name: "search_knowledge",
      description: "Retrieve attributed Light Labs knowledge sources with deterministic relevance scores and answer-gate reasons. Scores are retrieval relevance, not model confidence.",
      inputSchema: { type: "object", additionalProperties: false, properties: { query: { type: "string", minLength: 3 }, interaction_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 5 } }, required: ["query"] },
    }, {
      name: "get_contact_by_slack_user",
      description: "Return safe verified, pending-candidate, unmapped, or revoked identity state for a Slack workspace and user. Never infer customer email.",
      inputSchema: { type: "object", additionalProperties: false, properties: { slack_team_id: { type: "string", minLength: 1 }, slack_user_id: { type: "string", minLength: 1 } }, required: ["slack_team_id", "slack_user_id"] },
    }],
  });
  if (body.method !== "tools/call") return res.status(404).json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unsupported Bobby MCP method or tool." } });
  const params = body.params ?? {}; const toolArgs = params.arguments as Record<string, unknown> | undefined;
  if (params.name === "search_knowledge") {
    if (typeof toolArgs?.query !== "string" || toolArgs.query.trim().length < 3) return res.status(400).json({ jsonrpc: "2.0", id, error: { code: -32602, message: "search_knowledge requires a query of at least three characters." } });
    const startedAt = Date.now();
    try { const result = await retrieveKnowledge({ query: toolArgs.query, interactionId: typeof toolArgs.interaction_id === "string" ? toolArgs.interaction_id : undefined, limit: typeof toolArgs.limit === "number" ? toolArgs.limit : undefined }); await recordIntegrationAudit({ surface: "bobby", eventType: "search_knowledge", outcome: "accepted", statusCode: 200, method: "tools/call", toolName: "search_knowledge", interactionId: typeof toolArgs.interaction_id === "string" ? toolArgs.interaction_id : null, metadata: { sourceCount: result.sources.length, topScore: result.sources[0]?.score ?? 0, gate: result.gate.status, durationMs: Date.now() - startedAt } }); return respond({ content: [{ type: "text", text: JSON.stringify(result) }] }); }
    catch { await recordIntegrationAudit({ surface: "bobby", eventType: "search_knowledge", outcome: "error", statusCode: 500, method: "tools/call", toolName: "search_knowledge", metadata: { durationMs: Date.now() - startedAt } }); return res.status(500).json({ jsonrpc: "2.0", id, error: { code: -32603, message: "Light Labs could not retrieve knowledge safely." } }); }
  }
  if (params.name === "get_contact_by_slack_user") {
    if (typeof toolArgs?.slack_team_id !== "string" || typeof toolArgs.slack_user_id !== "string" || !toolArgs.slack_team_id.trim() || !toolArgs.slack_user_id.trim()) return res.status(400).json({ jsonrpc: "2.0", id, error: { code: -32602, message: "get_contact_by_slack_user requires slack_team_id and slack_user_id." } });
    const startedAt = Date.now();
    try { const result = await getContactBySlackUser({ workspaceId: toolArgs.slack_team_id, slackUserId: toolArgs.slack_user_id }); await recordIntegrationAudit({ surface: "bobby", eventType: "get_contact_by_slack_user", outcome: "accepted", statusCode: 200, slackWorkspaceId: toolArgs.slack_team_id, slackUserId: toolArgs.slack_user_id, method: "tools/call", toolName: "get_contact_by_slack_user", metadata: { status: result.status, durationMs: Date.now() - startedAt } }); return respond({ content: [{ type: "text", text: JSON.stringify(result) }] }); }
    catch { await recordIntegrationAudit({ surface: "bobby", eventType: "get_contact_by_slack_user", outcome: "error", statusCode: 500, method: "tools/call", toolName: "get_contact_by_slack_user", metadata: { durationMs: Date.now() - startedAt } }); return res.status(500).json({ jsonrpc: "2.0", id, error: { code: -32603, message: "Light Labs could not resolve the Slack identity safely." } }); }
  }
  if (params.name !== "resolve_support_request") return res.status(404).json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unsupported Bobby MCP method or tool." } });
  const request = parsedRequest(params.arguments); if (!request) return res.status(400).json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid support request; send the documented minimal contract with no private file URLs or callback URL." } });
  const startedAt = Date.now();
  try { const resolved = await resolveBobbySupportRequest(request); const response = resolved.response as { status?: string; interaction_id?: string | null }; await recordIntegrationAudit({ surface: "bobby", eventType: "resolve_support_request", outcome: "accepted", statusCode: 200, slackWorkspaceId: request.customer.slack_team_id, slackUserId: request.customer.slack_user_id, method: "tools/call", toolName: "resolve_support_request", interactionId: response.interaction_id ?? null, metadata: { requestId: request.request_id, duplicate: resolved.duplicate, status: response.status ?? "unknown", durationMs: Date.now() - startedAt } }); return respond({ content: [{ type: "text", text: JSON.stringify(resolved.response) }] }); }
  catch (error) { await recordIntegrationAudit({ surface: "bobby", eventType: "resolve_support_request", outcome: "error", statusCode: 500, metadata: { durationMs: Date.now() - startedAt } }); return res.status(500).json({ jsonrpc: "2.0", id, error: { code: -32603, message: "Light Labs could not safely resolve the request." } }); }
}
