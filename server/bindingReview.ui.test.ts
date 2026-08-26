import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Binding Review portal route contract", () => {
  it("registers list and deep-link routes and exposes the administrator decision controls", async () => {
    const root = process.cwd();
    const [app, page] = await Promise.all([
      readFile(join(root, "client/src/App.tsx"), "utf8"),
      readFile(join(root, "client/src/pages/BindingReview.tsx"), "utf8"),
    ]);
    expect(app).toContain('path="/bindings" component={BindingReview}');
    expect(app).toContain('path="/bindings/:bindingId" component={BindingReview}');
    expect(page).toContain("trpc.bindingReview.list.useQuery");
    expect(page).toContain("trpc.bindingReview.decide.useMutation");
    expect(page).toContain('action: "approve"');
    expect(page).toContain('action: "reject"');
    expect(page).toContain('action: "resolve_conflict"');
    expect(page).toContain("Open deep link");
  });
});
