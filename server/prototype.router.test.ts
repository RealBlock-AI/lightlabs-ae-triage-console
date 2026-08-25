import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

function context(): TrpcContext {
  return { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
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
});
