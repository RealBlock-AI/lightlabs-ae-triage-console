import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The reconcile script is how the journal table gets told about migrations that
// were applied out of band. It only works if it lists every migration - a gap is
// invisible until `drizzle-kit migrate` replays an applied one and fails. That is
// exactly what happened with 0025: an unguarded ADD COLUMN, absent from the
// script's reach, which would have broken the first real migrate run.

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
  entries: Array<{ tag: string; when: number }>;
};
const script = readFileSync("scripts/reconcile-drizzle-journal.sql", "utf8");

const hashOf = (tag: string) => createHash("sha256").update(readFileSync(`drizzle/${tag}.sql`)).digest("hex");

describe("the drizzle journal reconcile script", () => {
  it("covers every migration in the journal", () => {
    const missing = journal.entries.filter(entry => !script.includes(hashOf(entry.tag))).map(entry => entry.tag);
    expect(missing).toEqual([]);
  });

  it("pairs each hash with the timestamp drizzle records for it", () => {
    // drizzle matches on hash, but a wrong created_at reorders the journal and
    // makes the next `migrate` run apply things out of sequence.
    const wrong = journal.entries.filter(entry => !script.includes(`'${hashOf(entry.tag)}', ${entry.when}`)).map(entry => entry.tag);
    expect(wrong).toEqual([]);
  });

  it("inserts nothing the journal does not know about", () => {
    const inScript = script.match(/SELECT '([0-9a-f]{64})'/g) ?? [];
    expect(inScript.length).toBe(journal.entries.length);
  });

  it("guards every insert so a rerun is harmless", () => {
    const inserts = (script.match(/INSERT INTO `__drizzle_migrations`/g) ?? []).length;
    const guards = (script.match(/WHERE NOT EXISTS \(SELECT 1 FROM `__drizzle_migrations`/g) ?? []).length;
    expect(guards).toBe(inserts);
  });
});
