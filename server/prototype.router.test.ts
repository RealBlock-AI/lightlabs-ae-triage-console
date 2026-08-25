import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { ensureDemoData } from "./triage";

function context(): TrpcContext {
  return { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
}

function adminContext(): TrpcContext {
  return { user: { id: 999, openId: "integration-admin", name: "Integration Admin", email: "admin@example.com", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
}

describe("canonical prototype router", () => {
  it("retires the legacy fixture API instead of exposing its queue", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.triage.queue({ viewerId: "usr_sarah" })).resolves.toMatchObject({ retired: true });
  });

  it("returns capacity values through the canonical server-side computation", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.prototype.capacity({ n: .05, d: .68, t: 6.7 })).resolves.toMatchObject({ multiple: expect.closeTo(10.5, 0), ceiling: 20, points: expect.any(Array) });
  });

  it("stages a customer identity write for exact HubSpot-email verification", async () => {
    await ensureDemoData();
    const caller = appRouter.createCaller(adminContext());
    const suffix = Date.now();
    await expect(caller.identity.writePending({ accountId: "acct_northwind", name: "Integration Candidate", email: `candidate-${suffix}@example.com`, slackWorkspaceId: `T_ID_${suffix}`, slackUserId: `U_ID_${suffix}` })).resolves.toMatchObject({ identityStatus: "pending", disposition: "pending_exact_hubspot_email" });
  }, 15_000);
});
