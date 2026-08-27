import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { recordIntegrationAudit } from "./integrationAudit";
import { captureExternalSlackIdentityCandidate } from "./externalIdentity";
import { runPrototypeTriage } from "./prototype";
import { evaluateIngestPolicy } from "./ingestPolicy";

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
  if (!hasValidCustomBotCredential(req)) { res.setHeader("WWW-Authenticate", 'Bearer realm="light-labs-custom-bridge"'); void recordIntegrationAudit({ surface: "slack_ingest", eventType: "custom_bot_health", outcome: "rejected", statusCode: 401, metadata: { transport: "custom_bridge" } }); return res.status(401).json({ ok: false, error: "Unauthorized custom-bot credential." }); }
  void recordIntegrationAudit({ surface: "slack_ingest", eventType: "custom_bot_health", outcome: "accepted", statusCode: 200, metadata: { transport: "custom_bridge" } }); return res.json({ ok: true, service: "light-labs-custom-bot-ingest" });
}

type NormalizedBotEvent = {
  source: "custom_slack_bot";
  external_event_id: string;
  workspace_id: string;
  channel_id: string;
  channel_type: "channel" | "im" | "group" | "mpim";
  slack_user_id: string;
  attachments?: InboundAttachment[];
  message_ts: string;
  thread_ts?: string;
  text: string;
  event_type: "app_mention" | "message.im" | "message.channels";
  is_externally_shared_channel: boolean;
  is_external: boolean;
  received_at: string;
};

function normalizedBotEvent(input: unknown): NormalizedBotEvent | undefined {
  const body = input as Record<string, unknown>;
  const validChannelTypes = new Set(["channel", "im", "group", "mpim"]);
  const validEventTypes = new Set(["app_mention", "message.im", "message.channels"]);
  if (body?.provider === "slack" && typeof body.externalEventId === "string" && typeof body.workspaceId === "string" && typeof body.slackAppId === "string" && typeof body.conversationId === "string" && typeof body.conversationType === "string" && typeof body.senderSlackUserId === "string" && typeof body.messageTs === "string" && typeof body.text === "string" && typeof body.receivedAt === "string") {
    const eventType = typeof body.eventType === "string" ? body.eventType : body.conversationType === "im" ? "message.im" : "message.channels";
    if (!body.externalEventId.trim() || !body.workspaceId.trim() || !body.slackAppId.trim() || !body.conversationId.trim() || !body.senderSlackUserId.trim() || !body.messageTs.trim() || !body.text.trim() || !validChannelTypes.has(body.conversationType) || !validEventTypes.has(eventType) || Number.isNaN(Date.parse(body.receivedAt))) return undefined;
    return { source: "custom_slack_bot", external_event_id: body.externalEventId, workspace_id: body.workspaceId, channel_id: body.conversationId, channel_type: body.conversationType as NormalizedBotEvent["channel_type"], slack_user_id: body.senderSlackUserId, message_ts: body.messageTs, thread_ts: typeof body.threadTs === "string" ? body.threadTs : undefined, text: body.text, event_type: eventType as NormalizedBotEvent["event_type"], is_externally_shared_channel: body.isExternallySharedChannel === true || body.isExtSharedChannel === true || body.is_ext_shared_channel === true, is_external: body.isExternal === true || body.is_external === true, received_at: body.receivedAt, attachments: parseAttachments(body.files) };
  }
  if (body?.source !== "custom_slack_bot" || typeof body.external_event_id !== "string" || typeof body.workspace_id !== "string" || typeof body.channel_id !== "string" || typeof body.channel_type !== "string" || typeof body.slack_user_id !== "string" || typeof body.message_ts !== "string" || typeof body.text !== "string" || typeof body.event_type !== "string" || typeof body.received_at !== "string") return undefined;
  if (!body.external_event_id.trim() || !body.workspace_id.trim() || !body.channel_id.trim() || !body.slack_user_id.trim() || !body.message_ts.trim() || !body.text.trim() || !validChannelTypes.has(body.channel_type) || !validEventTypes.has(body.event_type) || Number.isNaN(Date.parse(body.received_at))) return undefined;
  return { source: "custom_slack_bot", external_event_id: body.external_event_id, workspace_id: body.workspace_id, channel_id: body.channel_id, channel_type: body.channel_type as NormalizedBotEvent["channel_type"], slack_user_id: body.slack_user_id, message_ts: body.message_ts, thread_ts: typeof body.thread_ts === "string" ? body.thread_ts : undefined, text: body.text, event_type: body.event_type as NormalizedBotEvent["event_type"], is_externally_shared_channel: body.is_externally_shared_channel === true, is_external: body.is_external === true, received_at: body.received_at, attachments: parseAttachments(body.files) };
}

