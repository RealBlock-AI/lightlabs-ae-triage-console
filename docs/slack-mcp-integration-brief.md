# Light Labs Slack and MCP Integration Brief

## Executive decision

**Build both interfaces, but for different jobs.** The Slack **Events API** is the correct event-ingestion plane for customer messages. The Slackbot **MCP client** is the correct conversational query-and-action plane for AEs and internal users. MCP should not replace the Events API: MCP calls occur only when Slackbot elects to invoke a tool, whereas the Events API reliably delivers each subscribed message to the triage service. Slack documents these as distinct capabilities: an MCP server lets Slackbot invoke remote tools, while the Events API is the app mechanism through which Slack calls an application with subscribed activity. [1] [2]

> **Recommended authentication selection in the “Add MCP Server” form: `Slack Identity Auth`.**

This is an internal, Slack-first Light Labs service. Slack Identity Auth delivers signed per-user Slack identity to the MCP server without a second consent flow. It gives the application exactly the identity it needs to apply AE/team/member permissions at the database boundary. Slack explicitly positions this mode for services that map Slack user and team IDs to features, and requires signature verification before the server trusts the supplied identity metadata. [1]

| Surface | Purpose | Public endpoint | Authentication | Direction |
|---|---|---|---|---|
| Slack Events API | Capture customer messages for triage | `https://lighttriage-gdngkmys.manus.space/ingest` | Slack request signature | Slack → Light Labs |
| Slackbot MCP | Let Slackbot retrieve triage context and invoke constrained workflows | `https://lighttriage-gdngkmys.manus.space/mcp` | **Slack Identity Auth** + Slack request signature | Slackbot → Light Labs |
| AE Console | Review decision packets and record human outcomes | `https://lighttriage-gdngkmys.manus.space/` | Existing app authentication / role model | AE → Light Labs |

The MCP endpoint is **not implemented yet**. The production endpoint shown above is the target registration URL to use once the MCP route is added and tested. The existing `/ingest` route already supports a Slack-shaped body, URL verification, HMAC verification in production mode, and channel/timestamp deduplication; the changes listed in the implementation-gap section remain before connecting a live workspace.

## Authentication choice for the Slack form

| Form option | Decision | Rationale |
|---|---|---|
| **Slack Identity Auth** | **Use this now** | The service is owned by Light Labs and will authorize against Slack user/team identity. No separate customer OAuth service is required. Slack sends caller identity in `params._meta.slack` on signed MCP requests. [1] |
| Manual OAuth | Do not use for the first internal release | Appropriate only if Light Labs later exposes the MCP server to users who must authenticate against a separate, customer-facing Light Labs identity provider. That would require a full OAuth authorization server, a Slack callback registration, token lifecycle management, and per-user consent. [1] |
| Dynamic Client Registration | Do not use | Designed for a **third-party** MCP server that already supports OAuth Dynamic Client Registration. It adds no value when Light Labs owns both the Slack app and the MCP server. [1] |
| No Auth | Do not use | It cannot apply per-user or per-team access controls to account, result, or decision data. [1] |

Slackbot’s MCP client requires a remote **Streamable HTTP** server; legacy standalone SSE and local stdio transports are not supported. [1] The current managed hosting supports this request-scoped HTTPS workload. No always-on bot process is needed for this architecture.

## Slack app configuration

Create a **single internal Slack app**, for example `Light Labs Triage`. Configure both the Event Subscriptions request URL and the MCP server in that app. Slack requires the `mcp:connect` bot scope for MCP connectivity. For Slack Identity Auth, its manifest example includes `users:read` and `users:read.email` to resolve profile data. [1]

```json
{
  "display_information": {
    "name": "Light Labs Triage",
    "description": "Safety-first customer-interaction triage for Light Labs account executives"
  },
  "features": {
    "bot_user": {
      "display_name": "Light Labs Triage",
      "always_online": false
    }
  },
  "oauth_config": {
    "redirect_urls": [
      "https://lighttriage-gdngkmys.manus.space/slack/oauth_redirect"
    ],
    "scopes": {
      "bot": [
        "mcp:connect",
        "users:read",
        "users:read.email",
        "app_mentions:read",
        "im:history"
      ]
    }
  },
  "settings": {
    "event_subscriptions": {
      "request_url": "https://lighttriage-gdngkmys.manus.space/ingest",
      "bot_events": ["app_mention", "message.im"]
    },
    "socket_mode_enabled": false,
    "token_rotation_enabled": true,
    "org_deploy_enabled": true
  },
  "mcp_servers": {
    "light_labs_triage": {
      "url": "https://lighttriage-gdngkmys.manus.space/mcp",
      "auth_type": "slack_identity_auth"
    }
  }
}
```

