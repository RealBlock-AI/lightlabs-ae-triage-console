import express from "express";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nativeSlackIngest } from "./nativeIngest";
import { setIngestPolicy } from "./ingestPolicy";

describe("native Slack ingestion policy", () => {
  let server: ReturnType<typeof createServer>; let baseUrl = "";
  beforeAll(async () => { const app = express(); app.use(express.json({ verify: (req, _res, buffer) => { (req as express.Request & { rawBody?: string }).rawBody = buffer.toString("utf8"); } })); app.post("/ingest", nativeSlackIngest); server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve())); const address = server.address(); if (!address || typeof address === "string") throw new Error("Unable to start native ingest test server."); baseUrl = `http://127.0.0.1:${address.port}`; });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  const postEvent = async (workspaceId: string, channelId: string, eventId: string) => { const messageTs = `${Date.now()}.${eventId.slice(-6)}`; const body = { type: "event_callback", team_id: workspaceId, event_id: eventId, event_time: Math.floor(Date.now() / 1000), event: { type: "message", channel: channelId, user: "U_NATIVE_POLICY", text: "Please confirm the order status.", ts: messageTs } }; const raw = JSON.stringify(body); const timestamp = String(Math.floor(Date.now() / 1000)); const signature = `v0=${createHmac("sha256", process.env.SLACK_SIGNING_SECRET!).update(`v0:${timestamp}:${raw}`).digest("hex")}`; return fetch(`${baseUrl}/ingest`, { method: "POST", headers: { "content-type": "application/json", "x-slack-request-timestamp": timestamp, "x-slack-signature": signature }, body: raw }); };
  it("accepts a valid native Slack event when native is authoritative", async () => { const workspaceId = `T_NATIVE_${Date.now()}`; const channelId = "C_NATIVE"; await setIngestPolicy({ workspaceId, channelId, authoritativeTransport: "native_slack", enabled: true }); const response = await postEvent(workspaceId, channelId, `Ev_native_${Date.now()}`); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ ok: true, duplicate: false }); });
  it("returns an audited 202 skip when bridge is authoritative for the same native Slack channel", async () => { const workspaceId = `T_BRIDGE_${Date.now()}`; const channelId = "C_BRIDGE"; await setIngestPolicy({ workspaceId, channelId, authoritativeTransport: "custom_bridge", enabled: true }); const response = await postEvent(workspaceId, channelId, `Ev_bridge_${Date.now()}`); expect(response.status).toBe(202); expect(await response.json()).toMatchObject({ ok: true, skipped: true, reason: "authoritative_custom_bridge" }); });
});
