# Verified-Answer and HubSpot MCP Architecture

## The revised operating rule

The product must **not** use an LLM confidence score as a license to answer a customer. A model cannot truthfully prove that an answer is 100% correct. The correct implementation is a **100% verified-answer eligibility policy**: the bot sends a substantive reply only when every required factual, authorization, freshness, and safety gate is true. Any failed, unknown, stale, disputed, or unavailable condition routes the interaction to the human AE queue.

> **A model may help classify and retrieve; it may never decide that an answer is safe to send.** The send decision is deterministic code over stored evidence.

| Outcome | Condition | Slack behavior |
|---|---|---|
| `VERIFIED_AUTO_REPLY` | Every eligibility gate passes | Post a pre-approved, fact-filled template in the original thread and retain its evidence snapshot |
| `ACKNOWLEDGE_AND_QUEUE` | Identity is known but one or more eligibility gates fail | Persist the decision packet and queue the case; optionally send only a static receipt acknowledgement, never a factual answer |
| `SILENT_QUEUE` | Identity is unverified, the channel is not approved, or the event appears suspicious | Persist a minimal escalated interaction with no account context and do not disclose information |

## The verified-answer eligibility policy

`verified_auto_reply` is true only if **all** the following gates are true. This is deliberately stricter than the previous `auto` lane.

| Gate | Deterministic requirement | Failure outcome |
|---|---|---|
| Sender identity | `(slack_team_id, slack_user_id)` is a verified mapping to exactly one approved contact | Silent queue |
| Workspace and channel | Slack app ID, workspace, and channel are explicitly allowlisted | Silent queue |
| Intent | The request maps to a versioned `auto_reply_eligible` intent with all required entities resolved | Acknowledge and queue |
| Customer authority | The contact is associated with the account/product/lot/order referenced in the request | Acknowledge and queue |
| Evidence completeness | Every fact used in the reply has one current source record and a retrieved timestamp | Acknowledge and queue |
| Evidence citability | Every quoted fact is marked citable; no placeholder regulatory or incomplete evidence exists | Acknowledge and queue |
| Safety category | No out-of-spec result, regulatory interpretation, reformulation, method dispute, quality investigation, or lab-call request is involved | Acknowledge and queue |
| HubSpot match | CRM contact/company linkage is unique and the required trusted properties are present | Acknowledge and queue |
| HubSpot freshness | HubSpot enrichment returned within the policy TTL; do not auto-answer from a stale cache | Acknowledge and queue |
| Deterministic answer template | A versioned template exists for that intent and all values fit its typed constraints | Acknowledge and queue |
| Delivery integrity | Slack thread, channel, and sender are bound to the same verified inbound event | Acknowledge and queue |
| Auditability | The system can persist the inbound event, evidence snapshot, policy version, and outbound message record atomically | Acknowledge and queue |

The current UI’s numeric “confidence” indicator should be re-labelled **classification confidence — non-dispositive**. It can prioritize review but cannot affect send eligibility. The application should show the binary policy result as `Verified to reply` or `Human review required`, together with the failed gates.

## What MCP should do and what it should not do

MCP is an appropriate way to make the CRM data source composable and tool-addressable. It is **not** a message-delivery mechanism for every inbound support event. Slack’s Events API delivers subscribed events, while Slackbot’s MCP client invokes a remote tool when a user asks Slackbot to do something. These are complementary paths, not substitutes. [1] [2]

The solution has three bounded integrations:

| Integration | Role | Protocol and authentication |
|---|---|---|
| Slack Events API | Receive support messages and trigger triage | Signed HTTPS request to `/ingest` |
| HubSpot Remote MCP | Enrich triage with live CRM contact, company, ticket, and permitted activity context | Streamable HTTP to `https://mcp.hubspot.com`, OAuth 2.1 + PKCE + refresh-token rotation [3] |
| Light Labs MCP server | Let internal AEs ask Slackbot deterministic questions about their permitted queue and cases | Streamable HTTP to `/mcp`, Slack Identity Auth and signature validation [2] |

The web application’s runtime must call HubSpot MCP as an **MCP client**. Slackbot alone cannot do this enrichment on receipt of an Events API message because Slackbot tool invocations are user-prompt driven. The system must therefore own the HubSpot authorization connection and normalize every tool result before it reaches the policy engine.

## HubSpot MCP enrichment design

Create a HubSpot **MCP Auth App** in HubSpot and connect the Light Labs backend to the remote HubSpot MCP server at `https://mcp.hubspot.com`. HubSpot requires OAuth 2.1 with PKCE and refresh-token rotation. [3] The authorization must be performed by a dedicated Light Labs HubSpot integration user with least-privilege, read-only access to only the CRM objects needed for customer support triage; do not authorize with a personal administrator account.

Register this exact redirect URL in the HubSpot MCP Auth App:

```text
https://lighttriage-gdngkmys.manus.space/integrations/hubspot/callback
```

The published callback route is reserved now. Do not start the HubSpot OAuth authorization until the HubSpot MCP Auth App client ID and client secret have been added to the project, because the application cannot safely exchange or retain a returned authorization code without them.

The production application will persist the encrypted refresh-token record server-side, keyed to the HubSpot portal and the integration identity. The Manus task-level HubSpot connector is useful for development or an agent session, but it is **not available to the deployed web application at runtime** and cannot be the production dependency.

