import { describe, expect, it } from "vitest";
import { isVerifiedSlackMessage, supportWorkflowFromInteraction } from "../client/src/lib/supportDemo";

describe("support demo model", () => {
  it("keeps only company-scoped, non-email events in the Slack support queue", () => {
    expect(isVerifiedSlackMessage({ source: "slack_demo", companyId: "co_lumen" })).toBe(true);
    expect(isVerifiedSlackMessage({ source: "email_demo", companyId: "co_lumen" })).toBe(false);
    expect(isVerifiedSlackMessage({ source: "slack_demo" })).toBe(false);
  });

  it("labels auto, reviewed, and pending support workflows consistently", () => {
    expect(supportWorkflowFromInteraction({ status: "auto_resolved", lane: "auto" })).toBe("AI resolved");
    expect(supportWorkflowFromInteraction({ lane: "escalate" })).toBe("Human review");
    expect(supportWorkflowFromInteraction({ lane: "unknown" })).toBe("In progress");
  });
});
