import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Follows the repo's existing UI-contract convention (see bindingReview.ui.test.ts):
 * assert on the page source for the properties the design treats as load-bearing,
 * rather than standing up a renderer.
 */
describe("Queue screen contract", () => {
  it("holds the design's non-negotiables", async () => {
    const root = process.cwd();
    const [page, css] = await Promise.all([
      readFile(join(root, "client/src/pages/PrototypeConsole.tsx"), "utf8"),
      readFile(join(root, "client/src/index.css"), "utf8"),
    ]);

    // Lane colour resolves through the shared module - never a palette class.
    expect(page).toContain('from "@/lib/lane"');
    expect(page).not.toMatch(/bg-(rose|emerald|amber)-\d{2,3}/);

    // Confidence is last, and small and muted rather than bold.
    expect(page).toContain("Confidence");
    expect(page.indexOf('key: "confidence"')).toBeGreaterThan(page.indexOf('key: "sla"'));
    // Confidence stays small and faint: it is context for the lane, never a
    // number an AE is meant to act on. The faintness is now a role rather than
    // a hex, so it holds in both themes instead of only the light one.
    expect(page).toMatch(/confidence[\s\S]{0,200}text-\[11px\][\s\S]{0,40}text-ink-faint/i);

    // The SLA cell is the only thing in the row that changes colour.
    expect(page).toContain("row.slaUrgent ? \"lane-ink-escalate\"");

    // The filter is in the URL, so a filtered queue is linkable.
    expect(page).toContain("?lane=");
    expect(page).toContain("useSearch");

    // Arrow keys move the selection, Enter opens, and the selection stays visible.
    expect(page).toContain('"ArrowDown"');
    expect(page).toContain('"ArrowUp"');
    expect(page).toContain('"Enter"');
    expect(page).toContain("scrollIntoView");

    // The queue table opts out of the generic table styling, which would
    // otherwise right-align the reason line and blow the row-height budget.
    expect(page).toContain("qtable");
    expect(css).toContain(".qtable td:last-child");
    expect(css).toContain(".qtable tbody > tr:last-child > td");
  });

  it("no longer carries the retired workflow vocabulary", async () => {
    const model = await readFile(join(process.cwd(), "client/src/lib/supportDemo.ts"), "utf8");
    expect(model).not.toContain("AI resolved");
    expect(model).not.toContain("Human review");
    expect(model).toContain("laneFromInteraction");
  });
});
