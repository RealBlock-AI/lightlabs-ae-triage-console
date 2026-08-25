import express from "express";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { bobbySupportRequests, externalSlackIdentityCandidates, hubspotContextSnapshots } from "../drizzle/schema";
import { getDb } from "./db";
import { bobbyHealth, bobbyMcp } from "./bobby";
import { ensureDemoData } from "./triage";
import { ensureKnowledgeCatalog, indexKnowledgeDocument } from "./knowledge";

describe("Bobby support-resolution MCP", () => {
  let server: ReturnType<typeof createServer>; let baseUrl = "";
  const requestId = `req_bobby_${Date.now()}`;
  const headers = { "content-type": "application/json", Authorization: `Bearer ${process.env.BOBBY_MCP_TOKEN}` };
  beforeAll(async () => { const app = express(); app.use(express.json()); app.get("/integrations/bobby/health", bobbyHealth); app.post("/integrations/bobby/mcp", bobbyMcp); server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve())); const address = server.address(); if (!address || typeof address === "string") throw new Error("Unable to start Bobby MCP test server."); baseUrl = `http://127.0.0.1:${address.port}`; });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  it("returns a standards-compliant bearer challenge and accepts an empty 202 initialized notification", async () => {
    const rejected = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer invalid" }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize" }) });
    const healthRejected = await fetch(`${baseUrl}/integrations/bobby/health`, { headers: { Authorization: "Bearer invalid" } });
    const initialized = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    expect(rejected.status).toBe(401); expect(rejected.headers.get("www-authenticate")).toBe('Bearer realm="light-labs-bobby"');
    expect(healthRejected.status).toBe(401); expect(healthRejected.headers.get("www-authenticate")).toBe('Bearer realm="light-labs-bobby"');
    expect(initialized.status).toBe(202); expect(await initialized.text()).toBe("");
  });
  it("lists the safe tools and returns one idempotent no-match response for an unmapped customer", async () => {
    const toolList = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(await toolList.json()).toMatchObject({ result: { tools: [expect.objectContaining({ name: "resolve_support_request" }), expect.objectContaining({ name: "search_knowledge" }), expect.objectContaining({ name: "get_contact_by_slack_user" })] } });
    const request = { request_id: requestId, schema_version: "0.1", requested_at: new Date().toISOString(), customer: { slack_user_id: "U_BOBBY_UNKNOWN", slack_team_id: "T_BOBBY_UNKNOWN", is_external: true }, conversation: { channel_id: "D_BOBBY", channel_type: "im", thread_ts: "1710000000.000001", messages: [{ ts: "1710000000.000001", user_id: "U_BOBBY_UNKNOWN", role: "customer", text: "Can you confirm my testing order status?", files: [{ name: "error.png", mimetype: "image/png", url_private: "must-not-persist" }] } ] }, analysis: { question: "order status", urgency: "normal" } };
    const first = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "resolve_support_request", arguments: request } }) });
    const retry = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "resolve_support_request", arguments: request } }) });
    const firstPayload = await first.json(); const retryPayload = await retry.json();
    const firstResult = JSON.parse(firstPayload.result.content[0].text); const retryResult = JSON.parse(retryPayload.result.content[0].text);
    expect(firstResult).toMatchObject({ request_id: requestId, status: "no_match", answer_markdown: null, sources: [], suggested_reply: "Thanks — your request has been received by Light Labs. An account executive will follow up through the appropriate channel.", follow_up_questions: [], policy: { verified_to_reply: false, slack_output: "fixed_acknowledgment_only" } });
    expect(retryResult).toEqual(firstResult);
    const db = await getDb(); const persisted = await db!.select().from(bobbySupportRequests).where(eq(bobbySupportRequests.requestId, requestId));
    expect(persisted).toHaveLength(1); expect(JSON.stringify(persisted[0]?.response)).not.toContain("must-not-persist");
  });

  it("returns attributed numeric retrieval relevance without treating it as permission to answer", async () => {
    await ensureKnowledgeCatalog(); await indexKnowledgeDocument({ sourceId: "k_test_microbial", content: "# Microbial testing\n\nLight Labs supports microbial testing for finished products. Testing panels and scope must be confirmed with the accountable lab team." });
    const response = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: "knowledge", method: "tools/call", params: { name: "search_knowledge", arguments: { query: "microbial testing panels" } } }) });
    const result = JSON.parse((await response.json()).result.content[0].text);
    expect(result.sources[0]).toMatchObject({ title: expect.any(String), url: expect.any(String), snippet: expect.any(String), score: expect.any(Number) });
    expect(result.sources[0].score).toBeGreaterThanOrEqual(0); expect(result.sources[0].score).toBeLessThanOrEqual(1); expect(result.gate).toHaveProperty("status");
  });

  it("returns pending_candidate rather than an identity error for a first-contact external sender", async () => {
    const workspaceId = `T_PENDING_${Date.now()}`; const slackUserId = "U_PENDING"; const db = await getDb(); await db!.insert(externalSlackIdentityCandidates).values({ id: `esc_test_${Date.now()}`, slackWorkspaceId: workspaceId, slackUserId, status: "pending", firstSeenAt: new Date(), lastSeenAt: new Date(), lastChannelId: "D_PENDING", lastChannelType: "im", externallySharedChannel: 0, sourceTransport: "custom_bridge", lastInteractionId: null, resolvedContactId: null, resolvedAt: null, resolvedByUserId: null });
    const response = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: "pending", method: "tools/call", params: { name: "get_contact_by_slack_user", arguments: { slack_team_id: workspaceId, slack_user_id: slackUserId } } }) });
    const result = JSON.parse((await response.json()).result.content[0].text);
    expect(result).toMatchObject({ status: "pending_candidate", workspace_id: workspaceId, slack_user_id: slackUserId, candidate: { last_channel_id: "D_PENDING" } });
    expect(result).not.toHaveProperty("email");
    await db!.delete(externalSlackIdentityCandidates).where(eq(externalSlackIdentityCandidates.slackWorkspaceId, workspaceId));
  });

  it("escalates a verified mapped sender when fresh CRM context is unavailable", async () => {
    await ensureDemoData(); const db = await getDb(); await db!.delete(hubspotContextSnapshots).where(eq(hubspotContextSnapshots.contactId, "con_northwind_ops"));
    const request = { request_id: `${requestId}_missing_context`, schema_version: "0.1", requested_at: new Date().toISOString(), customer: { slack_user_id: "U_NORTH_OPS", slack_team_id: "T_DEMO", is_external: true }, conversation: { channel_id: "D_BOBBY_MAPPED", channel_type: "im", messages: [{ ts: "1710000001.000001", user_id: "U_NORTH_OPS", role: "customer", text: "Can you confirm the order status?" }] } };
    const result = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "resolve_support_request", arguments: request } }) });
    const payload = JSON.parse((await result.json()).result.content[0].text);
    expect(payload).toMatchObject({ status: "escalate", answer_markdown: null, policy: { verified_to_reply: false } }); expect(payload.policy.reasons.join(" ")).toMatch(/fresh approved CRM context/i);
  });

  it("keeps a fixed acknowledgment when a verified mapped sender lacks identifying request detail", async () => {
    const db = await getDb(); await db!.insert(hubspotContextSnapshots).values({ id: `hctx_bobby_${Date.now()}`, contactId: "con_northwind_ops", hubspotContactId: "123", sourceObjectIds: ["123"], context: { contact: { properties: { email: "priya@example.com" } } }, retrievedAt: new Date(), status: "available", errorCode: null });
    const request = { request_id: `${requestId}_needs_info`, schema_version: "0.1", requested_at: new Date().toISOString(), customer: { slack_user_id: "U_NORTH_OPS", slack_team_id: "T_DEMO", is_external: true }, conversation: { channel_id: "D_BOBBY_MAPPED", channel_type: "im", messages: [{ ts: "1710000002.000001", user_id: "U_NORTH_OPS", role: "customer", text: "?" }] } };
    const result = await fetch(`${baseUrl}/integrations/bobby/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "resolve_support_request", arguments: request } }) });
    const payload = JSON.parse((await result.json()).result.content[0].text);
    expect(payload).toMatchObject({ status: "needs_more_info", answer_markdown: null, suggested_reply: "Thanks — your request has been received by Light Labs. An account executive will follow up through the appropriate channel.", follow_up_questions: [], policy: { verified_to_reply: false, slack_output: "fixed_acknowledgment_only" } });
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
