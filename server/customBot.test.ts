import express from "express";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customBotIngest } from "./customBot";

describe("custom-bot ingestion", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl = "";
  const eventId = `evt_custom_bot_${Date.now()}`;

  beforeAll(async () => {
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
    const retry = await fetch(`${baseUrl}/integrations/slack-bot/ingest`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.LIGHT_LABS_BOT_INGEST_SECRET}` }, body: JSON.stringify({ ...event, channel_id: "C_CUSTOM_TEST_RETRY", message_ts: "1780000000.000002" }) });
    expect(rejected.status).toBe(401);
    const firstPayload = await first.json(); const retryPayload = await retry.json();
    expect(firstPayload).toMatchObject({ ok: true, duplicate: false, lane: "escalate" });
    expect(retryPayload).toMatchObject({ ok: true, duplicate: true, interaction_id: firstPayload.interaction_id });
  }, 15_000);
});
