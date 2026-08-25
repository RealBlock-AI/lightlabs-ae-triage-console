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
