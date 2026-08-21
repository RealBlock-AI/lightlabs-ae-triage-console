import express from "express";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { bobbySupportRequests, hubspotContextSnapshots } from "../drizzle/schema";
import { getDb } from "./db";
import { bobbyMcp } from "./bobby";
import { ensureDemoData } from "./triage";

describe("Bobby support-resolution MCP", () => {
  let server: ReturnType<typeof createServer>; let baseUrl = "";
  const requestId = `req_bobby_${Date.now()}`;
  const headers = { "content-type": "application/json", Authorization: `Bearer ${process.env.BOBBY_MCP_TOKEN}` };
  beforeAll(async () => { const app = express(); app.use(express.json()); app.post("/integrations/bobby/mcp", bobbyMcp); server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve())); const address = server.address(); if (!address || typeof address === "string") throw new Error("Unable to start Bobby MCP test server."); baseUrl = `http://127.0.0.1:${address.port}`; });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  it("lists the single safe tool and returns one idempotent no-match response for an unmapped customer", async () => {
    const toolList = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(await toolList.json()).toMatchObject({ result: { tools: [expect.objectContaining({ name: "resolve_support_request" })] } });
    const request = { request_id: requestId, schema_version: "0.1", requested_at: new Date().toISOString(), customer: { slack_user_id: "U_BOBBY_UNKNOWN", slack_team_id: "T_BOBBY_UNKNOWN", is_external: true }, conversation: { channel_id: "D_BOBBY", channel_type: "im", thread_ts: "1710000000.000001", messages: [{ ts: "1710000000.000001", user_id: "U_BOBBY_UNKNOWN", role: "customer", text: "Can you confirm my testing order status?", files: [{ name: "error.png", mimetype: "image/png", url_private: "must-not-persist" }] } ] }, analysis: { question: "order status", urgency: "normal" } };
    const first = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "resolve_support_request", arguments: request } }) });
    const retry = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "resolve_support_request", arguments: request } }) });
    const firstPayload = await first.json(); const retryPayload = await retry.json();
    const firstResult = JSON.parse(firstPayload.result.content[0].text); const retryResult = JSON.parse(retryPayload.result.content[0].text);
    expect(firstResult).toMatchObject({ request_id: requestId, status: "no_match", answer_markdown: null, sources: [], policy: { verified_to_reply: false } });
    expect(retryResult).toEqual(firstResult);
    const db = await getDb(); const persisted = await db!.select().from(bobbySupportRequests).where(eq(bobbySupportRequests.requestId, requestId));
    expect(persisted).toHaveLength(1); expect(JSON.stringify(persisted[0]?.response)).not.toContain("must-not-persist");
  });

  it("escalates a verified mapped sender when fresh CRM context is unavailable", async () => {
    await ensureDemoData(); const db = await getDb(); await db!.delete(hubspotContextSnapshots).where(eq(hubspotContextSnapshots.contactId, "con_northwind_ops"));
    const request = { request_id: `${requestId}_missing_context`, schema_version: "0.1", requested_at: new Date().toISOString(), customer: { slack_user_id: "U_NORTH_OPS", slack_team_id: "T_DEMO", is_external: true }, conversation: { channel_id: "D_BOBBY_MAPPED", channel_type: "im", messages: [{ ts: "1710000001.000001", user_id: "U_NORTH_OPS", role: "customer", text: "Can you confirm the order status?" }] } };
    const result = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "resolve_support_request", arguments: request } }) });
    const payload = JSON.parse((await result.json()).result.content[0].text);
    expect(payload).toMatchObject({ status: "escalate", answer_markdown: null, policy: { verified_to_reply: false } }); expect(payload.policy.reasons.join(" ")).toMatch(/fresh approved CRM context/i);
  });

  it("asks for clarification when a verified mapped sender has fresh context but no identifying request detail", async () => {
    const db = await getDb(); await db!.insert(hubspotContextSnapshots).values({ id: `hctx_bobby_${Date.now()}`, contactId: "con_northwind_ops", hubspotContactId: "123", sourceObjectIds: ["123"], context: { contact: { properties: { email: "priya@example.com" } } }, retrievedAt: new Date(), status: "available", errorCode: null });
    const request = { request_id: `${requestId}_needs_info`, schema_version: "0.1", requested_at: new Date().toISOString(), customer: { slack_user_id: "U_NORTH_OPS", slack_team_id: "T_DEMO", is_external: true }, conversation: { channel_id: "D_BOBBY_MAPPED", channel_type: "im", messages: [{ ts: "1710000002.000001", user_id: "U_NORTH_OPS", role: "customer", text: "?" }] } };
    const result = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "resolve_support_request", arguments: request } }) });
    const payload = JSON.parse((await result.json()).result.content[0].text);
    expect(payload).toMatchObject({ status: "needs_more_info", answer_markdown: null, policy: { verified_to_reply: false } }); expect(payload.follow_up_questions).toHaveLength(1);
  });

  it("keeps an otherwise verified and detailed request in escalate until a versioned approved response template exists", async () => {
    const request = { request_id: `${requestId}_template_blocked`, schema_version: "0.1", requested_at: new Date().toISOString(), customer: { slack_user_id: "U_NORTH_OPS", slack_team_id: "T_DEMO", is_external: true }, conversation: { channel_id: "D_BOBBY_MAPPED", channel_type: "im", messages: [{ ts: "1710000003.000001", user_id: "U_NORTH_OPS", role: "customer", text: "Can you confirm the current status of Northwind order 4721 for vanilla protein?" }] } };
    const result = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "resolve_support_request", arguments: request } }) });
    const payload = JSON.parse((await result.json()).result.content[0].text);
    expect(payload).toMatchObject({ status: "escalate", answer_markdown: null, policy: { verified_to_reply: false } });
    expect(payload.policy.reasons.join(" ")).toMatch(/versioned customer-response template/i);
    const db = await getDb(); const persisted = await db!.select().from(bobbySupportRequests).where(eq(bobbySupportRequests.requestId, request.request_id));
    expect(persisted[0]?.status).toBe("escalate"); expect(persisted[0]?.status).not.toBe("answered");
  });
});
