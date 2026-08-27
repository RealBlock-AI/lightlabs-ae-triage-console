import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { getItemForViewer, getQueue } from "./triage";
import { getKnowledgeSection, retrieveKnowledge } from "./knowledge";
import { createDocumentDelivery, extractDocumentToStaging, ingestSlackDocument, searchSavedDocuments, type FieldMapping } from "./documentVault";
import { readSlackIdentity, resolveMcpActor, type McpActor } from "./mcpAccess";
import { recordIntegrationAudit } from "./integrationAudit";
import { verifyNativeSlackRequest } from "./nativeIngest";

const PROTOCOL_VERSION = "2025-06-18";
const isDiscoveryMethod = (method?: string) => ["initialize", "notifications/initialized", "tools/list", "prompts/list", "resources/list"].includes(method ?? "");
const plainText = (text: string, isError = false) => ({ content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) });
const rich = (text: string, blocks: Array<Record<string, unknown>>, structuredContent?: Record<string, unknown>) => ({ content: [{ type: "text" as const, text }], ...(structuredContent ? { structuredContent } : {}), _meta: { slack: { blocks } } });
const compact = (value: unknown) => JSON.stringify(value, null, 2).slice(0, 11_000);

function queueBlocks(queue: Awaited<ReturnType<typeof getQueue>>) {
  const items = queue.slice(0, 8).map((item: any) => ({ type: "section", text: { type: "mrkdwn", text: `*${item.accountName ?? "Account"}* · ${item.lane}\n${String(item.rawText ?? item.text ?? "").slice(0, 240)}` } }));
  return [{ type: "header", text: { type: "plain_text", text: "Assigned triage queue" } }, ...items] as Array<Record<string, unknown>>;
}

