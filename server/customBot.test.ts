import express from "express";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customBotIngest } from "./customBot";
import { setIngestPolicy } from "./ingestPolicy";

describe("custom-bot ingestion", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl = "";
  const eventId = `evt_custom_bot_${Date.now()}`;

  beforeAll(async () => {
    await setIngestPolicy({ workspaceId: "T_CUSTOM_TEST", channelId: "C_CUSTOM_TEST", authoritativeTransport: "custom_bridge", enabled: true });
    await setIngestPolicy({ workspaceId: "T_CANONICAL", channelId: "C_CANONICAL", authoritativeTransport: "custom_bridge", enabled: true });
    const app = express(); app.use(express.json()); app.post("/integrations/slack-bot/ingest", customBotIngest);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Unable to start custom-bot test server.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  it("requires its own credential and idempotently persists normalized custom-bot events", async () => {
    const event = { source: "custom_slack_bot", external_event_id: eventId, workspace_id: "T_CUSTOM_TEST", channel_id: "C_CUSTOM_TEST", channel_type: "channel", slack_user_id: "U_CUSTOM_TEST", message_ts: "1780000000.000001", text: "Please confirm the current order status.", event_type: "app_mention", received_at: new Date().toISOString() };
    const rejected = await fetch(`${baseUrl}/integrations/slack-bot/ingest`, { method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer invalid" }, body: JSON.stringify(event) });
    const first = await fetch(`${baseUrl}/integrations/slack-bot/ingest`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.LIGHT_LABS_BOT_INGEST_SECRET}` }, body: JSON.stringify(event) });
    const retry = await fetch(`${baseUrl}/integrations/slack-bot/ingest`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.LIGHT_LABS_BOT_INGEST_SECRET}` }, body: JSON.stringify({ ...event, message_ts: "1780000000.000002" }) });
    expect(rejected.status).toBe(401);
    const firstPayload = await first.json(); const retryPayload = await retry.json();
    expect(firstPayload).toMatchObject({ ok: true, duplicate: false, lane: "escalate" });
    expect(retryPayload).toMatchObject({ ok: true, duplicate: true, interaction_id: firstPayload.interaction_id });
  }, 15_000);

  it("accepts the Slack agent canonical event record through the separate bearer-authenticated boundary", async () => {
    const canonical = { provider: "slack", externalEventId: `Ev_canonical_${Date.now()}`, workspaceId: "T_CANONICAL", slackAppId: "A_CANONICAL", conversationId: "C_CANONICAL", conversationType: "channel", senderSlackUserId: "U_CANONICAL", messageTs: "1780001000.000001", threadTs: "1780000000.000001", text: "Please help with this production result.", receivedAt: new Date().toISOString(), isExternallySharedChannel: false, rawPayload: { intentionally: "not persisted" } };
    const first = await fetch(`${baseUrl}/integrations/slack-bot/ingest`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.LIGHT_LABS_BOT_INGEST_SECRET}` }, body: JSON.stringify(canonical) });
    const retry = await fetch(`${baseUrl}/integrations/slack-bot/ingest`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.LIGHT_LABS_BOT_INGEST_SECRET}` }, body: JSON.stringify({ ...canonical, messageTs: "1780001000.000002" }) });
    const firstPayload = await first.json(); const retryPayload = await retry.json();
    expect(firstPayload).toMatchObject({ ok: true, duplicate: false, lane: "escalate" });
    expect(retryPayload).toMatchObject({ ok: true, duplicate: true, interaction_id: firstPayload.interaction_id });
  }, 15_000);

  it("returns a non-retryable audited skip when native Slack is authoritative for the same bridge channel", async () => {
    await setIngestPolicy({ workspaceId: "T_NATIVE_AUTH", channelId: "C_NATIVE_AUTH", authoritativeTransport: "native_slack", enabled: true });
    const event = { provider: "slack", externalEventId: `Ev_native_authoritative_${Date.now()}`, workspaceId: "T_NATIVE_AUTH", slackAppId: "A_NATIVE_AUTH", conversationId: "C_NATIVE_AUTH", conversationType: "channel", senderSlackUserId: "U_NATIVE_AUTH", messageTs: "1780002000.000001", text: "This must be skipped by the bridge.", receivedAt: new Date().toISOString() };
    const response = await fetch(`${baseUrl}/integrations/slack-bot/ingest`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.LIGHT_LABS_BOT_INGEST_SECRET}` }, body: JSON.stringify(event) });
    expect(response.status).toBe(202); expect(await response.json()).toMatchObject({ ok: true, skipped: true, reason: "authoritative_native_slack" });
  });
});
