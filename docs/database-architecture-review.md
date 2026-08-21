# Light Labs Database Architecture Review

## Executive assessment

The database should **not** add a physical `contacts` column to `accounts`. It already has the correct first-normal-form relationship: one account maps to many contact rows through `contacts.account_id`. A JSON or comma-separated `accounts.contacts` column would duplicate identity data, prevent reliable uniqueness checks, and make verified Slack/HubSpot matching less safe.

The present knowledge tables are likewise **not three copies of the same data**. They represent source policy, versioned content, and retrieval audit events. The correct improvement is to preserve these separations while replacing the document’s generic `content` field with a Markdown-first document model and adding a first-class `knowledge_sections` table for targeted retrieval.

## Current production evidence

| Entity | Rows | What it indicates |
|---|---:|---|
| `accounts` | 7 | Small current account catalog; relationship design can change safely with a staged migration. |
| `contacts` | 7 | One contact per sample account today, but the schema already supports multiple contacts via `contacts.account_id`. |
| `knowledge_sources` | 39 | One canonical source/policy record per approved URL. |
| `knowledge_documents` | 119 total; 39 indexed | Multiple fetched versions per source are preserved; this is why documents should remain separate from sources. |
| `knowledge_retrieval_events` | 88 | Retrieval audit history; separate from content by design. |
| `interactions` | 799 | The operational event table is becoming the largest and needs stronger external-event and retention design. |

For the 39 active knowledge documents, all have a YAML summary and section index. Only one current document begins with a Markdown heading, though, so the stored `content` is currently text-like rather than explicitly readable Markdown. Active documents average approximately 29 KB, with the largest at approximately 186 KB. This validates the need for section-level retrieval instead of whole-document prompts.

## 1. Accounts and contacts: recommended verified identity model

### Do not add `accounts.contacts`

Keep the existing relationship:

```text
accounts 1 ──────< contacts
```

Expose it in the UI/API as an account’s `contacts` collection. If database convenience is required, add a **read-only view** or a query projection, not a mutable column:

```sql
SELECT a.*, JSON_ARRAYAGG(JSON_OBJECT(
  'id', c.id,
  'name', c.name,
  'email', c.email,
  'identity_status', c.identity_status
)) AS contacts
FROM accounts a
LEFT JOIN contacts c ON c.account_id = a.id
GROUP BY a.id;
```

### Replace provider-specific identity columns with a normalized bridge

The current `contacts` table stores `slack_user_id`, `slack_workspace_id`, `hubspot_portal_id`, and `hubspot_contact_id` directly. This works for one Slack workspace and one HubSpot portal, but it does not scale cleanly to multiple workspaces, multiple identities, identity rotation, or additional systems.

Add this table before deprecating the provider columns:

| Column | Recommended type | Notes |
|---|---|---|
| `id` | `CHAR(26)` ULID or existing `VARCHAR(96)` | Durable identity record ID. |
| `contact_id` | `VARCHAR(64)` FK → `contacts.id` | Parent Light Labs contact. |
| `provider` | closed enum: `slack`, `hubspot`, `email` | Stable provider vocabulary. |
| `tenant_id` | `VARCHAR(100)` | Slack team ID or HubSpot portal ID; required for tenant isolation. |
| `external_id` | `VARCHAR(255)` | Slack user ID or HubSpot contact ID. |
| `email_normalized` | `VARCHAR(320)` nullable | Lowercase canonical email only when permitted. |
| `email_hash` | `CHAR(64)` nullable | HMAC/SHA-256 lookup key for PII-minimized exact matching. |
| `verification_status` | enum: `pending`, `verified`, `revoked`, `expired` | Explicit lifecycle. |
| `verification_method` | enum: `admin_confirmed`, `hubspot_exact_email`, `provisioned`, `customer_claimed` | Explains why the mapping is trustworthy. |
| `verified_at`, `revoked_at` | UTC `DATETIME(3)` nullable | Temporal audit data. |
| `verified_by_user_id` | `VARCHAR(64)` FK → `users.id`/team member | Human accountability. |
| `attributes` | JSON nullable | Provider-specific non-critical metadata only. |

Add a unique constraint on `(provider, tenant_id, external_id)` and an index on `(contact_id, verification_status)`. This turns the incoming Slack check into an explicit three-step policy:

