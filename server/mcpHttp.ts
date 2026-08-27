import type { RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { teamMembers, users } from "../drizzle/schema";
import { getDb } from "./db";
import { recordIntegrationAudit } from "./integrationAudit";
import { getKnowledgeSection, retrieveKnowledge } from "./knowledge";
import { capturePendingMcpIdentity } from "./mcpIdentity";
import { getItemForViewer, getQueue } from "./triage";
import { verifyNativeSlackRequest as verifySlackRequest } from "./nativeIngest";

export const mcpHttpHandler: RequestHandler = async (req, res) => {
  const raw = (req as typeof req & { rawBody?: string }).rawBody ?? "";
  const verification = verifySlackRequest(req, raw);
  if (!verification.ok) {
    await recordIntegrationAudit({ surface: "mcp", eventType: "signature_rejected", outcome: "rejected", statusCode: 401, metadata: { verificationFailure: verification.reason } });
    return res.status(401).json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid Slack request signature." } });
  }
  res.setHeader("Mcp-Protocol-Version", "2025-06-18");
  const body = req.body as { id?: string | number | null; method?: string; params?: Record<string, unknown> };
  const id = body.id ?? null;
  const respond = (result: unknown) => res.json({ jsonrpc: "2.0", id, result });
  const toolError = (message: string) => respond({ content: [{ type: "text", text: message }], isError: true });
  if (body.method === "initialize") return respond({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "light-labs-triage", version: "1.0.0" } });
  if (body.method === "notifications/initialized") return res.status(202).end();
  if (body.method === "tools/list") return respond({ tools: [
    { name: "triage.retrieve_knowledge", description: "Retrieve attributable Light Labs knowledge for an internal AE. Retrieval relevance never authorizes a customer reply.", inputSchema: { type: "object", additionalProperties: false, required: ["query"], properties: { query: { type: "string", minLength: 3 }, interaction_id: { type: "string" } } } },
    { name: "triage.get_knowledge_section", description: "Read one specifically cited Markdown section after first retrieving its compact plan. Does not return an entire document.", inputSchema: { type: "object", additionalProperties: false, required: ["source_id", "anchor"], properties: { source_id: { type: "string" }, anchor: { type: "string" } } } },
    { name: "triage.search_queue", description: "List only the signed caller's assigned triage queue.", inputSchema: { type: "object", additionalProperties: false, properties: { lane: { type: "string", enum: ["auto", "assisted", "escalate"] } } } },
    { name: "triage.get_interaction", description: "Get a decision packet only when the signed caller owns the interaction.", inputSchema: { type: "object", additionalProperties: false, required: ["interaction_id"], properties: { interaction_id: { type: "string" } } } },
  ] });
  const slackMeta = body.params?._meta as { slack?: { user_id?: string; team_id?: string; enterprise_id?: string | null; userId?: string; teamId?: string } } | undefined;
  const slackUserId = slackMeta?.slack?.user_id ?? slackMeta?.slack?.userId;
  const slackWorkspaceId = slackMeta?.slack?.team_id ?? slackMeta?.slack?.teamId;
  const db = await getDb();
  const member = db && slackUserId && slackWorkspaceId ? (await db.select({ user: users, teamMember: teamMembers }).from(users).innerJoin(teamMembers, eq(teamMembers.userId, users.id)).where(and(eq(users.slackUserId, slackUserId), eq(users.slackWorkspaceId, slackWorkspaceId), eq(users.role, "admin"), eq(users.identityStatus, "verified"))).limit(1))[0] : undefined;
  if (!member) {
    if (slackUserId && slackWorkspaceId) await capturePendingMcpIdentity({ slackUserId, slackWorkspaceId, enterpriseId: slackMeta?.slack?.enterprise_id });
    return res.status(403).json({ jsonrpc: "2.0", id, error: { code: -32003, message: "This signed Slack identity is not approved for Light Labs data. An administrator can approve the pending request in Slack Connections." } });
  }
  if (body.method !== "tools/call") return res.status(404).json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unsupported MCP method." } });
  const tool = body.params?.name;
  const args = (body.params?.arguments ?? {}) as Record<string, unknown>;
  try {
    if (tool === "triage.retrieve_knowledge") {
      const query = typeof args.query === "string" ? args.query : "";
      const interactionId = typeof args.interaction_id === "string" ? args.interaction_id : undefined;
      const knowledge = await retrieveKnowledge({ query, interactionId, limit: 3 });
      return respond({ content: [{ type: "text", text: JSON.stringify({ sources: knowledge.sources, retrieval_plan: knowledge.plans, reply_eligibility: { status: knowledge.gate.status, reasons: knowledge.gate.reasons } }) }] });
    }
    if (tool === "triage.get_knowledge_section") {
      const sourceId = typeof args.source_id === "string" ? args.source_id : "";
      const anchor = typeof args.anchor === "string" ? args.anchor : "";
      const section = await getKnowledgeSection(sourceId, anchor);
      return respond({ content: [{ type: "text", text: JSON.stringify(section) }] });
    }
    if (tool === "triage.search_queue") {
      const lane = args.lane === "auto" || args.lane === "assisted" || args.lane === "escalate" ? args.lane : undefined;
      const queue = await getQueue(member.teamMember.id, lane);
      return respond({ content: [{ type: "text", text: JSON.stringify(queue) }] });
    }
    if (tool === "triage.get_interaction") {
      const interactionId = typeof args.interaction_id === "string" ? args.interaction_id : "";
      const item = await getItemForViewer(interactionId, member.teamMember.id);
      if (!item) return toolError("Interaction not found in this AE queue.");
      return respond({ content: [{ type: "text", text: JSON.stringify(item) }] });
    }
    return toolError("Unknown Light Labs MCP tool.");
  } catch (error) {
    return toolError(error instanceof Error ? error.message : "MCP tool execution failed.");
  }
};
