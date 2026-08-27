# Light Labs Slack Streamable MCP: Production Setup

**Status:** The Light Labs app now exposes a Streamable HTTP MCP endpoint at `https://lighttriage-gdngkmys.manus.space/mcp`. This is the primary conversational connection from Slackbot to Light Labs. The Slack Events API remains the inbound event plane for message ingestion; MCP is the query-and-action plane selected by Slackbot during a conversation. Slack requires Streamable HTTP for Slackbot MCP servers and does not support the deprecated standalone HTTP+SSE or stdio server transports. [1]

> **Use `slack_identity_auth` for the MCP server.** It provides signed Slack user and workspace identity to Light Labs without a second end-user consent flow. The app still needs its own Slack OAuth client registration for workspace installation and the persisted bot token used to retrieve authorized Slack files. [1]

## Create the Slack OAuth client

Create or update the single **Light Labs Triage** Slack app in the Slack developer portal. Register the redirect URL below in the app’s OAuth settings, then copy the generated client ID, client secret, app ID, and signing secret into the existing server-side configuration. The code keeps the client secret and workspace bot token out of browser code, Slack message text, and MCP responses.

| Configuration field | Required value | Persistence / purpose |
|---|---|---|
| OAuth redirect URL | `https://lighttriage-gdngkmys.manus.space/integrations/slack/oauth/callback` | Slack returns the installation code here. The one-time state is hash-stored in `slack_oauth_states`. |
| Client ID | Existing `SLACK_CLIENT_ID` server secret | Identifies the registered Light Labs Slack app during installation. |
| Client secret | Existing `SLACK_CLIENT_SECRET` server secret | Used only server-side to exchange the installation code. |
| Signing secret | Existing `SLACK_SIGNING_SECRET` server secret | Validates every Events API and MCP request before identity metadata is read. |
| App ID | Existing `SLACK_APP_ID` server secret | Recorded with the workspace installation and may be used for future event-envelope validation. |
| Workspace installation | Started by the admin-only `slackInstallation.begin` console procedure | Encrypted bot token and granted scopes persist in `slack_app_installations`; this is not per-session cache. |

## Slack app manifest

Apply the following manifest in the Slack developer portal, substituting only presentation values if required. Install or reinstall the app after applying it so `files:read` is granted. Slack documents that `mcp:connect` is required to connect the Slackbot MCP client, while `files:read` permits the installed app to retrieve file metadata and download workspace files visible to the app. [1] [2]

