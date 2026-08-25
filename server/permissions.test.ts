import { describe, expect, it } from "vitest";
import { assertResultVisible, ResultVisibilityError } from "./permissions";
import { ensurePrototypeSeed } from "./prototypeSeed";

describe("result visibility gate", () => {
  it("allows a direct permitted company member to access a released test", async () => {
    await ensurePrototypeSeed();
    await expect(assertResultVisible(9002, "test_lumen_8812", { reportRequired: true })).resolves.toMatchObject({ ownerCompanyId: "co_lumen", direct: true });
  }, 15_000);

  it("denies a user without the per-user result permission", async () => {
    await ensurePrototypeSeed();
    await expect(assertResultVisible(9004, "test_lumen_8812")).rejects.toMatchObject({ code: "RESULT_MEMBERSHIP_DENIED" satisfies ResultVisibilityError["code"] });
  }, 15_000);

  it("blocks a co-man from the specifically hidden brand partnership", async () => {
    await ensurePrototypeSeed();
    await expect(assertResultVisible(9003, "test_hidden", { reportRequired: true })).rejects.toMatchObject({ code: "RESULT_PARTNERSHIP_DENIED" satisfies ResultVisibilityError["code"] });
  }, 15_000);
});