This is the recommended **narrow-scope launch configuration**: only direct messages to the bot and explicit `@Light Labs Triage` requests are ingested. If the business later requires automatic capture from designated shared customer channels, add `message.channels` and the `channels:history` scope, then enforce a server-side allowlist of channel IDs. Slack documents that `message.channels` requires `channels:history`, while `message.im` requires `im:history`. [3] [4] Do not subscribe to every message in a workspace by default.

Do not request `chat:write`, incoming-webhook configuration, or any outbound messaging scope in the first release. The current product boundary is intentionally **ingest only**: the console records the approved customer response while the AE posts it manually. This preserves the existing safety requirement that an uncertain or out-of-spec answer can never be silently sent.

## Required Slack inbound contract

The integration should accept Slack’s native Events API envelope unchanged, not a bot-specific simplified format. The app must accept `url_verification` during setup and `event_callback` during normal operation. Slack’s event envelope supplies a globally unique `event_id`, workspace identifier, app identifier, dispatch time, authorizations, and the inner message event. [2]

```json
{
  "type": "event_callback",
  "team_id": "T01234ABCDE",
  "api_app_id": "A01234ABCDE",
  "event_id": "Ev01234ABCDE",
  "event_time": 1787252400,
  "authorizations": [
    {
      "team_id": "T01234ABCDE",
      "user_id": "U_BOT_OR_INSTALLER",
      "is_bot": true,
      "is_enterprise_install": false
    }
  ],
  "event": {
    "type": "message",
    "channel": "C01234ABCDE",
    "channel_type": "channel",
    "user": "U_CUSTOMER_123",
    "text": "Any update on the vanilla protein order?",
    "ts": "1787252399.000100",
    "thread_ts": "1787252000.000050"
  }
}
```

The HTTP headers are part of the contract, not optional metadata:

| Header / field | Required use in Light Labs |
|---|---|
| `X-Slack-Signature` | Validate against the raw, pre-deserialization request body with HMAC-SHA256 and constant-time comparison. [5] |
| `X-Slack-Request-Timestamp` | Reject messages older than five minutes to resist replay. [5] |
| `event_id` | Primary idempotency key. Store it as a unique external-event key. |
| `team_id` + `event.user` | Composite verified-contact lookup key. Never identify a contact by Slack user ID alone across workspaces. |
| `api_app_id` | Compare to the configured Light Labs Slack app ID; reject events intended for another app. |
| `event.channel` + `event.channel_type` | Enforce the channel allowlist and apply channel-specific customer/account routing. |
| `event.ts` + optional `thread_ts` | Preserve message chronology and attach replies to the correct prior interaction. |
| `event.text` | Treat as untrusted customer content; it is input to triage, never executable tool instruction. |

Internally, normalize every accepted message to the following stable record before classification:

```ts
type CanonicalSlackInbound = {
  provider: "slack";
  externalEventId: string;
  workspaceId: string;
  slackAppId: string;
  conversationId: string;
  conversationType: "channel" | "im" | "group" | "mpim";
  senderSlackUserId: string;
  messageTs: string;
  threadTs?: string;
  text: string;
  receivedAt: string;
  isExternallySharedChannel: boolean;
  rawPayload: unknown;
};
```

The sender-to-contact lookup occurs **before** customer context hydration. An unknown sender remains a persisted interaction but is force-routed to `escalate`, has no account context attached, and cannot be made sendable by model confidence. This preserves the core safety boundary.

## MCP server contract

The MCP server should be deliberately small. Slackbot may reason about which tool to invoke; the tools themselves must return deterministic, permission-filtered facts and should not expose raw database access. Each request must first validate the Slack signature, then read `params._meta.slack.{user_id,team_id,enterprise_id}`, map it to a Light Labs team member, and apply authorization in each database query. Slack warns that `_meta.slack` is ordinary JSON until the request signature has been verified. [1]

| Tool | Access | Deterministic behavior | Safety control |
|---|---|---|---|
| `triage.search_queue` | AE/admin | List caller-owned open interactions by lane, account, and SLA | Owner predicate required in SQL |
| `triage.get_interaction` | AE/admin | Return original message, lane reasons, evidence, posture, and existing draft | Caller must own item or be an authorized admin |
| `triage.get_account_snapshot` | AE/admin | Return account, current orders, products, and trusted operational evidence | Account ownership/role check before retrieval |
| `triage.get_decision_packet` | AE/admin | Return the exact persisted decision packet and citability flags | Never convert placeholder evidence into a quote |
| `triage.request_clarification` | AE/admin | Create an auditable clarification only for auto/assisted items | Always reject escalation items |
| `triage.record_human_outcome` | AE/admin | Record a copied manual response, edit ratio, and override reason | Escalations require a typed reason; placeholder evidence blocks the action |

