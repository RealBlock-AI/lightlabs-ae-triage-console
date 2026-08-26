# Testing and databases

## The hazard this closes

The test suite is destructive. It inserts, updates and deletes across
`contacts`, `slack_account_bindings`, `interactions`, `hubspot_context_snapshots`
and others, and several files seed data before asserting on it.

It read its connection from `DATABASE_URL` — the same variable the running
application uses. Nothing prevented those from being the same database.

The suite happened not to touch production only because vitest does not load
`.env`. That is an accident, not a safeguard, and it disappears the moment
anyone runs `set -a; . ./.env`, exports the variable in a shell, or sets it in
CI.

## How it works now

`vitest.setup.ts` runs before every test file and decides which database, if
any, the test process may talk to. The rules live in
`server/testDatabaseGuard.ts` as a pure function, and are unit tested.

| `TEST_DATABASE_URL` | `DATABASE_URL` | Result |
| --- | --- | --- |
| set, different database | set | Tests use `TEST_DATABASE_URL` |
| set, **same** host + database | set | Refused — `DATABASE_URL` is unset for the run |
| not set | set | Refused — `DATABASE_URL` is unset for the run |
| not set | not set | No database; pure tests run normally |

"Same database" compares host and database name, so a URL with different
credentials pointing at the same rows is still caught.

The guard **unsets** `DATABASE_URL` rather than throwing. A misconfiguration must
not take down the pure unit tests, which need no database at all. Tests that do
need one then fail on their own — the same outcome as before, except the reason
is now printed instead of surfacing as `Cannot read properties of null`.

## Running the database-backed tests

Point `TEST_DATABASE_URL` at a scratch database. On TiDB Cloud Serverless a
branch of the main cluster works well, since it starts as a copy and can be
thrown away.

```sh
TEST_DATABASE_URL='mysql://user:pw@host:4000/appdb_test' pnpm test
```

If you genuinely intend to run against the application database — restoring a
broken environment, say — the opt-in is explicit and says what it does:

```sh
ALLOW_TESTS_AGAINST_DATABASE_URL=1 pnpm test   # this WILL write to DATABASE_URL
```

## Still outstanding

**The migration journal is out of sync.** `__drizzle_migrations` holds one row
against 26 migration files, so `drizzle-kit migrate` — and therefore
`pnpm db:push` — would replay migrations 0001–0025 over tables that already
exist. Apply schema changes individually until that is reconciled.

**The database-backed tests fail rather than skip** when no test database is
configured. Converting them to skip cleanly would mean a `describeWithDatabase`
helper across ~19 files; worth doing, but it is a separate change from closing
the hazard.
