/**
 * Keeps the test suite off the production database.
 *
 * The suite is destructive: it inserts, updates and deletes across contacts,
 * bindings, interactions and snapshots. It reads its connection from
 * DATABASE_URL, the same variable the running app uses.
 *
 * Nothing stopped those two from being the same database. The suite happened
 * not to touch production only because vitest does not load .env - an accident,
 * not a safeguard, and one that disappears the moment anyone exports
 * DATABASE_URL or sets it in CI.
 *
 * So the choice is made explicit here instead.
 */

export type GuardInput = {
  /** The application database, as the app itself would see it. */
  databaseUrl?: string;
  /** A separate, disposable database for tests to write to. */
  testDatabaseUrl?: string;
  /** Explicit "yes, I mean the real one" opt-in. */
  allowOverride?: boolean;
};

export type GuardDecision =
  | { action: "use"; url: string; reason: string }
  | { action: "no-database"; reason: string };

/** Same host and same database name is the same database, whatever the credentials. */
export function isSameDatabase(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    const parse = (value: string) => {
      const url = new URL(value);
      return `${url.host}${url.pathname}`.toLowerCase();
    };
    return parse(a) === parse(b);
  } catch {
    return false;
  }
}

/**
 * Decide which database - if any - the test process may talk to.
 *
 * Deliberately fails to "no database" rather than throwing: a bad configuration
 * must not take down the pure unit tests, which need no database at all. Tests
 * that do need one then fail on their own, which is the same outcome as today,
 * only now it is explained.
 */
export function resolveTestDatabase(input: GuardInput): GuardDecision {
  const { databaseUrl, testDatabaseUrl, allowOverride } = input;

  if (testDatabaseUrl) {
    if (isSameDatabase(testDatabaseUrl, databaseUrl) && !allowOverride) {
      return {
        action: "no-database",
        reason: "TEST_DATABASE_URL points at the same host and database as DATABASE_URL. Point it at a scratch database, or set ALLOW_TESTS_AGAINST_DATABASE_URL=1 if you genuinely mean to write to that one.",
      };
    }
    return { action: "use", url: testDatabaseUrl, reason: "Using TEST_DATABASE_URL." };
  }

  if (databaseUrl && allowOverride) {
    return {
      action: "use",
      url: databaseUrl,
      reason: "Using DATABASE_URL because ALLOW_TESTS_AGAINST_DATABASE_URL is set. The suite writes to this database.",
    };
  }

  if (databaseUrl) {
    return {
      action: "no-database",
      reason: "DATABASE_URL is set but TEST_DATABASE_URL is not. The suite is destructive, so it will not write to the application database. Set TEST_DATABASE_URL to a scratch database to run the database-backed tests.",
    };
  }

  return {
    action: "no-database",
    reason: "No TEST_DATABASE_URL is set, so database-backed tests will not run. Pure unit tests are unaffected.",
  };
}
