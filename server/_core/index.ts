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
import { bobbyAccountBinding, bobbyAccountBindingHealth } from "../accountBinding";
import { nativeSlackIngest, verifyNativeSlackRequest as verifySlackRequest } from "../nativeIngest";
import { mcpHttpHandler } from "../mcpHttp";

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
  app.get("/integrations/bobby/account-binding/health", bobbyAccountBindingHealth);
  app.post("/integrations/bobby/account-binding", bobbyAccountBinding);
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
  app.post("/mcp", mcpHttpHandler);
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
