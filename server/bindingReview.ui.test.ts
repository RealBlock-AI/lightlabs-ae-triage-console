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

  it("only offers Approve on a row the server can actually approve", async () => {
    // reviewBinding throws "This binding has no matched application contact and
    // cannot be approved until an AE maps it" when account_id is null, and the
    // card renders "No application match" right beside the button. Offering an
    // action that always fails is worse than not offering it.
    const page = await readFile(join(process.cwd(), "client/src/pages/BindingReview.tsx"), "utf8");
    expect(page).toContain("{binding.accountId ? <ActionButton label=\"Approve & bind\"");
    expect(page).toContain("Approval needs a matched application account.");
    // Reject stays available either way - an unmappable request still has to go
    // somewhere.
    const [, afterApprove] = page.split("Approval needs a matched application account.");
    expect(afterApprove).toContain('label="Reject request"');
  });
});
