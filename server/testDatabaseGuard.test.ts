import { describe, expect, it } from "vitest";
import { isSameDatabase, resolveTestDatabase } from "./testDatabaseGuard";

const PROD = 'mysql://user:pw@gateway05.us-east-1.prod.aws.tidbcloud.com:4000/appdb?ssl={"rejectUnauthorized":true}';
const SCRATCH = "mysql://user:pw@gateway05.us-east-1.prod.aws.tidbcloud.com:4000/appdb_test";

describe("test database guard", () => {
  it("refuses to write to the application database by default", () => {
    const decision = resolveTestDatabase({ databaseUrl: PROD });
    expect(decision.action).toBe("no-database");
    expect(decision.reason).toContain("destructive");
  });

  it("uses a scratch database when one is given", () => {
    const decision = resolveTestDatabase({ databaseUrl: PROD, testDatabaseUrl: SCRATCH });
    expect(decision).toEqual({ action: "use", url: SCRATCH, reason: "Using TEST_DATABASE_URL." });
  });

  it("catches a scratch URL that is secretly the application database", () => {
    // Same host, same database, different credentials - still the same rows.
    const disguised = "mysql://someone_else:other@gateway05.us-east-1.prod.aws.tidbcloud.com:4000/appdb";
    const decision = resolveTestDatabase({ databaseUrl: PROD, testDatabaseUrl: disguised });
    expect(decision.action).toBe("no-database");
    expect(decision.reason).toContain("same host and database");
  });

  it("allows the application database only on an explicit opt-in", () => {
    const decision = resolveTestDatabase({ databaseUrl: PROD, allowOverride: true });
    expect(decision.action).toBe("use");
    expect(decision.action === "use" && decision.url).toBe(PROD);
    expect(decision.reason).toContain("writes to this database");
  });

  it("lets the opt-in override the same-database check too", () => {
    const decision = resolveTestDatabase({ databaseUrl: PROD, testDatabaseUrl: PROD, allowOverride: true });
    expect(decision.action).toBe("use");
  });

  it("is quiet and safe when nothing is configured", () => {
    expect(resolveTestDatabase({}).action).toBe("no-database");
  });

  describe("same-database detection", () => {
    it("ignores credentials and query strings", () => {
      expect(isSameDatabase(PROD, "mysql://a:b@gateway05.us-east-1.prod.aws.tidbcloud.com:4000/appdb")).toBe(true);
    });
    it("treats a different database name as different", () => {
      expect(isSameDatabase(PROD, SCRATCH)).toBe(false);
    });
    it("treats a different host as different", () => {
      expect(isSameDatabase(PROD, "mysql://user:pw@localhost:4000/appdb")).toBe(false);
    });
    it("does not crash on an unparseable value", () => {
      expect(isSameDatabase(PROD, "not a url")).toBe(false);
      expect(isSameDatabase(undefined, PROD)).toBe(false);
    });
  });
});
