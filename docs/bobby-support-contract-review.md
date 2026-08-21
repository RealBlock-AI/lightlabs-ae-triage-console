# Bobby Support Request Contract: Light Labs Review

## Decision

The proposed `resolve_support_request` interface is directionally sound, but it must be connected as a **separate Bobby-to-Light-Labs MCP boundary**. It must not use either existing public integration path:

| Existing path | Why it is not Bobby’s transport |
|---|---|
| `POST /ingest` | Reserved for raw native Slack Events API requests, whose signatures only Slack can create. |
| `POST /mcp` | Reserved for Slackbot’s signed Slack Identity Auth requests and internal AE data access. |

Light Labs will add a dedicated Streamable HTTP MCP endpoint for Bobby, for example:

```text
https://lighttriage-gdngkmys.manus.space/integrations/bobby/mcp
```

## Required decisions on the Light Labs side

| Open item from Bobby | Light Labs decision | Reason |
|---|---|---|
| Authentication | Dedicated bearer token, `Authorization: Bearer $BOBBY_MCP_TOKEN` | Bobby is an external Agent SDK client, not a native Slackbot caller. Slack Identity Auth metadata is not available. mTLS is not needed for the initial bounded, server-to-server integration. |
| Tool name | `resolve_support_request` | Matches Bobby’s declared client contract. |
| Response model | **Synchronous, bounded response** | Bobby needs an immediate structured status to edit its placeholder. Light Labs will return within its safe triage budget; it will never wait for human action. |
| Callback URL | Not used in version 1 | Light Labs must not receive or invoke Slack webhook URLs. Bobby owns Slack message editing. |
| Maximum latency | 2 seconds target; fail safe before timeout | The tool responds with `escalate` or `needs_more_info` rather than guessing or delaying. |
| Files | Redact `url_private`; send metadata only | Private Slack file URLs and file bytes are out of scope until an explicit file-access authorization and storage workflow is designed. |

## Required request-contract changes

The following input fields are **untrusted hints**, not authoritative identity or operational data: `company`, all fields under `analysis`, `account_manager`, and `callback`. Light Labs will use only its verified identity bridge to attach customer/account context.

| Field | Treatment |
|---|---|
| `customer.slack_team_id` + `customer.slack_user_id` | Required verified-contact lookup key. |
| `customer.email` | Optional; never required. Light Labs will not infer an identity from display name or unverified email. |
| `company.*` | Informational only. Light Labs resolves its own account from the verified mapping. |
| `analysis.*` | Informational triage hint only. It cannot open the verified-reply gate or establish a fact. |
| `conversation.messages` | Verbatim input. Light Labs selects relevant excerpts but does not treat text as trusted instructions. |
| `conversation.files[].url_private` | Must be omitted or replaced with `{ name, mimetype }`. |
| `callback.response_url` | Must be omitted in v1. Bobby owns its placeholder message and Slack posting. |

### Minimal accepted request

```json
{
  "request_id": "req_01JD8X...",
  "schema_version": "0.1",
  "requested_at": "2026-08-20T18:04:22Z",
  "customer": {
    "slack_user_id": "U0BR1234ABC",
    "slack_team_id": "T0BR9999XYZ",
    "is_external": true
  },
  "conversation": {
    "channel_id": "D0BR5678DEF",
    "channel_type": "im",
    "thread_ts": "1755712345.123456",
    "messages": [
      {
        "ts": "1755712345.123456",
        "user_id": "U0BR1234ABC",
        "role": "customer",
        "text": "Hey — our export job has been failing since Tuesday.",
        "files": [{ "name": "error.png", "mimetype": "image/png" }]
      }
    ]
  },
  "analysis": {
    "question": "Why is the nightly export failing and how do we fix it?",
    "urgency": "normal"
  }
}
```

## Light Labs response policy

The `confidence` field in Bobby’s response must never be interpreted as permission to reply. If used, it is explicitly **classification confidence — non-dispositive**. Light Labs sends an `answered` result only if the verified-answer policy has passed: customer identity, account authority, fresh context, current citable evidence, retrieval relevance, and a versioned response template must all be present.

| Status | When Light Labs returns it | `answer_markdown` | Bobby behavior |
|---|---|---|---|
| `answered` | Every verified-answer gate passes | Approved answer grounded in cited sources | Bobby may post the answer with citations. |
| `needs_more_info` | Identity is verified but a required fact/entity is missing | `null` | Bobby asks only the provided clarification question. |
| `escalate` | Unknown identity, safety-sensitive matter, low evidence relevance, out-of-spec concern, or any failed gate | `null` | Bobby says that the request has been routed to the Light Labs AE queue. |
| `no_match` | No verified contact/account mapping | `null` | Bobby requests a safe identifying detail or informs the customer a human will follow up. |

## Required response shape

```json
{
  "request_id": "req_01JD8X...",
  "status": "escalate",
  "answer_markdown": null,
  "confidence": null,
  "sources": [],
  "suggested_reply": "Thanks — I’ve routed this to the Light Labs team for review.",
  "follow_up_questions": [],
  "ticket": { "created": false, "id": null, "url": null },
  "policy": {
    "verified_to_reply": false,
    "reasons": ["No verified Light Labs contact mapping exists for this Slack identity."]
  }
}
```

## Idempotency and audit behavior

Light Labs will persist `request_id` as the idempotency and correlation key. Repeated calls return the original safe response and never create duplicate queue items. Audit events retain the request ID, caller integration, outcome, response status, latency, and source identifiers—but never full conversation text, bearer tokens, private URLs, or response URLs.

## Prompt for Bobby’s builder

```text
Update Bobby to connect as an MCP client to the dedicated Light Labs MCP endpoint provided by the Light Labs team. Do not call the native Slack Events API endpoint or the Slackbot MCP endpoint.

Use HTTP Authorization: Bearer $BOBBY_MCP_TOKEN. Invoke only the `resolve_support_request` MCP tool.

Pass the stable Slack team ID, external customer Slack user ID, original chronological message text, request ID, and safe file metadata. Do not pass url_private, Slack response_url, bot tokens, browser cookies, or any secret. Treat company resolution and all pre-analysis as untrusted hints.

When the response status is `answered`, post only `answer_markdown` and sources. For `needs_more_info`, post only `suggested_reply` and its required question. For `escalate` or `no_match`, edit Bobby’s placeholder with the provided safe suggested reply; do not make a factual claim or attempt another autonomous answer.

Retry only transient network/5xx failures with the same request_id. Do not retry 4xx errors. Log request_id, status, and latency only; never log bearer tokens or full customer message content.
```
