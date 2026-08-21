import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { recordIntegrationAudit } from "./integrationAudit";
import { runTriage } from "./triage";

function secretMatches(provided: string | undefined) {
  const expected = process.env.LIGHT_LABS_BOT_INGEST_SECRET;
  if (!expected || !provided || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function hasValidCustomBotCredential(req: Request) {
  const authorization = req.header("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  return secretMatches(bearer);
}

export function customBotHealth(req: Request, res: Response) {
  if (!hasValidCustomBotCredential(req)) return res.status(401).json({ ok: false, error: "Unauthorized custom-bot credential." });
  return res.json({ ok: true, service: "light-labs-custom-bot-ingest" });
}

type NormalizedBotEvent = {
  source: "custom_slack_bot";
  external_event_id: string;
  workspace_id: string;
  channel_id: string;
  channel_type: "channel" | "im" | "group" | "mpim";
  slack_user_id: string;
  message_ts: string;
  thread_ts?: string;
  text: string;
  event_type: "app_mention" | "message.im" | "message.channels";
  received_at: string;
};

function normalizedBotEvent(input: unknown): NormalizedBotEvent | undefined {
  const body = input as Record<string, unknown>;
  const validChannelTypes = new Set(["channel", "im", "group", "mpim"]);
  const validEventTypes = new Set(["app_mention", "message.im", "message.channels"]);
  if (body?.source !== "custom_slack_bot" || typeof body.external_event_id !== "string" || typeof body.workspace_id !== "string" || typeof body.channel_id !== "string" || typeof body.channel_type !== "string" || typeof body.slack_user_id !== "string" || typeof body.message_ts !== "string" || typeof body.text !== "string" || typeof body.event_type !== "string" || typeof body.received_at !== "string") return undefined;
  if (!body.external_event_id.trim() || !body.workspace_id.trim() || !body.channel_id.trim() || !body.slack_user_id.trim() || !body.message_ts.trim() || !body.text.trim() || !validChannelTypes.has(body.channel_type) || !validEventTypes.has(body.event_type) || Number.isNaN(Date.parse(body.received_at))) return undefined;
  return { source: "custom_slack_bot", external_event_id: body.external_event_id, workspace_id: body.workspace_id, channel_id: body.channel_id, channel_type: body.channel_type as NormalizedBotEvent["channel_type"], slack_user_id: body.slack_user_id, message_ts: body.message_ts, thread_ts: typeof body.thread_ts === "string" ? body.thread_ts : undefined, text: body.text, event_type: body.event_type as NormalizedBotEvent["event_type"], received_at: body.received_at };
}

export async function customBotIngest(req: Request, res: Response) {
  if (!hasValidCustomBotCredential(req)) { await recordIntegrationAudit({ surface: "slack_ingest", eventType: "custom_bot_credential_rejected", outcome: "rejected", statusCode: 401, metadata: { transport: "custom_bot" } }); return res.status(401).json({ ok: false, error: "Unauthorized custom-bot credential." }); }
  const event = normalizedBotEvent(req.body);
  if (!event) { await recordIntegrationAudit({ surface: "slack_ingest", eventType: "custom_bot_invalid_payload", outcome: "rejected", statusCode: 400, metadata: { transport: "custom_bot" } }); return res.status(400).json({ ok: false, error: "Expected the documented normalized custom-bot event shape." }); }
  try {
    const result = await runTriage({ source: "custom_slack_bot", channelRef: `custom|${event.workspace_id}|${event.external_event_id}`, slackUserId: event.slack_user_id, slackWorkspaceId: event.workspace_id, rawText: event.text });
    await recordIntegrationAudit({ surface: "slack_ingest", eventType: `custom_bot:${event.event_type}`, outcome: "accepted", statusCode: 200, slackWorkspaceId: event.workspace_id, slackUserId: event.slack_user_id, interactionId: result.interaction.id, metadata: { transport: "custom_bot", channelType: event.channel_type, duplicate: result.duplicate, hasThread: Boolean(event.thread_ts) } });
    return res.status(200).json({ ok: true, duplicate: result.duplicate, interaction_id: result.interaction.id, lane: result.interaction.lane, acknowledgment: result.interaction.acknowledgment });
  } catch {
    await recordIntegrationAudit({ surface: "slack_ingest", eventType: `custom_bot:${event.event_type}`, outcome: "error", statusCode: 500, slackWorkspaceId: event.workspace_id, slackUserId: event.slack_user_id, metadata: { transport: "custom_bot", channelType: event.channel_type } });
    return res.status(500).json({ ok: false, error: "Unable to persist triage interaction." });
  }
}