function fileBlocks(title: string, url: string, description: string) {
  return [
    { type: "header", text: { type: "plain_text", text: title.slice(0, 150) } },
    { type: "section", text: { type: "mrkdwn", text: description } },
    { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Download secure file" }, url }] },
  ] as Array<Record<string, unknown>>;
}

function requireActor(actor: McpActor | null) {
  if (!actor) throw new Error("Slack identity metadata is required for data-bearing MCP calls.");
  return actor;
}

function createLightLabsMcpServer(actor: McpActor | null) {
  const server = new McpServer({ name: "light-labs-triage", version: "2.0.0" });
  server.registerResource("lightlabs_capability_map", "lightlabs://capabilities", { title: "Light Labs MCP capability map", mimeType: "application/json", description: "Versioned Light Labs Slack MCP tools, prompts, resources, authorization, and data-handling contract." }, async () => ({
    contents: [{ uri: "lightlabs://capabilities", mimeType: "application/json", text: JSON.stringify({ version: "2.0.0", auth: "Slack Identity Auth plus verified Slack request signature and durable account binding", resources: ["lightlabs://capabilities"], prompts: ["lightlabs.triage_review", "lightlabs.shipping_label_lookup"], toolGroups: ["triage", "documents", "files"] }) }],
  }));
  server.registerPrompt("lightlabs.triage_review", { title: "Review an assigned triage item", description: "Ask Slackbot to retrieve the decision packet, evidence, and next-safe action for an assigned interaction.", argsSchema: { interaction_id: z.string().min(1) } }, ({ interaction_id }) => ({ messages: [{ role: "user", content: { type: "text", text: `Review Light Labs interaction ${interaction_id}. Retrieve only the documented decision packet and do not send an external reply.` } }] }));
  server.registerPrompt("lightlabs.shipping_label_lookup", { title: "Locate saved shipping labels", description: "Ask Slackbot to search the caller's approved account files for a shipment or sample count.", argsSchema: { query: z.string().min(2), account_id: z.string().min(1).optional() } }, ({ query, account_id }) => ({ messages: [{ role: "user", content: { type: "text", text: `Find the saved shipping label or shipment file matching ${query}${account_id ? ` for account ${account_id}` : ""}. Return a secure delivery link only after account authorization.` } }] }));

  server.registerTool("triage.retrieve_knowledge", { title: "Retrieve approved knowledge", description: "Retrieve attributable Light Labs knowledge for the signed caller. Retrieval relevance never authorizes a customer reply.", inputSchema: { query: z.string().min(3), interaction_id: z.string().optional() }, annotations: { readOnlyHint: true }, _meta: { slack: { supportsBlockKit: true } } }, async ({ query, interaction_id }) => {
    requireActor(actor);
    const knowledge = await retrieveKnowledge({ query, interactionId: interaction_id, limit: 3 });
    return rich("Retrieved approved Light Labs knowledge.", [{ type: "header", text: { type: "plain_text", text: "Knowledge retrieval" } }, { type: "section", text: { type: "mrkdwn", text: knowledge.sources.map(source => `*${source.title}*\n${source.url}`).join("\n\n") || "No approved sources matched." } }], { sources: knowledge.sources, retrieval_plan: knowledge.plans, reply_eligibility: knowledge.gate });
  });
  server.registerTool("triage.get_knowledge_section", { title: "Read a cited knowledge section", description: "Read one cited Markdown section after first retrieving its compact plan.", inputSchema: { source_id: z.string().min(1), anchor: z.string().min(1) }, annotations: { readOnlyHint: true } }, async ({ source_id, anchor }) => {
    requireActor(actor);
    const section = await getKnowledgeSection(source_id, anchor);
    return plainText(compact(section));
  });
  server.registerTool("triage.search_queue", { title: "Search assigned triage queue", description: "List only the signed staff caller's assigned triage queue.", inputSchema: { lane: z.enum(["auto", "assisted", "escalate"]).optional() }, annotations: { readOnlyHint: true }, _meta: { slack: { supportsBlockKit: true } } }, async ({ lane }) => {
    const signedActor = requireActor(actor);
    if (signedActor.kind !== "staff") return plainText("Queue data is available only to approved Light Labs staff.", true);
    const queue = await getQueue(signedActor.teamMemberId, lane);
    return rich(`Found ${queue.length} assigned triage item(s).`, queueBlocks(queue), { items: queue });
  });
  server.registerTool("triage.get_interaction", { title: "Get an assigned interaction", description: "Get a decision packet only when the signed staff caller owns the interaction.", inputSchema: { interaction_id: z.string().min(1) }, annotations: { readOnlyHint: true } }, async ({ interaction_id }) => {
    const signedActor = requireActor(actor);
    if (signedActor.kind !== "staff") return plainText("Interaction decision packets are available only to approved Light Labs staff.", true);
    const item = await getItemForViewer(interaction_id, signedActor.teamMemberId);
    return item ? plainText(compact(item)) : plainText("Interaction not found in this AE queue.", true);
  });
  server.registerTool("documents.ingest_slack_file", { title: "Securely ingest a Slack attachment", description: "Read a Slack file only with the persisted workspace installation token, copy it to secure storage, and attach it to the caller-authorized account.", inputSchema: { slack_file_id: z.string().min(3), account_id: z.string().min(1).optional() }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } }, async ({ slack_file_id, account_id }) => {
    const result = await ingestSlackDocument({ actor: requireActor(actor), slackFileId: slack_file_id, accountId: account_id });
    return plainText(compact({ document_id: result.document.id, title: result.document.title, status: result.duplicate ? "already_saved" : "saved" }));
  });
  server.registerTool("documents.extract_to_staging", { title: "Extract document fields to approved staging", description: "Extract document facts into a persistent, auditable staging record that maps only approved field keys to named target tables and columns. It never writes directly to operational tables.", inputSchema: { document_id: z.string().min(1), target_table: z.string().regex(/^[a-z][a-z0-9_]{1,80}$/i), field_mappings: z.array(z.object({ field_key: z.string().regex(/^[a-z][a-z0-9_]{1,80}$/i), target_table: z.string().regex(/^[a-z][a-z0-9_]{1,80}$/i), target_column: z.string().regex(/^[a-z][a-z0-9_]{1,80}$/i), description: z.string().min(3).max(500) })).min(1).max(20) }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } }, async ({ document_id, target_table, field_mappings }) => {
    const mappings: FieldMapping[] = field_mappings.map(mapping => ({ fieldKey: mapping.field_key, targetTable: mapping.target_table, targetColumn: mapping.target_column, description: mapping.description }));
    const result = await extractDocumentToStaging({ actor: requireActor(actor), documentId: document_id, targetTable: target_table, fieldMappings: mappings });
    return rich("Document facts have been extracted into the auditable staging record.", [{ type: "header", text: { type: "plain_text", text: "Document extraction staged" } }, { type: "section", text: { type: "mrkdwn", text: `*Target*: ${result.targetTable}\n*Document*: ${result.document.title}\n\`\`\`${compact(result.values).slice(0, 2800)}\`\`\`` } }], { extraction_id: result.extractionId, target_table: result.targetTable, values: result.values, mappings: result.mappings });
  });
  server.registerTool("files.search_saved", { title: "Search saved account files", description: "Search only files stored for the signed caller's authorized Light Labs account.", inputSchema: { query: z.string().min(2).max(120), account_id: z.string().min(1).optional() }, annotations: { readOnlyHint: true }, _meta: { slack: { supportsBlockKit: true } } }, async ({ query, account_id }) => {
    const files = await searchSavedDocuments({ actor: requireActor(actor), query, accountId: account_id });
    const text = files.length ? files.map(file => `• ${file.title} (${file.name}) — ${file.id}`).join("\n") : "No saved files matched that request.";
    return rich(text, [{ type: "header", text: { type: "plain_text", text: "Saved account files" } }, { type: "section", text: { type: "mrkdwn", text } }], { files });
  });
  server.registerTool("files.get_secure_delivery_link", { title: "Send a secure saved-file link", description: "Create a short-lived secure link for a saved file after account-level authorization and record the delivery audit.", inputSchema: { document_id: z.string().min(1) }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, _meta: { slack: { supportsBlockKit: true } } }, async ({ document_id }) => {
    const result = await createDocumentDelivery({ actor: requireActor(actor), documentId: document_id });
    return rich(`Secure download link created for ${result.document.title}.`, fileBlocks(result.document.title, result.url, `This link is time-limited and was issued to the signed Slack identity.`), { document_id: result.document.id, title: result.document.title, download_url: result.url });
  });
  return server;
}