| HubSpot MCP tool | Triage use | Normalized result retained by Light Labs |
|---|---|---|
| `get_user_details` | Startup/health check; confirm effective object permissions | Portal ID, permitted object matrix, connection state |
| `search_crm_objects` | Locate a contact by verified email or stable HubSpot contact ID; retrieve company and open tickets | Contact ID, company ID, lifecycle status, owner, support tier, ticket IDs and statuses |
| `get_crm_objects` | Fetch specifically allowlisted properties for the matched contact/company/ticket | Typed customer context snapshot with source timestamp |
| `search_conversations` | Optional prior support context only where the inbox access policy allows it | Referenced conversation IDs and limited recent case summaries |
| `search_owners` | Resolve an internal owner only when routing requires it | Internal owner ID and assigned team |

HubSpot’s remote MCP server supports CRM contacts, companies, tickets, activities, and conversations, with the authenticated user’s existing HubSpot permissions applied. [3] However, it blocks activity and conversation access through MCP when the HubSpot account has Sensitive Data enabled. Therefore, the application must treat optional activity/conversation enrichment as unavailable rather than attempting a fallback that silently broadens access. [3]

### Identity bridge

Slack user IDs and HubSpot contact IDs are different identities. Do not join them opportunistically on display name. Add a verified mapping table:

```ts
type VerifiedContactBridge = {
  id: string;
  slackTeamId: string;
  slackUserId: string;
  hubspotPortalId: string;
  hubspotContactId: string;
  verifiedEmailHash: string;
  verificationMethod: "admin_confirmed" | "customer_claimed" | "signed_provisioning";
  verifiedAt: string;
  revokedAt?: string;
};
```

The bridge is created through an approved onboarding/provisioning workflow. The system may use a verified email to locate the HubSpot record during onboarding, but a live inbound Slack event must use the already-verified bridge. A missing or ambiguous bridge is a human-review event, not a reason to search broadly for a likely customer.

## Revised end-to-end workflow

```text
Customer message in an approved Slack DM, mention, or support channel
  │
  ▼
Slack Events API → POST /ingest
  │   verify signature, timestamp, app ID, channel, and event-id idempotency
  ▼
Verified Slack identity bridge
  │   unknown/ambiguous → silent human queue, no account data
  ▼
HubSpot Remote MCP read-only enrichment (bounded time budget)
  │   missing, stale, permission-denied, or timeout → human queue
  ▼
Internal evidence lookup + deterministic verified-answer policy
  ├─ every gate true → Slack Web API `chat.postMessage` to the original thread
  │                    persist outbound text, evidence snapshot, policy version
  └─ any gate false → persist AE queue item and decision packet
                         optionally send static receipt only
```

Because an Events API response only acknowledges delivery, a bot that posts an actual verified response must use Slack’s messaging API with the narrowly scoped `chat:write` permission. This is the only new write capability required. It must be invoked **only** from the `VERIFIED_AUTO_REPLY` code path—not from the LLM, draft generator, MCP tool handler, or UI. Every call records the policy-gate results and exact evidence snapshot first.

## Tool and scope boundaries

The HubSpot connection is **read-only** for the first release. Although HubSpot MCP offers write tools, do not expose them to the triage policy or Slackbot. [3] Slackbot should receive only the Light Labs MCP tools below, each owner-filtered at the database layer:

| Light Labs MCP tool | Initial permission | Notes |
|---|---|---|
| `triage.search_queue` | Read-only | Lists only the caller’s assigned cases |
| `triage.get_interaction` | Read-only | Decision packet, failed policy gates, and evidence provenance |
| `triage.get_customer_context` | Read-only | Returns the normalized, minimized CRM snapshot—not arbitrary CRM fields |
| `triage.get_reply_eligibility` | Read-only | Returns gate-by-gate verified status and required human action |

Do not expose `query_database`, arbitrary CRM search, raw HubSpot conversation retrieval, `send_to_customer`, or HubSpot write tools through Slackbot.

## Required additional records and audit trail

| Record | Purpose |
|---|---|
| `hubspot_connections` | Encrypted OAuth token metadata, portal, status, scopes/permissions snapshot, expiry, and last refresh |
| `verified_contact_bridges` | Durable Slack-to-HubSpot contact authority mapping |
| `hubspot_context_snapshots` | Minimal normalized context, source-object IDs, retrieval time, and cache TTL |
| `reply_eligibility_checks` | One Boolean/value/reason per gate and policy version for every inbound interaction |
| `slack_outbound_messages` | Channel/thread/message timestamp, template version, submitted text, evidence snapshot hash, and actor `system_verified` |
| `integration_audit_events` | Signature result, Event ID, CRM query result status, token state, policy decision, and operator action |

## Implementation order

First, change the current send policy from lane/confidence-driven to the strict verified-answer policy above. Second, add the Slack-to-HubSpot verified identity bridge and UI for human verification. Third, register the HubSpot MCP Auth App and implement the encrypted OAuth 2.1 PKCE connection plus read-only normalized context adapter. Fourth, test failure modes—timeout, ambiguous contact, sensitive-data restriction, stale record, missing policy template, and out-of-spec result—and prove every one queues. Only then add the tightly isolated `chat.postMessage` delivery path and begin in shadow mode.

## References

[1]: https://docs.slack.dev/apis/events-api/ "Slack Events API"
[2]: https://docs.slack.dev/ai/slackbot-mcp-client/ "Connecting an MCP server to the Slackbot MCP Client"
[3]: https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server "Integrate AI tools with the HubSpot MCP server"
