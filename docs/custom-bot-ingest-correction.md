# Custom Slack Bot → Light Labs Ingestion Correction

## Confirmed diagnosis

The bot environment-variable change did **not** resolve the delivery failure. At **2026-08-21 13:58:07**, the Light Labs audit trail recorded two `signature_rejected` events with the reason `missing_headers`. The bot is calling the Light Labs endpoint, but it is not forwarding a native Slack Events API request and is not producing the two headers that endpoint deliberately requires:

```text
X-Slack-Request-Timestamp
X-Slack-Signature
```

Adding a Slack signing secret to a custom bot’s environment does not automatically create those headers. Only Slack’s Events API produces a signature over the original raw request body. A custom bot that constructs a new outbound HTTP request must use a **separate bot-to-Light-Labs authentication method**, not pretend to be Slack.

> Do not remove or bypass the existing signature check on `POST /ingest`. That endpoint is reserved for native Slack Events API traffic.

## Recommended architecture

| Producer | Endpoint | Authentication | Purpose |
|---|---|---|---|
| Native Slack Events API | `POST /ingest` | Slack HMAC signature over raw body | Direct Slack event delivery; retain current strict verification |
| Custom Slack/Claude bot | **Dedicated bot-ingest endpoint** | A distinct Light Labs bot credential with a signed request or bearer token | Forward the bot’s normalized event safely |
| Internal Slackbot | `POST /mcp` | Slack Identity Auth + Slack signature | Permission-filtered internal data queries |

The bot builder should stop posting to `/ingest`. Light Labs now exposes the dedicated endpoint `POST https://lighttriage-gdngkmys.manus.space/integrations/slack-bot/ingest`. Authenticate every request with `Authorization: Bearer <LIGHT_LABS_BOT_INGEST_SECRET>`. The secret is known only to the bot runtime and Light Labs server. The bot’s request must be idempotent and must include the original Slack identity metadata so the app can still enforce the verified contact bridge.

## Prompt for the bot-building agent

Copy the following prompt exactly into the agent building the custom Slack/Claude bot:

```text
You are integrating a custom Slack/Claude bot with the Light Labs AE Triage Console.

Important boundary: DO NOT POST custom bot events to `/ingest`. That endpoint accepts only native Slack Events API deliveries and verifies Slack’s `X-Slack-Signature` against Slack’s original raw request body. A custom bot cannot reproduce this signature by merely having the Slack signing secret in its environment.

Instead, send normalized customer-support events to the dedicated Light Labs custom-bot ingestion endpoint when it is provided:

POST https://lighttriage-gdngkmys.manus.space/integrations/slack-bot/ingest

Authorization: Bearer $LIGHT_LABS_BOT_INGEST_SECRET

Authenticate the request with the separate integration credential supplied as `LIGHT_LABS_BOT_INGEST_SECRET`. Do NOT use a Slack signing secret, bot OAuth token, webhook URL, HubSpot token, or any browser-exposed value for this credential.

Send JSON in this exact shape:

{
  "source": "custom_slack_bot",
  "external_event_id": "stable Slack event ID; use channel+message_ts only if no Slack event ID is available",
  "workspace_id": "T...",
  "channel_id": "C... or D...",
  "channel_type": "channel | im | group | mpim",
  "slack_user_id": "U...",
  "message_ts": "Slack message timestamp as a string",
  "thread_ts": "optional parent thread timestamp",
  "text": "original unmodified customer message text",
  "event_type": "app_mention | message.im | message.channels",
  "received_at": "ISO-8601 UTC timestamp"
}

Required behavior:
1. Preserve the original Slack workspace ID, sender user ID, channel ID, timestamps, and text exactly. Do not replace the sender with the bot identity.
2. Use `external_event_id` as an idempotency key. Retries must reuse the same key.
3. Do not send customer data to arbitrary external systems or add an autonomous customer reply. Light Labs owns triage and the verified-reply safety gate.
4. Treat a 2xx response as accepted; retry transient 5xx/network failures with bounded exponential backoff. Do not retry 4xx errors except after configuration is corrected.
5. Log only request ID, endpoint, status code, and correlation ID. Never log the integration secret or full customer message body.
6. Do not call the Light Labs MCP endpoint for customer-event delivery. MCP is only for internal Slackbot data queries.

Before marking the integration complete, add an automated test that submits a fixture event, verifies a 2xx acknowledgment, repeats the same event, and verifies that no duplicate triage interaction is created.
```

## Immediate next step

Place the generated secret in the bot’s environment as `LIGHT_LABS_BOT_INGEST_SECRET`, update the bot’s URL, and send one test mention. The Light Labs audit panel should then display a 2xx event named `custom_bot:app_mention`, with `transport: custom_bot` metadata and the normalized workspace and sender identity available for verification.
