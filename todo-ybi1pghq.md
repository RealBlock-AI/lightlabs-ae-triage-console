# Project TODO

- [x] Replace the inline `/mcp` handler with a standards-compliant Streamable HTTP transport that supports the MCP HTTP method lifecycle and validates the signed Slack request before trusting identity metadata.
- [x] Persist Slack app installation/OAuth metadata and bind every accepted Slack Identity request to a durable approved internal identity or previously verified account binding.
- [x] Add a versioned MCP capability registry that exposes tools, prompts, resources, rich Block Kit metadata, and clear authorization annotations.
- [x] Add durable document and file metadata storage with tenant/account access control, extraction status, provenance, and audit records.
- [x] Implement permissioned MCP document extraction, structured field mapping, and saved-file retrieval tools with secure delivery URLs.
- [x] Add automated tests for Streamable HTTP behavior, signature and binding authorization, persistent installation records, and document/file tool access.
- [x] Run a local Inspector-compatible protocol smoke test, verify the build, and document the Slack app registration configuration.
- [x] Test durable Slack OAuth state creation, one-time consumption, encrypted installation-token persistence, and installation updates without relying on process cache.
- [x] Test authorized and unauthorized account access across document search, extraction staging, ingestion guards, and secure file delivery.
- [x] Test that invalid Slack request signatures are rejected before MCP discovery or tool dispatch.
- [x] Test successful authorized Slack-file ingestion and document extraction staging with mocked external services.
