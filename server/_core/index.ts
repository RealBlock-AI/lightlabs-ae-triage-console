import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { teamMembers, users } from "../../drizzle/schema";
import { getItemForViewer, getQueue } from "../triage";
import { getKnowledgeSection, retrieveKnowledge } from "../knowledge";
import { completeHubSpotAuthorization } from "../hubspot";
import { capturePendingMcpIdentity } from "../mcpIdentity";
import { recordIntegrationAudit } from "../integrationAudit";
import { customBotHealth, customBotIngest } from "../customBot";
import { bobbyHealth, bobbyMcp } from "../bobby";
import { nativeSlackIngest, verifyNativeSlackRequest as verifySlackRequest } from "../nativeIngest";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb", verify: (req, _res, buffer) => { (req as express.Request & { rawBody?: string }).rawBody = buffer.toString("utf8"); } }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(["/ingest", "/mcp"], (req, res, next) => { const startedAt = Date.now(); res.on("finish", () => { const body = req.body as Record<string, unknown> | undefined; const event = body?.event && typeof body.event === "object" ? body.event as Record<string, unknown> : body; const slackMeta = body?.params && typeof body.params === "object" ? (body.params as Record<string, unknown>)._meta as { slack?: { user_id?: string; team_id?: string; userId?: string; teamId?: string } } | undefined : undefined; const workspaceId = typeof body?.team_id === "string" ? body.team_id : typeof event?.team_id === "string" ? event.team_id : slackMeta?.slack?.team_id ?? slackMeta?.slack?.teamId ?? null; const userId = typeof event?.user === "string" ? event.user : slackMeta?.slack?.user_id ?? slackMeta?.slack?.userId ?? null; void recordIntegrationAudit({ surface: req.path === "/mcp" ? "mcp" : "slack_ingest", eventType: req.path === "/mcp" ? String(body?.method ?? "unknown") : String(body?.type ?? event?.type ?? "unknown"), outcome: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "rejected" : "accepted", statusCode: res.statusCode, slackWorkspaceId: workspaceId, slackUserId: userId, method: req.path === "/mcp" ? String(body?.method ?? "unknown") : null, toolName: req.path === "/mcp" && body?.params && typeof body.params === "object" ? String((body.params as Record<string, unknown>).name ?? "") || null : null, metadata: { durationMs: Date.now() - startedAt, isEventEnvelope: Boolean(body?.event) } }); }); next(); });
  app.post("/ingest", nativeSlackIngest);
  app.get("/integrations/slack-bot/health", customBotHealth);
  app.post("/integrations/slack-bot/ingest", customBotIngest);
  app.get("/integrations/bobby/health", bobbyHealth);
  app.post("/integrations/bobby/mcp", bobbyMcp);
  app.post("/knowledge/retrieve", async (req, res) => {
    const query = typeof req.body?.query === "string" ? req.body.query : "";
    const interactionId = typeof req.body?.interaction_id === "string" ? req.body.interaction_id : undefined;
    try {
      const result = await retrieveKnowledge({ query, interactionId, limit: 3 });
      return res.json({ sources: result.sources });
    } catch (error) {
      return res.status(400).json({ sources: [], error: error instanceof Error ? error.message : "Knowledge retrieval failed." });
    }
  });
  app.post("/mcp", async (req, res) => {
    const raw = (req as express.Request & { rawBody?: string }).rawBody ?? "";
    const verification = verifySlackRequest(req, raw);
    if (!verification.ok) { await recordIntegrationAudit({ surface: "mcp", eventType: "signature_rejected", outcome: "rejected", statusCode: 401, metadata: { verificationFailure: verification.reason } }); return res.status(401).json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid Slack request signature." } }); }
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
    const slackUserId = slackMeta?.slack?.user_id ?? slackMeta?.slack?.userId; const slackWorkspaceId = slackMeta?.slack?.team_id ?? slackMeta?.slack?.teamId;
    const db = await getDb(); const member = db && slackUserId && slackWorkspaceId ? (await db.select({ user: users, teamMember: teamMembers }).from(users).innerJoin(teamMembers, eq(teamMembers.userId, users.id)).where(and(eq(users.slackUserId, slackUserId), eq(users.slackWorkspaceId, slackWorkspaceId), eq(users.role, "admin"), eq(users.identityStatus, "verified"))).limit(1))[0] : undefined;
    if (!member) { if (slackUserId && slackWorkspaceId) await capturePendingMcpIdentity({ slackUserId, slackWorkspaceId, enterpriseId: slackMeta?.slack?.enterprise_id }); return res.status(403).json({ jsonrpc: "2.0", id, error: { code: -32003, message: "This signed Slack identity is not approved for Light Labs data. An administrator can approve the pending request in Slack Connections." } }); }
    if (body.method !== "tools/call") return res.status(404).json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unsupported MCP method." } });
    const tool = body.params?.name; const args = (body.params?.arguments ?? {}) as Record<string, unknown>;
    try {
      if (tool === "triage.retrieve_knowledge") {
        const query = typeof args.query === "string" ? args.query : ""; const interactionId = typeof args.interaction_id === "string" ? args.interaction_id : undefined; const knowledge = await retrieveKnowledge({ query, interactionId, limit: 3 });
        return respond({ content: [{ type: "text", text: JSON.stringify({ sources: knowledge.sources, retrieval_plan: knowledge.plans, reply_eligibility: { status: knowledge.gate.status, reasons: knowledge.gate.reasons } }) }] });
      }
      if (tool === "triage.get_knowledge_section") { const sourceId = typeof args.source_id === "string" ? args.source_id : ""; const anchor = typeof args.anchor === "string" ? args.anchor : ""; const section = await getKnowledgeSection(sourceId, anchor); return respond({ content: [{ type: "text", text: JSON.stringify(section) }] }); }
      if (tool === "triage.search_queue") { const lane = args.lane === "auto" || args.lane === "assisted" || args.lane === "escalate" ? args.lane : undefined; const queue = await getQueue(member.teamMember.id, lane); return respond({ content: [{ type: "text", text: JSON.stringify(queue) }] }); }
      if (tool === "triage.get_interaction") { const interactionId = typeof args.interaction_id === "string" ? args.interaction_id : ""; const item = await getItemForViewer(interactionId, member.teamMember.id); if (!item) return toolError("Interaction not found in this AE queue."); return respond({ content: [{ type: "text", text: JSON.stringify(item) }] }); }
      return toolError("Unknown Light Labs MCP tool.");
    } catch (error) { return toolError(error instanceof Error ? error.message : "MCP tool execution failed."); }
  });
  app.get("/integrations/hubspot/callback", async (req, res) => {
    if (typeof req.query.error === "string") {
      return res.status(400).send("HubSpot authorization was not completed. Return to the Light Labs integration setup after resolving the HubSpot error.");
    }
    if (typeof req.query.code !== "string" || typeof req.query.state !== "string") {
      return res.status(400).send("Missing HubSpot authorization code. This callback is reserved for the Light Labs HubSpot MCP connection.");
    }
    try {
      await completeHubSpotAuthorization({ code: req.query.code, state: req.query.state });
      return res.redirect(303, "/integrations/hubspot?connected=1");
    } catch (error) {
      return res.status(400).send(error instanceof Error ? `HubSpot authorization failed: ${error.message}` : "HubSpot authorization failed.");
    }
  });
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
