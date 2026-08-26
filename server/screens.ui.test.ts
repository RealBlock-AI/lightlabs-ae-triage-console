import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(join(process.cwd(), path), "utf8");

describe("Policy simulator contract", () => {
  it("cannot change live routing, and says so", async () => {
    const [page, router] = await Promise.all([read("client/src/pages/Policy.tsx"), read("server/routers.ts")]);

    // Stated on screen, in the escalate colour.
    expect(page).toContain("what-if only · live routing unchanged");
    expect(page).toContain("lane-ink-escalate");

    // Proposals are local state and the server call is a query, never a mutation.
    expect(page).toContain("useState<Record<string, Lane>>");
    expect(page).toContain("trpc.prototype.simulate.useQuery");
    expect(page).not.toContain("useMutation");
    expect(router).toContain("simulate: publicProcedure");
    expect(router).toMatch(/simulate: publicProcedure[\s\S]{0,240}\.query\(/);

    // A moved row stays marked, and there is a visible way back to live.
    expect(page).toContain("moved · not saved");
    expect(page).toContain("reset to live");

    // The second number is the one that matters, and the sample is openable.
    expect(page).toContain("must not send automatically");
    expect(page).toContain("sample the");
  });
});

describe("Capacity contract", () => {
  it("draws a ceiling the curve approaches and never reaches", async () => {
    const [page, model] = await Promise.all([read("client/src/pages/Capacity.tsx"), read("client/src/lib/capacity.ts")]);

    // The ceiling exists because of a fixed per-account cost automation cannot
    // remove. Without it the curve would diverge and the screen would lie.
    expect(model).toContain("ACCOUNT_OVERHEAD_SECONDS");
    expect(model).toContain("hardCeiling");

    // Four sliders, recomputing on input.
    for (const key of ["questionsPerAccount", "autoShare", "secondsPerAssisted", "secondsPerEscalation"]) {
      expect(page).toContain(key);
    }
    expect(page).toContain('type="range"');

    // Axes as rules, no grid, and a dashed ceiling in the escalate ink.
    expect(page).toContain('strokeDasharray');
    expect(page).toContain("var(--lane-escalate-ink)");
    expect(page).toContain("hard ceiling");
    expect(page).toContain("auto share →");
    expect(page).not.toContain("<pattern");
  });
});

describe("Navigation", () => {
  it("registers the three new screens and keeps the existing ones", async () => {
    const [app, nav] = await Promise.all([read("client/src/App.tsx"), read("client/src/components/DashboardLayout.tsx")]);
    for (const path of ["/policy", "/capacity", "/interactions/:id", "/mappings", "/bindings", "/performance", "/integrations"]) {
      expect(app).toContain(`path="${path}"`);
    }
    for (const label of ["Queue", "Policy", "Capacity", "Account Mapping", "Binding Review", "Support Performance", "Integrations"]) {
      expect(nav).toContain(`label: "${label}"`);
    }
  });
});
