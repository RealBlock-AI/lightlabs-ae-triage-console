import { resolveTestDatabase } from "./server/testDatabaseGuard";

export default async function setup() {
  const decision = resolveTestDatabase({
    databaseUrl: process.env.DATABASE_URL,
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    allowOverride: process.env.ALLOW_TESTS_AGAINST_DATABASE_URL === "1",
  });

  if (decision.action !== "use") return;
  process.env.DATABASE_URL = decision.url;

  const { ensureDemoData } = await import("./server/triage");
  const { seedDemoHubSpot } = await import("./server/demoHubspot");
  const { ensurePrototypeSeed } = await import("./server/prototypeSeed");
  await ensureDemoData();
  await seedDemoHubSpot();
  await ensurePrototypeSeed();
}
