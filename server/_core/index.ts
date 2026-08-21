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
import { createHmac, timingSafeEqual } from "node:crypto";
import { runTriage } from "../triage";
import { retrieveKnowledge } from "../knowledge";
import { completeHubSpotAuthorization } from "../hubspot";

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
  app.post("/ingest", async (req, res) => {
    const raw = (req as express.Request & { rawBody?: string }).rawBody ?? "";
    const demoMode = process.env.TRIAGE_DEMO_MODE !== "false";
    if (!demoMode && !validSlackRequest(req, raw)) return res.status(401).json({ ok: false, error: "Invalid Slack request signature." });
    const body = req.body as Record<string, unknown>;
    if (body.type === "url_verification") return res.json({ challenge: body.challenge });
    const event = body.event && typeof body.event === "object" ? body.event as Record<string, unknown> : body;
    const eventIsEnvelope = Boolean(body.event);
    const source = eventIsEnvelope ? "slack" : event.source;
    const slackUserId = event.user ?? event.slack_user_id;
    const channel = event.channel;
    const timestamp = event.ts ?? event.timestamp;
    const text = event.text;
    if (source !== "slack" || typeof slackUserId !== "string" || typeof channel !== "string" || typeof timestamp !== "string" || typeof text !== "string") return res.status(400).json({ ok: false, error: "Expected a Slack message event or simplified demo-shaped body." });
    try {
      const workspaceId = typeof body.team_id === "string" ? body.team_id : typeof event.team_id === "string" ? event.team_id : demoMode && !eventIsEnvelope ? "T_DEMO" : null;
      const result = await runTriage({ source: "slack", channelRef: `${channel}|${timestamp}`, slackUserId, slackWorkspaceId: workspaceId, rawText: text });
      return res.json({ ok: true, duplicate: result.duplicate, interactionId: result.interaction.id, acknowledgment: result.interaction.acknowledgment, lane: result.interaction.lane, msToAck: result.interaction.msToAck });
    } catch (error) {
      console.error("ingest failed", error);
      return res.status(500).json({ ok: false, error: "Unable to persist triage interaction." });
    }
  });
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
  app.get("/integrations/hubspot/callback", async (req, res) => {
    if (typeof req.query.error === "string") {
      return res.status(400).send("HubSpot authorization was not completed. Return to the Light Labs integration setup after resolving the HubSpot error.");
    }
    if (typeof req.query.code !== "string" || typeof req.query.state !== "string") {
      return res.status(400).send("Missing HubSpot authorization code. This callback is reserved for the Light Labs HubSpot MCP connection.");
    }
    try {
      await completeHubSpotAuthorization({ code: req.query.code, state: req.query.state });
      return res.status(200).send("HubSpot MCP connection established. You may close this window and return to Light Labs.");
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

function validSlackRequest(req: express.Request, raw: string) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  const timestamp = req.header("x-slack-request-timestamp");
  const signature = req.header("x-slack-signature");
  if (!secret || !timestamp || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${raw}`).digest("hex")}`;
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
