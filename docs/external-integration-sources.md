# External Integration Sources

## Slackbot MCP Client

Slack’s official custom-server guide is the governing source for the Light Labs MCP transport and authentication design. It states that remote MCP servers for Slackbot use **Streamable HTTP**, not standalone SSE or stdio. For **Slack Identity Auth**, each signed tool call carries the caller’s Slack `user_id`, `team_id`, and optional `enterprise_id` under `params._meta.slack`; the server must verify the Slack request signature before trusting those fields.

Tool discovery is intentionally non-sensitive. The server may expose its static tool catalog after signature verification, while every tool that returns Light Labs data must map the signed Slack identity to an authorized internal team member at the database boundary.

The Slack app must include the `mcp:connect` bot scope. Slack’s reference manifest for Identity Auth also lists `users:read` and `users:read.email` for profile lookup. The configured remote endpoint is `https://lighttriage-gdngkmys.manus.space/mcp` and the selected authentication type is **Slack Identity Auth**.

Source: [Slackbot MCP Client Guide](https://docs.slack.dev/ai/slackbot-mcp-client/)

## Slack Events API

The Events API remains the separate inbound message-delivery path. Light Labs accepts approved support events at `https://lighttriage-gdngkmys.manus.space/ingest`, verifies the Slack signature and replay timestamp, deduplicates the event, and runs the safety-first triage path. Slack documents that customer-message delivery and Slackbot MCP tool invocation are separate capabilities.

Source: [Slack Events API](https://docs.slack.dev/apis/events-api/)

## HubSpot Remote MCP

The Light Labs backend connects to HubSpot’s remote MCP service through OAuth 2.1 with PKCE and refresh-token rotation. The production runtime uses encrypted server-side storage; a task-scoped connector cannot substitute for the deployed web application’s own authorization connection. The first release constrains HubSpot usage to read-only contact, company, ticket, owner, and limited conversation metadata enrichment.

Source: [HubSpot Remote MCP Guide](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server)
