import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { evaluateIngestPolicy } from "./ingestPolicy";
import { recordIntegrationAudit } from "./integrationAudit";
import { runPrototypeTriage } from "./prototype";

type VerificationReason = "missing_secret" | "missing_headers" | "invalid_timestamp" | "stale_timestamp" | "signature_mismatch";

export function verifyNativeSlackRequest(req: Request, raw: string): { ok: boolean; reason?: VerificationReason } {
  const secret = process.env.SLACK_SIGNING_SECRET; const timestamp = req.header("x-slack-request-timestamp"); const signature = req.header("x-slack-signature");
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (!timestamp || !signature) return { ok: false, reason: "missing_headers" };
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return { ok: false, reason: "invalid_timestamp" };
  if (Math.abs(Date.now() / 1000 - timestampNumber) > 300) return { ok: false, reason: "stale_timestamp" };
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${raw}`).digest("hex")}`;
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? { ok: true } : { ok: false, reason: "signature_mismatch" };
}

export async function nativeSlackIngest(req: Request, res: Response) {
  const raw = (req as Request & { rawBody?: string }).rawBody ?? ""; const demoMode = process.env.TRIAGE_DEMO_MODE !== "false"; const verification = verifyNativeSlackRequest(req, raw);
  if (!demoMode && !verification.ok) { await recordIntegrationAudit({ surface: "slack_ingest", eventType: "signature_rejected", outcome: "rejected", statusCode: 401, metadata: { verificationFailure: verification.reason } }); return res.status(401).json({ ok: false, error: "Invalid Slack request signature." }); }
  const body = req.body as Record<string, unknown>;
  if (body.type === "url_verification") return res.json({ challenge: body.challenge });
  const event = body.event && typeof body.event === "object" ? body.event as Record<string, unknown> : body; const eventIsEnvelope = Boolean(body.event); const source = eventIsEnvelope ? "slack" : event.source; const slackUserId = event.user ?? event.slack_user_id; const channel = event.channel; const timestamp = event.ts ?? event.timestamp; const text = event.text;
  if (source !== "slack" || typeof slackUserId !== "string" || typeof channel !== "string" || typeof timestamp !== "string" || typeof text !== "string") return res.status(400).json({ ok: false, error: "Expected a Slack message event or simplified demo-shaped body." });
  try {
    const workspaceId = typeof body.team_id === "string" ? body.team_id : typeof event.team_id === "string" ? event.team_id : demoMode && !eventIsEnvelope ? "T_DEMO" : null; const externalEventId = typeof body.event_id === "string" ? body.event_id : typeof event.event_id === "string" ? event.event_id : `${channel}|${timestamp}`; const sourceReceivedAt = typeof body.event_time === "number" ? new Date(body.event_time * 1000) : typeof event.event_time === "number" ? new Date(event.event_time * 1000) : undefined;
    const policy = await evaluateIngestPolicy({ workspaceId, channelId: channel, transport: "native_slack" });
    if (!policy.allowed) { await recordIntegrationAudit({ surface: "slack_ingest", eventType: eventIsEnvelope ? "event_callback" : "slack_demo", outcome: "accepted", statusCode: 202, slackWorkspaceId: workspaceId, slackUserId, metadata: { transport: "native_slack", skipped: true, policyReason: policy.reason } }); return res.status(202).json({ ok: true, skipped: true, reason: policy.reason }); }
    const attachmentsPresent = Array.isArray(event.files) || Array.isArray(event.attachments) || Array.isArray(body.attachments);
    const result = await runPrototypeTriage({ source: "slack", channelRef: `${channel}|${timestamp}`, externalEventId, slackUserId, slackWorkspaceId: workspaceId, rawText: text, attachmentsPresent });
    return res.json({ ok: true, duplicate: result.duplicate, interactionId: result.interaction.id, acknowledgment: result.interaction.acknowledgment, lane: result.interaction.lane, msToAck: result.interaction.msToAck });
  } catch (error) { console.error("ingest failed", error); return res.status(500).json({ ok: false, error: "Unable to persist triage interaction." }); }
}
