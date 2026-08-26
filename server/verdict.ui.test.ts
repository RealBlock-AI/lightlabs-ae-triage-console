import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The verdict component's non-negotiables, asserted at the source level in the
 * repo's existing UI-contract style.
 *
 * Measured in a browser at the time of writing: both branches 310x111 with
 * identical type, and an 82px gutter, across all three fixtures.
 */
describe("Verdict component contract", () => {
  it("renders both branches through one renderer, so they cannot drift", async () => {
    const source = await readFile(join(process.cwd(), "client/src/components/Verdict.tsx"), "utf8");

    // One Branch function, used for both sides.
    expect(source.match(/function Branch\(/g)).toHaveLength(1);
    expect(source.match(/<Branch branch=\{branches\[[01]\]\} \/>/g)).toHaveLength(2);
    expect(source).toContain("<Branch branch={branches[0]} />");
    expect(source).toContain("<Branch branch={branches[1]} />");

    // Neither side may carry styling the other does not.
    expect(source).not.toMatch(/branches\[0\][\s\S]{0,80}className/);

    // Equal share of the slab, and the gutter is the fixed centre of gravity.
    expect(source).toContain("flex-1");
    expect(source).toContain("w-[82px]");
    expect(source).toContain("items-stretch");

    // A refusal is a result: the footer is a finding, never an error state.
    expect(source).toContain("lane-escalate");
    expect(source).not.toMatch(/destructive|text-red-|bg-red-/);
  });

  it("types the branches as exactly two", async () => {
    const [component, projection] = await Promise.all([
      readFile(join(process.cwd(), "client/src/components/Verdict.tsx"), "utf8"),
      readFile(join(process.cwd(), "server/verdict.ts"), "utf8"),
    ]);
    expect(component).toContain("readonly [VerdictBranch, VerdictBranch]");
    expect(projection).toContain("readonly [VerdictBranch, VerdictBranch]");
  });
});