Do **not** add an unrestricted `query_database`, arbitrary SQL, `send_to_customer`, or `chat.postMessage` tool. These would defeat the ownership, citability, and human-accountability controls that the triage system exists to enforce. Start with the four read-only tools; add the two write tools only after Slackbot’s confirmation behavior and the Light Labs audit trail are tested end-to-end.

## How the two interfaces work together

```text
Customer / co-man message
        │
        ▼
Slack Events API ── signed HTTPS ──► /ingest
                                      │
                                      ├─ verify signature + timestamp
                                      ├─ allowlist app/team/channel
                                      ├─ de-duplicate event_id
                                      ├─ resolve (workspace_id, slack_user_id)
                                      ├─ hydrate verified context
                                      ├─ triage, evidence, lane safeguards
                                      └─ persist decision trail → AE console

AE asks Slackbot about a case
        │
        ▼
Slackbot MCP Client ─ signed Streamable HTTP ─► /mcp
                                                  │
                                                  ├─ verify signature
                                                  ├─ map _meta.slack identity to Light Labs role
                                                  ├─ execute permission-filtered MCP tool
                                                  └─ return deterministic structured result
```

For message events, Slack expects a 2xx acknowledgement within three seconds and retries failed deliveries. [2] Keep the current bounded triage path synchronous and safe: if model classification cannot finish within the configured bound, persist an `UNKNOWN`/`escalate` item rather than delaying the acknowledgement or guessing. The durable idempotency record absorbs retries.

## Production implementation gap analysis

| Area | Current prototype state | Required before live Slack connection |
|---|---|---|
| `/ingest` signature handling | Implemented for the raw body when `TRIAGE_DEMO_MODE=false` | Set `SLACK_SIGNING_SECRET`; enforce production mode; test with Slack’s request URL validation |
| Event parsing | Accepts a native-looking message envelope and a simplified demo body | Store `event_id`, `team_id`, `api_app_id`, `thread_ts`, `event_context`, and `authorizations`; reject non-message, edited, bot, and unsupported subtype events |
| Idempotency | Uses `source + channel + timestamp` | Make `team_id + event_id` the primary unique key; retain channel/timestamp as a diagnostic fallback |
| Identity resolution | Uses Slack user ID only | Add `workspace_id` to contacts and create a composite unique verified-contact mapping |
| Channel governance | Not yet configured | Add database-backed allowed Slack workspace/app/channel table and approval workflow |
| Attachments | Not modeled | Store file metadata only initially; retrieve bytes only after an explicit AE action and permission review |
| Outbound messaging | Intentionally absent | Keep absent for launch; do not grant write scopes |
| MCP server | Not implemented | Add `POST /mcp` with Streamable HTTP JSON-RPC, signature validation, Slack Identity Auth mapping, tool discovery, and the constrained tool set above |
| Slack install flow | Not implemented | Add Slack OAuth install/callback, installation storage, and team/app configuration table; register the manifest above |
| Customer data model | Seed/demo contacts only | Load approved real contacts, account ownership, channel mappings, and data-retention rules before enabling production ingestion |

## Credentials to obtain and keep server-side

| Secret or identifier | Used for | Where it belongs |
|---|---|---|
| `SLACK_SIGNING_SECRET` | Validates both Events API and Slackbot MCP calls | Server-side project secret |
| `SLACK_CLIENT_ID` | Slack app installation and, if needed, MCP app registration | Server-side project secret / app manifest reference |
| `SLACK_CLIENT_SECRET` | OAuth install exchange and rotation | Server-side project secret |
| `SLACK_STATE_SECRET` | OAuth state integrity | Server-side project secret |
| `SLACK_APP_ID` | Rejects events not destined for the Light Labs app | Server-side project configuration |
| Approved team, channel, and contact mappings | Tenant isolation and attribution | Durable database tables, not environment variables |

Never pass these values in message text, a Slack channel, a custom MCP URL, browser JavaScript, or a client-side configuration file.

## Recommended build sequence

First, implement the production Events API hardening and contact/channel governance. Second, create the Streamable HTTP `/mcp` endpoint with **Slack Identity Auth**, beginning with read-only tools. Third, add the Slack app manifest, OAuth installation flow, and live request-validation tests in a development workspace. Finally, enable the narrow-scope `app_mention` and DM subscriptions, run shadow mode, and expand to approved shared customer channels only after observed audit data confirms the routing is safe.

## References

[1]: https://docs.slack.dev/ai/slackbot-mcp-client/ "Connecting an MCP server to the Slackbot MCP Client"
[2]: https://docs.slack.dev/apis/events-api/ "Slack Events API"
[3]: https://docs.slack.dev/reference/events/message.channels/ "message.channels event"
[4]: https://docs.slack.dev/reference/events/message.im/ "message.im event"
[5]: https://docs.slack.dev/authentication/verifying-requests-from-slack/ "Verifying requests from Slack"
