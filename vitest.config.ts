import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // Decides which database, if any, the suite may write to. The suite is
    // destructive; see server/testDatabaseGuard.ts.
    setupFiles: ["./vitest.setup.ts"],
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    testTimeout: 15_000,
  },
});