export async function handleSlackMcp(req: Request, res: Response) {
  if (req.method === "GET" || req.method === "DELETE") return res.status(405).set("Allow", "POST").end();
  const raw = (req as Request & { rawBody?: string }).rawBody ?? "";
  const verification = verifyNativeSlackRequest(req, raw);
  if (!verification.ok) {
    await recordIntegrationAudit({ surface: "mcp", eventType: "signature_rejected", outcome: "rejected", statusCode: 401, metadata: { verificationFailure: verification.reason } });
    return res.status(401).json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid Slack request signature." } });
  }
  const origin = req.header("origin");
  if (origin && !["https://slack.com", "https://app.slack.com"].includes(origin)) return res.status(403).json({ jsonrpc: "2.0", id: null, error: { code: -32002, message: "Unexpected request origin." } });
  const body = req.body as { method?: string; params?: Record<string, unknown> };
  if (!body || typeof body !== "object" || typeof body.method !== "string") return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid JSON-RPC request." } });
  res.setHeader("Mcp-Protocol-Version", PROTOCOL_VERSION);
  let actor: McpActor | null = null;
  if (!isDiscoveryMethod(body.method)) {
    const identity = readSlackIdentity(body.params?._meta);
    if (!identity) return res.status(403).json({ jsonrpc: "2.0", id: null, error: { code: -32003, message: "Signed Slack identity metadata is required." } });
    try { actor = await resolveMcpActor(identity); } catch (error) { return res.status(403).json({ jsonrpc: "2.0", id: null, error: { code: -32003, message: error instanceof Error ? error.message : "Slack identity is not approved." } }); }
  }
  const server = createLightLabsMcpServer(actor);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    if (!res.headersSent) return res.status(500).json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: error instanceof Error ? error.message : "MCP transport error." } });
  } finally {
    await server.close().catch(() => undefined);
  }
}
