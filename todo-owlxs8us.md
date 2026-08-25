# Project TODO

- [x] Add demo HubSpot field definitions, companies, contacts, deals, access policies, verification attempts, and write-audit schema
- [x] Generate and apply the database migration for the demo HubSpot source of truth
- [x] Add idempotent seeded demo HubSpot data and verification fixtures
- [x] Implement field-level permissions, CRUD procedures, and audited writes
- [x] Implement the schema 0.1 Slack verification claim payload contract
- [x] Implement independent name, email, and company evaluators with deterministic agreement rules
- [x] Implement claim-id idempotency, ambiguity handling, Slack ID write-back, and direct Slack identity lookup
- [x] Build the native Demo HubSpot account, contact, deal, field catalog, and verification UI
- [x] Update ContactMapping and Integrations navigation for the demo workflow
- [x] Add or update Vitest coverage for schema, permissions, seed, verification, idempotency, and no-write paths
- [x] Run typecheck, tests, build, and visual verification
- [x] Save a checkpoint with all completed items marked complete
- [x] Enforce demoHubspotAccessPolicies for field-level read/write decisions and add full audited upsert procedures for companies, contacts, and deals
- [x] Update ContactMapping to support the demo verification workflow and distinguish it from live HubSpot mapping
- [x] Add Vitest coverage for seed idempotency, permission enforcement, verification resolve/no-write outcomes, duplicate Slack IDs, claim replay, and audited writes

- [x] Audit identity, account, contact, team-member, product, HubSpot, testing-platform, and Slack schema relationships
- [x] Define and document users as the single identity source of truth across internal and external people
- [x] Make role and login method explicit enums and align identifiers to HubSpot, testing platform, and Slack ownership
- [x] Clarify and migrate account mappings between the application, HubSpot company, and testing platform
- [x] Consolidate duplicated contact and team-member identity data into users through a safe non-destructive migration
- [x] Update verification services and UI contracts to resolve people through users first
- [x] Add migration and relationship tests, validate data integrity, and publish the completed architecture update
- [x] Add account membership modeling for buyer single-account membership and CoMan multi-account membership
- [x] Add CoMan-only membership entitlements including receive_coman_coas
- [x] Add required internal owner assignment for every customer account and account-user membership to support Slack routing

- [x] Backfill and verify explicit HubSpot and testing-platform identifiers for accounts and operational records without relying on legacy company_id semantics
- [x] Switch contact, team-member, verification, routing, and internal approval flows to users and account_memberships first
- [x] Add migration and integrity tests for buyer exclusivity, CoMan membership, COA entitlement, internal ownership, and canonical routing
- [x] Save the post-migration architecture checkpoint only after all canonicalization gaps are validated

- [x] Backfill explicit testing-platform IDs for operational records and retire legacy company_id from application semantics
- [x] Link legacy contact identity records to canonical users and remove contact-first assumptions from compatibility routing
- [x] Add positive CoMan multi-account and receive_coman_coas integrity coverage
- [x] Save the fully validated canonical architecture checkpoint

- [x] Move operational runtime reads and writes to explicit app_account_id and testing_platform identifiers
- [x] Make Slack candidate resolution accept canonical user IDs and use contacts only as a projection
- [x] Save the final canonical architecture checkpoint after runtime-path validation