```json
{
  "display_information": {
    "name": "Light Labs Triage",
    "description": "Account-bound triage, document extraction, and secure file retrieval for Light Labs"
  },
  "features": {
    "bot_user": {
      "display_name": "Light Labs Triage",
      "always_online": false
    }
  },
  "oauth_config": {
    "redirect_urls": [
      "https://lighttriage-gdngkmys.manus.space/integrations/slack/oauth/callback"
    ],
    "scopes": {
      "bot": [
        "mcp:connect",
        "users:read",
        "users:read.email",
        "files:read",
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

## Trust and persistence model

The endpoint first validates Slack’s HMAC request signature and timestamp using the raw request body. Only after verification does it read `params._meta.slack`. Slack explicitly warns that this metadata is ordinary JSON until signature validation succeeds. [1] The Streamable HTTP implementation supports HTTP POST requests and valid SSE-formatted responses. It intentionally uses **stateless request-scoped transport** because identity, authorization, installation, documents, extraction records, and delivery logs are database-backed rather than held in process memory. Streamable HTTP permits stateless server implementations and does not require an MCP session ID. [3]

| Requested control | Implemented behavior |
|---|---|
| Slack Identity Auth | Reads only verified `_meta.slack.user_id`, `team_id`, and optional enterprise ID after HMAC validation. |
| OAuth client registration | Uses the Light Labs Slack app’s OAuth client for app installation, not a separate external MCP OAuth provider. |
| First-connect binding | Data-bearing requests resolve either an approved internal team member or a `bound` record in `slack_account_bindings`, plus an active canonical account membership. Unbound identities are persisted as pending review requests and receive no data. |
| Durable installation memory | `slack_oauth_states` stores only one-time hashed state; `slack_app_installations` stores encrypted bot tokens, granted scopes, workspace and enterprise IDs. |
| Document persistence | `mcp_documents` stores metadata and secure object-storage keys, never file bytes in the database. |
| Extraction audit | `mcp_document_extractions` records the explicit field-to-table/column mapping, model, status, and returned values. It is a staging record and never writes directly to operational tables. |
| File delivery audit | `mcp_document_file_deliveries` records the signed Slack caller and every issued short-lived file link. |

## MCP capability map

MCP discovery exposes **tools, prompts, and resources**. Tool results include Slack Block Kit metadata for native list, document, and secure-file layouts when Slackbot advertises support for `io.slack/block-kit`; regular text remains a fallback. Slack supports Block Kit tool responses using the `io.slack/block-kit` extension and allows interactive HTML/JS MCP Apps as a future enhancement. [4]

| Capability | MCP name | Authorization and effect |
|---|---|---|
| Resource | `lightlabs://capabilities` | Returns the versioned capability and trust-boundary map. |
| Prompts | `lightlabs.triage_review`; `lightlabs.shipping_label_lookup` | Supplies controlled task framing for triage review and account-scoped file lookup. |
| Triage | `triage.retrieve_knowledge`; `triage.get_knowledge_section` | Requires a verified signed identity. Returns approved cited knowledge only. |
| Staff triage | `triage.search_queue`; `triage.get_interaction` | Requires an approved internal staff mapping and normal queue ownership checks. |
| Attachment intake | `documents.ingest_slack_file` | Uses only the workspace’s encrypted installation token to call Slack’s files API, copies the selected file to secure object storage, and associates it with an authorized account. |
| Structured extraction | `documents.extract_to_staging` | Supports PDF, DOCX, XLSX/XLS, CSV, JSON, Markdown, text, and images. `gpt-5-mini` extracts only declared fields and returns `null` for unstated values. The output is stored for review; direct operational writes are deliberately absent. |
| File retrieval | `files.search_saved`; `files.get_secure_delivery_link` | Searches the caller-authorized account only and returns a short-lived storage URL with a Block Kit download button. A shipping-label request is handled through this pair. |

## Local Inspector verification

Run the following from the repository to open the requested Python Inspector workflow. The development-only proxy signs requests exactly as Slack would, then validates the production TypeScript transport’s `initialize`, `tools/list`, `prompts/list`, and `resources/list` calls. It does not introduce an unauthenticated endpoint.

```bash
cd /home/ubuntu/lightlabs-ae-triage-console
mcp dev mcp_server.py
```

The initial Inspector run successfully discovered protocol version `2025-06-18`, eight production tools, two prompts, and the capability resource. Automated validation subsequently passed **44 test files with 170 passing tests and 2 intentional skips** against a disposable database.

## Operational boundaries

The application does not post messages or upload files to Slack automatically, and it does not expose arbitrary SQL, arbitrary object-storage access, or direct writes to operational business tables. The extraction workflow creates an auditable staging record so a named Light Labs reviewer can approve downstream insertion rules before they are introduced. This preserves the account-binding and human-accountability controls while enabling Slackbot to return polished native layouts.

## References

[1]: https://docs.slack.dev/ai/slackbot-mcp-client/ "Connecting an MCP server to the Slackbot MCP Client"
[2]: https://docs.slack.dev/reference/scopes/files.read "files:read scope"
[3]: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports "Model Context Protocol: Streamable HTTP"
[4]: https://docs.slack.dev/ai/slackbot-mcp-client/returning-rich-responses "Returning rich responses to the Slackbot MCP Client"
