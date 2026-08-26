# Project TODO

- [x] Inventory the externally updated codebase, Drizzle migrations, and current database schema.
- [x] Identify required schema migrations and any idempotent data/backfill steps.
- [x] Backfill missing email contact identities for the externally synchronized contact records.
- [x] Backfill missing knowledge-document sections for indexed knowledge records.
- [x] Apply the approved database migrations and required data updates.
- [x] Verify complete table, column, index, and constraint parity against the final Drizzle snapshot.
- [ ] Validate schema parity, migration state, automated tests, and application startup.
- [x] Validate the reconciled migration state, TypeScript compilation, and production build.
- [ ] Resolve the existing persistent-database test isolation conflicts before treating the full Vitest suite as green.
- [ ] Save a checkpoint documenting the completed migration reconciliation.