/** An attachment as Bobby forwards it. The bytes stay in Slack. */
export type InboundAttachment = { id: string; name: string | null; mimetype: string | null; filetype: string | null; size: number | null; permalink: string | null; download_url: string | null; is_external: boolean };

/**
 * Read the files array off a canonical record.
 *
 * An upload arrives with `text` often empty — the attachment is the message —
 * so dropping this silently loses the whole customer request.
 */
function parseAttachments(input: unknown): InboundAttachment[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object" && typeof (f as Record<string, unknown>).id === "string")
    .map(f => ({
      id: String(f.id),
      name: typeof f.name === "string" ? f.name : null,
      mimetype: typeof f.mimetype === "string" ? f.mimetype : null,
      filetype: typeof f.filetype === "string" ? f.filetype : null,
      size: typeof f.size === "number" ? f.size : null,
      permalink: typeof f.permalink === "string" ? f.permalink : null,
      download_url: typeof f.download_url === "string" ? f.download_url : null,
      is_external: f.is_external === true,
    }));
}

export async function customBotIngest(req: Request, res: Response) {
  if (!hasValidCustomBotCredential(req)) { res.setHeader("WWW-Authenticate", 'Bearer realm="light-labs-custom-bridge"'); await recordIntegrationAudit({ surface: "slack_ingest", eventType: "custom_bot_credential_rejected", outcome: "rejected", statusCode: 401, metadata: { transport: "custom_bridge" } }); return res.status(401).json({ ok: false, error: "Unauthorized custom-bot credential." }); }
  const event = normalizedBotEvent(req.body);
  if (!event) { await recordIntegrationAudit({ surface: "slack_ingest", eventType: "custom_bot_invalid_payload", outcome: "rejected", statusCode: 400, metadata: { transport: "custom_bot" } }); return res.status(400).json({ ok: false, error: "Expected the documented normalized custom-bot event shape." }); }
  const policy = await evaluateIngestPolicy({ workspaceId: event.workspace_id, channelId: event.channel_id, transport: "custom_bridge" });
  if (!policy.allowed) { await recordIntegrationAudit({ surface: "slack_ingest", eventType: `custom_bot:${event.event_type}`, outcome: "accepted", statusCode: 202, slackWorkspaceId: event.workspace_id, slackUserId: event.slack_user_id, metadata: { transport: "custom_bridge", channelId: event.channel_id, channelType: event.channel_type, externalEventId: event.external_event_id, externallySharedChannel: event.is_externally_shared_channel, externalCustomerSignal: event.is_external || event.is_externally_shared_channel, skipped: true, policyReason: policy.reason } }); return res.status(202).json({ ok: true, skipped: true, reason: policy.reason, workspace_id: event.workspace_id, channel_id: event.channel_id }); }
  try {
    const result = await runPrototypeTriage({ source: "custom_slack_bot", channelRef: `custom|${event.workspace_id}|${event.external_event_id}`, externalEventId: event.external_event_id, slackUserId: event.slack_user_id, slackWorkspaceId: event.workspace_id, rawText: event.text, attachments: event.attachments ?? [] });
    const externalCustomerSignal = event.is_external || event.is_externally_shared_channel;
    const candidate = externalCustomerSignal ? await captureExternalSlackIdentityCandidate({ workspaceId: event.workspace_id, slackUserId: event.slack_user_id, channelId: event.channel_id, channelType: event.channel_type, externallySharedChannel: event.is_externally_shared_channel, sourceTransport: "custom_bridge", interactionId: result.interaction.id }) : null;
    await recordIntegrationAudit({ surface: "slack_ingest", eventType: `custom_bot:${event.event_type}`, outcome: "accepted", statusCode: 200, slackWorkspaceId: event.workspace_id, slackUserId: event.slack_user_id, interactionId: result.interaction.id, metadata: { transport: "custom_bridge", channelId: event.channel_id, channelType: event.channel_type, externalEventId: event.external_event_id, externallySharedChannel: event.is_externally_shared_channel, externalCustomerSignal, candidateStatus: candidate?.status ?? "not_captured", duplicate: result.duplicate, hasThread: Boolean(event.thread_ts) } });
    return res.status(200).json({ ok: true, duplicate: result.duplicate, interaction_id: result.interaction.id, lane: result.interaction.lane, acknowledgment: result.interaction.acknowledgment, identity_status: candidate?.status ?? "unmapped" });
  } catch {
    await recordIntegrationAudit({ surface: "slack_ingest", eventType: `custom_bot:${event.event_type}`, outcome: "error", statusCode: 500, slackWorkspaceId: event.workspace_id, slackUserId: event.slack_user_id, metadata: { transport: "custom_bot", channelType: event.channel_type } });
    return res.status(500).json({ ok: false, error: "Unable to persist triage interaction." });
  }
}
