import { resolveTestDatabase } from "./server/testDatabaseGuard";

/**
 * Runs before every test file. See server/testDatabaseGuard.ts for why.
 *
 * This deliberately rewrites DATABASE_URL for the test process: everything
 * downstream (getDb, drizzle, the routers) reads that one variable, so pointing
 * it somewhere safe is the only change that covers all of them at once.
 */
const decision = resolveTestDatabase({
  databaseUrl: process.env.DATABASE_URL,
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  allowOverride: process.env.ALLOW_TESTS_AGAINST_DATABASE_URL === "1",
});

if (decision.action === "use") {
  process.env.DATABASE_URL = decision.url;
} else {
  // Unset rather than throw. A misconfiguration must not take down the pure
  // unit tests; the database-backed ones fail on their own, as they do today.
  delete process.env.DATABASE_URL;
}

if (!process.env.VITEST_QUIET_DB_GUARD) {
  console.info(`[test database] ${decision.reason}`);
}
