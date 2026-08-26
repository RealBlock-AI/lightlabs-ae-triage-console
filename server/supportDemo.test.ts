import { describe, expect, it } from "vitest";
import { isVerifiedSlackMessage, laneFromInteraction } from "../client/src/lib/supportDemo";

describe("support demo model", () => {
  it("keeps only company-scoped, non-email events in the Slack support queue", () => {
    expect(isVerifiedSlackMessage({ source: "slack_demo", companyId: "co_lumen" })).toBe(true);
    expect(isVerifiedSlackMessage({ source: "email_demo", companyId: "co_lumen" })).toBe(false);
    expect(isVerifiedSlackMessage({ source: "slack_demo" })).toBe(false);
  });

  it("carries the stored lane through, and never downgrades an unknown one to auto", () => {
    expect(laneFromInteraction({ lane: "auto" })).toBe("auto");
    expect(laneFromInteraction({ lane: "assisted" })).toBe("assisted");
    expect(laneFromInteraction({ lane: "escalate" })).toBe("escalate");
    // An unclassifiable row is one a human should look at.
    expect(laneFromInteraction({ lane: "unknown" })).toBe("escalate");
    expect(laneFromInteraction({})).toBe("escalate");
  });
});
