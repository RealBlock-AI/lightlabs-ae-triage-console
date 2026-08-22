# Final Instruction for the Bobby / Slack Agent

## The production decision

Use the existing **separate endpoints**. Do **not** add a Bobby bearer-token branch to `/mcp`, do **not** ask Bobby to sign with the Slack signing secret, and do **not** forward canonical records to `/ingest`.

| Caller and purpose | URL | Authentication | Status |
|---|---|---|---|
| Native Slack Events API customer messages | `POST https://lighttriage-gdngkmys.manus.space/ingest` | Slack HMAC signature only | Live |
| Custom bridge forwards a canonical Slack record | `POST https://lighttriage-gdngkmys.manus.space/integrations/slack-bot/ingest` | `Authorization: Bearer $LIGHT_LABS_BOT_INGEST_SECRET` | Live |
| Slackbot internal data queries | `POST https://lighttriage-gdngkmys.manus.space/mcp` | Slack Identity Auth / Slack signature only | Live |
| Bobby support-resolution MCP calls | `POST https://lighttriage-gdngkmys.manus.space/integrations/bobby/mcp` | `Authorization: Bearer $BOBBY_MCP_TOKEN` | Live |

The distinction is intentional. A Slack signature attests that **Slack** created the original request. A service bearer token attests that **Bobby** is the authorized caller. Combining the two caller types on `/mcp` would make the authentication surface less legible and make audit provenance ambiguous.

## Required Bobby configuration

Set these server-side environment variables in the Bobby runtime:

```bash
LIGHTLABS_MCP_URL=https://lighttriage-gdngkmys.manus.space/integrations/bobby/mcp
LIGHTLABS_MCP_TOKEN=$BOBBY_MCP_TOKEN
LIGHTLABS_BOT_INGEST_URL=https://lighttriage-gdngkmys.manus.space/integrations/slack-bot/ingest
LIGHT_LABS_BOT_INGEST_SECRET=$LIGHT_LABS_BOT_INGEST_SECRET
```

Never place either bearer token in a Slack app form, browser bundle, public prompt, or Slack message.

## Bobby MCP call contract

Bobby should initialize the MCP session, list tools, and call **`resolve_support_request`**. The v0.1 tool intentionally owns identity verification, fresh CRM context enforcement, knowledge evidence, safe triage, request ID idempotency, and the policy decision in one atomic server-side action.

```json
{
  "jsonrpc": "2.0",
  "id": "support-001",
  "method": "tools/call",
  "params": {
    "name": "resolve_support_request",
    "arguments": {
      "request_id": "stable-slack-event-id",
      "schema_version": "1.0",
      "requested_at": "2026-08-22T00:00:00.000Z",
      "customer": {
        "slack_team_id": "T…",
        "slack_user_id": "U…",
        "is_external": true
      },
      "conversation": {
        "channel_id": "C…",
        "channel_type": "channel",
        "thread_ts": "1710000000.000001",
        "messages": [
          { "ts": "1710000000.000001", "user_id": "U…", "role": "customer", "text": "Original customer message only" }
        ]
      },
      "analysis": { "question": "Optional routing hint", "urgency": "Optional routing hint" }
    }
  }
}
```

The response may be `no_match`, `needs_more_info`, or `escalate`. Unknown top-level fields are ignored, but all documented required fields must be present and valid. The `answered` result is intentionally blocked until Light Labs has versioned, approved reply templates and verified response evidence. Bobby must not convert an `escalate` response into a customer-facing answer. A rejected Bobby bearer token receives HTTP 401 with `WWW-Authenticate: Bearer realm="light-labs-bobby"`.

## Canonical Slack event bridge contract

The bridge may now send its existing `CanonicalSlackInbound` record to the **custom bridge endpoint**, not `/ingest`. The endpoint accepts the camelCase contract below, verifies the dedicated bearer token, normalizes the record server-side, preserves event ID idempotency, and never persists the provided `rawPayload`.

```json
{
  "provider": "slack",
  "externalEventId": "Ev…",
  "workspaceId": "T…",
  "slackAppId": "A…",
  "conversationId": "C…",
  "conversationType": "channel",
  "senderSlackUserId": "U…",
  "messageTs": "1710000000.000001",
  "threadTs": "1710000000.000001",
  "text": "Original customer message",
  "receivedAt": "2026-08-22T00:00:00.000Z",
  "isExternallySharedChannel": false,
  "rawPayload": { "allowed": "but never persisted" }
}
```

The bridge must send `Authorization: Bearer $LIGHT_LABS_BOT_INGEST_SECRET`, use the same `externalEventId` on retries, and treat only 2xx responses as accepted. It must never share the Slack signing secret with the bridge.

## Authoritative channel transport policy

Each live customer channel must use exactly one authorized ingest transport, selected in **Slack Connections → Prevent duplicate customer ingestion** before activation:

| Authoritative transport | Slack configuration | What happens to the other path |
|---|---|---|
| `native_slack` | Slack Events API posts the original signed envelope to `/ingest` | Canonical bridge submissions receive an audited HTTP 202 `{ "ok": true, "skipped": true, "reason": "authoritative_native_slack" }`; do not retry them. |
| `custom_bridge` | The custom Slack/Bobby bridge posts `CanonicalSlackInbound` to `/integrations/slack-bot/ingest` | Native Events API submissions receive the corresponding audited HTTP 202 bridge-authoritative skip; do not retry them. |
| `disabled` | No customer message delivery should be enabled | Both paths are safely skipped with HTTP 202 until the channel is deliberately activated. |

The user interface is the source of truth for workspace and channel IDs. Do not configure both paths as active for the same channel, and do not reinterpret a policy skip as a delivery error. This is the deterministic protection against cross-path duplicate customer interactions.

## Explicitly rejected alternatives

> **Do not share the Slack signing secret with Bobby.** It destroys origin distinction, broadens the secret blast radius, and makes a request signed by Bobby indistinguishable from one signed by Slack.

> **Do not add Bobby bearer authentication to `/mcp`.** `/mcp` is the Slackbot-only surface and relies on Slack Identity Auth. Bobby already has its own isolated MCP endpoint.

> **Do not send the canonical bridge record to `/ingest`.** `/ingest` correctly accepts only a native Slack Events API envelope and signature. The custom bridge endpoint is the intended normalized-record boundary.

## Deferred AE-as-human Slack posting

The proposal to let account managers post as themselves via Slack user OAuth is directionally correct, but it is a separate, approval-gated phase. It needs per-AE consent, encrypted `xoxp-` token storage, revocation handling, an explicit `chat:write` user scope, clear customer-channel permission rules, and a final safety gate immediately before posting. It does **not** solve Bobby authentication and must not be bundled into the current activation.

## Acceptance tests

1. Bobby `initialize` and `tools/list` against `/integrations/bobby/mcp` return JSON and 200 with its bearer token.
2. A bad Bobby token returns 401.
3. The canonical bridge posts once to `/integrations/slack-bot/ingest` with its bearer token and gets a 200 response when `custom_bridge` is authoritative for that channel.
4. Retrying the exact canonical record creates no second interaction.
5. Native Slack Events continue using `/ingest` when `native_slack` is authoritative; the accepted event retains its original Slack event ID.
6. Bobby never receives or emits a customer-facing answer unless a later approved-template release enables the `answered` policy path.
7. Submitting to the non-authoritative transport returns an audited 202 skip and must not be retried.
