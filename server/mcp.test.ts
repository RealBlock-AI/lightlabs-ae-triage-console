import { createHmac } from "node:crypto";
import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureDemoData } from "./triage";
import { getDb } from "./db";
import { mcpHttpHandler } from "./mcpHttp";
import { slackMcpIdentityRequests } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";

const signedHeaders = (payload: string) => { const timestamp = Math.floor(Date.now() / 1000).toString(); return { "content-type": "application/json", accept: "application/json, text/event-stream", "x-slack-request-timestamp": timestamp, "x-slack-signature": `v0=${createHmac("sha256", process.env.SLACK_SIGNING_SECRET!).update(`v0:${timestamp}:${payload}`).digest("hex")}` }; };
async function readMcpResponse(response: Response) {
  const raw = await response.text();
  const json = raw.trim().startsWith("event:")
    ? raw.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).at(-1)
    : raw;
  if (!json) throw new Error("MCP endpoint returned an empty response.");
  return JSON.parse(json) as Record<string, unknown>;
}
let server: Server;
let baseUrl: string;

describe("signed Slack Identity Auth MCP endpoint", () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json({ verify: (req, _res, buffer) => { (req as express.Request & { rawBody?: string }).rawBody = buffer.toString("utf8"); } }));
    app.all("/mcp", mcpHttpHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Unable to start isolated MCP test server.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  it("allows a signed Slackbot discovery request to list only the constrained Light Labs tools before per-user identity is supplied", async () => {
    await ensureDemoData();
    const payload = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    const response = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: signedHeaders(payload), body: payload });
    const body = await readMcpResponse(response) as { result?: { tools?: Array<{ name: string }> } };
    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-protocol-version")).toBe("2025-06-18");
    expect(body.result?.tools?.map(tool => tool.name)).toEqual(expect.arrayContaining(["triage.retrieve_knowledge", "triage.get_knowledge_section", "triage.search_queue", "triage.get_interaction", "documents.ingest_slack_file", "documents.extract_to_staging", "files.search_saved", "files.get_secure_delivery_link"]));
  });

  it("supports the Streamable HTTP initialize, prompt discovery, and resource discovery lifecycle without issuing an in-memory session", async () => {
    const initializePayload = JSON.stringify({ jsonrpc: "2.0", id: 3, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "inspector", version: "test" } } });
    const initialized = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: signedHeaders(initializePayload), body: initializePayload });
    const initializeBody = await readMcpResponse(initialized) as { result?: { protocolVersion?: string; capabilities?: { tools?: unknown; prompts?: unknown; resources?: unknown } } };
    expect(initialized.status).toBe(200);
    expect(initializeBody.result?.protocolVersion).toBe("2025-06-18");
    expect(initialized.headers.get("mcp-session-id")).toBeNull();

    const promptsPayload = JSON.stringify({ jsonrpc: "2.0", id: 4, method: "prompts/list", params: {} });
    const prompts = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: signedHeaders(promptsPayload), body: promptsPayload });
    const promptBody = await readMcpResponse(prompts) as { result?: { prompts?: Array<{ name: string }> } };
    expect(promptBody.result?.prompts?.map(prompt => prompt.name)).toEqual(expect.arrayContaining(["lightlabs.triage_review", "lightlabs.shipping_label_lookup"]));

    const resourcesPayload = JSON.stringify({ jsonrpc: "2.0", id: 5, method: "resources/list", params: {} });
    const resources = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: signedHeaders(resourcesPayload), body: resourcesPayload });
    const resourceBody = await readMcpResponse(resources) as { result?: { resources?: Array<{ uri: string }> } };
    expect(resourceBody.result?.resources?.map(resource => resource.uri)).toContain("lightlabs://capabilities");
  });

  it("rejects an otherwise signed request presented from an unexpected web origin", async () => {
    const payload = JSON.stringify({ jsonrpc: "2.0", id: 6, method: "tools/list", params: {} });
    const response = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { ...signedHeaders(payload), origin: "https://attacker.example" }, body: payload });
    expect(response.status).toBe(403);
  });

  it("rejects a missing Slack signature before MCP discovery can disclose capabilities", async () => {
    const payload = JSON.stringify({ jsonrpc: "2.0", id: 61, method: "tools/list", params: {} });
    const response = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: payload });
    const body = await response.json() as { error?: { code?: number; message?: string } };
    expect(response.status).toBe(401);
    expect(body.error).toMatchObject({ code: -32001, message: "Invalid Slack request signature." });
  });

  it("returns native Slack Block Kit metadata only after a signed approved staff identity is resolved", async () => {
    await ensureDemoData();
    const payload = JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "triage.search_queue", arguments: {}, _meta: { slack: { user_id: "U_AE_SARAH", team_id: "T_DEMO" } } } });
    const response = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: signedHeaders(payload), body: payload });
    const body = await readMcpResponse(response) as { result?: { content?: Array<{ type: string; text: string }>; _meta?: { slack?: { blocks?: unknown[] } } } };
    expect(response.status).toBe(200);
    expect(body.result?.content?.[0]).toMatchObject({ type: "text" });
    expect(body.result?._meta?.slack?.blocks?.[0]).toMatchObject({ type: "header" });
  });

  it("rejects a signed data-bearing tool call from a Slack identity not mapped to an internal team member", async () => {
    const payload = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "triage.search_queue", arguments: {}, _meta: { slack: { user_id: "U_UNKNOWN", team_id: "T_DEMO" } } } });
    const response = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: signedHeaders(payload), body: payload });
    expect(response.status).toBe(403);
    const db = await getDb(); const captured = (await db!.select().from(slackMcpIdentityRequests).where(and(eq(slackMcpIdentityRequests.slackWorkspaceId, "T_DEMO"), eq(slackMcpIdentityRequests.slackUserId, "U_UNKNOWN"))).limit(1))[0];
    expect(captured?.status).toBe("pending");
    await db!.delete(slackMcpIdentityRequests).where(and(eq(slackMcpIdentityRequests.slackWorkspaceId, "T_DEMO"), eq(slackMcpIdentityRequests.slackUserId, "U_UNKNOWN")));
  });
});
