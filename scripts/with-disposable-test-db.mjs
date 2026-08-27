import { spawn } from "node:child_process";

const disposableDatabase = "lightlabs_ae_triage_validation_20260826";
const mode = process.argv[2];

if (mode !== "migrate" && mode !== "test") {
  throw new Error("Usage: node scripts/with-disposable-test-db.mjs <migrate|test>");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to derive the disposable database connection.");
}

const testDatabaseUrl = new URL(process.env.DATABASE_URL);
testDatabaseUrl.pathname = `/${disposableDatabase}`;

const command = mode === "migrate" ? "pnpm" : "pnpm";
const args = mode === "migrate" ? ["drizzle-kit", "migrate"] : ["test", "--", "--no-file-parallelism"];
const environment = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl.toString(),
  TEST_DATABASE_URL: testDatabaseUrl.toString(),
  ALLOW_TESTS_AGAINST_DATABASE_URL: "1",
};

const child = spawn(command, args, { cwd: new URL("..", import.meta.url), env: environment, stdio: "inherit" });
child.on("exit", code => process.exit(code ?? 1));