```text
(slack_team_id, slack_user_id)
  → verified contact_identity
  → active contact
  → account_id
```

The account is therefore resolved from the verified contact relationship—not supplied by Slack or Bobby as a claim. This meets the safety goal: a Slack payload must match both the contact identity and the contact’s account membership before any account data is attached.

### Optional future relationship

If one person can legitimately represent more than one account, replace the direct `contacts.account_id` with `account_contacts`:

| Column | Type | Purpose |
|---|---|---|
| `account_id`, `contact_id` | FKs | Many-to-many relationship. |
| `relationship_role` | enum: `qa`, `operations`, `founder`, `billing`, `other` | Account-specific role. |
| `is_primary` | boolean | One primary operational contact per account. |
| `active_from`, `active_to` | UTC timestamps | Preserves customer history. |

Do not add this table until a real multi-account contact requirement exists; today’s direct `contacts.account_id` is simpler and correct.

## 2. Why the knowledge tables remain separate

| Table | Correct responsibility | Why it should not be combined |
|---|---|---|
| `knowledge_sources` | Canonical URL, title, eligibility, answer-safety policy, crawl status | Source policy changes independently of content snapshots. One URL can have many fetched versions. |
| `knowledge_documents` | Immutable or superseded fetched content version, content hash, fetched/indexed timestamps | Content must be versioned to make citations reproducible and detect source changes. |
| `knowledge_retrieval_events` | Query/retrieval audit, gate decision, score, reason, interaction linkage | This is operational telemetry, not source content. It has a different retention and privacy policy. |

The current 39 sources versus 119 document versions confirms the separation is already useful. Combining the tables would either lose source history or duplicate source-policy data across every refresh.

### Markdown-first document revision

`MEDIUMTEXT` is the correct MySQL **storage type** for long Markdown. “Plain text” is a content-format issue, not a SQL-type problem. Retain `MEDIUMTEXT`, but rename or add a semantically clear column:

| Existing | Recommended | Type | Reason |
|---|---|---|---|
| `content` | `markdown_content` | `MEDIUMTEXT NOT NULL` | Makes rendering and agent behavior explicit. |
| — | `raw_content_ref` | `VARCHAR(512)` nullable | Optional S3 object reference for raw HTML/PDF; do not keep multiple large blobs in the database. |
| — | `content_format` | enum: `markdown`, `html`, `pdf_text`, `plain_text` | Records parser output. |
| — | `parser_version` | `VARCHAR(64)` | Reproducible conversion/indexing. |
| `summary_yaml` | `summary_yaml` | `MEDIUMTEXT` | YAML is human-readable and agent-friendly; use JSON as a generated/API projection only. |
| `section_index` | deprecated JSON cache | transitional only | Replace with relational sections below. |

Do not use “rich text” JSON as the canonical model. It is editor-specific and harder to cite, diff, index, or provide to an AI agent. Canonical **Markdown plus structured section rows** is more portable and auditable.

### Add `knowledge_sections`

Move the section index from a JSON blob into a table so the agent reads a retrieval plan, then only relevant sections.

| Column | Recommended type | Purpose |
|---|---|---|
| `id` | `CHAR(26)` or `VARCHAR(96)` | Section identifier. |
| `document_id` | FK → `knowledge_documents.id` | Version-specific citation. |
| `ordinal` | `INT UNSIGNED` | Preserves source order. |
| `heading_path` | `VARCHAR(1000)` | E.g. `Testing > Heavy Metals > Turnaround`. |
| `anchor` | `VARCHAR(255)` | Stable Markdown fragment/citation target. |
| `markdown_content` | `MEDIUMTEXT` | Only this focused section’s source text. |
| `excerpt` | `TEXT` | UI/retrieval preview. |
| `token_count` | `INT UNSIGNED` | Allows bounded context selection. |
| `content_hash` | `CHAR(64)` | Section-level change detection. |
| `answer_safety` | enum: `general_knowledge`, `review_required`, `blocked` | Granular policy within a document. |
| `effective_from`, `effective_to` | UTC timestamps | Supports versioned claims. |

