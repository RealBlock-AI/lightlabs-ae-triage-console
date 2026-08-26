import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Decision packet contract", () => {
  it("keeps the design's load-bearing details", async () => {
    const page = await readFile(join(process.cwd(), "client/src/pages/PrototypeInteraction.tsx"), "utf8");

    // Two equal columns: why on the left, what do I do on the right.
    expect(page).toContain("lg:grid-cols-2");

    // The customer's words carry the only left-rail accent in the design.
    expect(page).toContain("Customer, verbatim");
    expect(page).toContain("border-l-[3px]");
    expect(page).toContain("italic");

    // Passes are shown and unreached checks are marked, never omitted.
    expect(page).toContain("Gate trace");
    expect(page).toContain("not_reached");
    expect(page).toContain('row.status === "stop" ? "lane-escalate"');

    // The sentence that stops confidence being read as the decision, kept
    // adjacent to the number.
    expect(page).toContain("did not set this lane");

    // A refusal is a result: findings are never error-styled or greyed out.
    expect(page).toContain("finding");
    expect(page).not.toMatch(/text-red-|bg-red-|destructive|opacity-4\d/);

    // The lane decides the primary action, and an override needs a reason.
    expect(page).toContain("Override + reason");
    expect(page).toContain("Record override");
    expect(page).toContain("disabled={!reason.trim()");

    // Escape returns to the queue.
    expect(page).toContain('event.key === "Escape"');

    // Lane colour resolves through the shared module.
    expect(page).toContain('from "@/lib/lane"');
    expect(page).not.toMatch(/bg-(rose|emerald|amber)-\d{2,3}/);
  });

  it("enforces the override reason on the server, not only in the UI", async () => {
    const [server, router] = await Promise.all([
      readFile(join(process.cwd(), "server/prototype.ts"), "utf8"),
      readFile(join(process.cwd(), "server/routers.ts"), "utf8"),
    ]);
    expect(server).toContain('if (input.action === "override" && !reason) throw new Error("An override requires a reason.");');
    expect(router).toContain("overrideReason: z.string().trim().min(1).optional()");
    // A human decision must never be recorded as auto_resolved.
    expect(server).toContain('input.action === "send" && row.lane === "auto" ? "auto_resolved" as const');
  });
});