Index `(document_id, ordinal)`, `(document_id, anchor)`, and a full-text index over a curated `search_text` field if MySQL full-text retrieval remains the retrieval strategy. If semantic retrieval is later required, maintain embeddings externally or in a dedicated vector-capable store; do not insert vectors into generic JSON.

## 3. Field-type and architecture improvements

| Area | Current concern | Recommended improvement |
|---|---|---|
| Money | `annual_spend INT` has no currency or precision policy | Use `annual_spend_minor BIGINT UNSIGNED` plus `currency_code CHAR(3)`, or `DECIMAL(19,4)` plus currency. Do not store ambiguous whole-dollar integers. |
| Booleans | `INT` is used for flags | Use `BOOLEAN`/`TINYINT(1)` semantics with names beginning `is_`, `has_`, `can_`; keep application validation. |
| External events | `channel_ref` is a derived dedupe key | Add `external_event_id VARCHAR(255)`, `source_schema_version`, `thread_ref`, `source_received_at`, and unique `(source, external_event_id)`. Keep `channel_ref` as a diagnostic fallback only. |
| Time | `DATETIME` fields rely on convention | Use UTC everywhere, preferably `DATETIME(3)` for request ordering and audit correlation. Retain original Slack `ts` separately as a string. |
| Relationships | Most IDs have no database foreign-key constraints | Add FKs gradually for `contacts → accounts`, `interactions → contacts/accounts/team_members`, `documents → sources`, and snapshots → contacts; use `RESTRICT` on deletion for audit-bearing records. |
| Result units | `unit VARCHAR(64)` permits drift | Add a controlled unit catalog/canonical unit code. Keep numeric `DECIMAL(14,4)`, original reported value, and conversion provenance. |
| Result semantics | `is_non_detect` plus nullable number is under-specified | Add `result_qualifier` enum (`detected`, `non_detect`, `estimated`, `not_tested`, `invalid`) and preserve `loq`. |
| Specs | Generic `scope` strings permit invalid combinations | Use closed enum, source version, `effective_from/to`, jurisdiction, and `citation_url`; retain `is_placeholder` only as a hard send-block. |
| Interaction evidence | Citations stored in JSON snapshot only | Keep immutable JSON snapshot for audit, but add `interaction_evidence` child rows for searchable/citable evidence provenance. |
| Retrieval telemetry | `query_text TEXT` may retain customer PII | Store `query_hash`, redacted preview, reason, retrieval policy version, and a retention policy. Keep raw query only if the legal/privacy policy permits it. |
| HubSpot snapshots | Context JSON is useful but large | Add `expires_at`, `schema_version`, `content_hash`, and `redaction_version`; avoid storing whole conversation bodies unless explicitly approved. |
| Audit logs | Integration audit lacks an explicit custom-bot source enum | Add surface `custom_bot_ingest` in a future migration rather than overloading `slack_ingest`; retain request/correlation IDs and redacted metadata only. |

## Recommended migration order

| Priority | Change | Risk | Precondition |
|---|---|---|---|
| P0 | Add `external_event_id`, source version, and idempotency constraint to interactions | Low | Backfill existing records from current channel references. |
| P0 | Add `contact_identities` and backfill current Slack/HubSpot fields | Low | Verify exact mappings; retain legacy columns read-only during transition. |
| P0 | Add `knowledge_sections`; backfill from current section index/Markdown converter | Low | Do not delete `section_index` until read paths have migrated. |
| P1 | Add `markdown_content`, `content_format`, parser metadata; populate via a clean source re-index | Medium | Preserve old `content` for rollback until content hashes reconcile. |
| P1 | Add money currency/minor-unit fields and typed result qualifiers | Medium | Require a data-owner mapping for existing values. |
| P2 | Add FKs, retention jobs, source-effective dates, and field-level PII policy | Medium | Resolve historical orphan records before constraining. |
| P2 | Replace direct contact account ownership with `account_contacts` only if a real multi-account requirement exists | Medium | Preserve the current direct relationship otherwise. |

## Implementation recommendation

Approve the following as the next safe schema release: **(1) contact identities, (2) external-event ID, and (3) knowledge sections plus Markdown content metadata.** These improve safety and retrieval quality without changing customer-facing behavior. Defer the `account_contacts` many-to-many table, financial type migration, and broad foreign keys until real production data and ownership rules are available.
