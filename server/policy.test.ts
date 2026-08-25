import { describe, expect, it } from "vitest";
import { AUTO_CONFIDENCE_FLOOR, CATEGORY_LANE, INTENTS, baseLane, demoteLane, enforceAutoLaneOutput } from "./policy";

describe("frozen triage policy", () => {
  it("has a frozen lane for every declared intent", () => {
    for (const intent of INTENTS) expect(CATEGORY_LANE[intent]).toBeDefined();
    expect(Object.isFrozen(CATEGORY_LANE)).toBe(true);
    expect(AUTO_CONFIDENCE_FLOOR).toBe(.9);
  });

  it("takes maximum severity across mixed intents and never promotes", () => {
    expect(baseLane(["ORDER_STATUS", "PRICING_QUOTE"])).toBe("assisted");
    expect(baseLane(["ORDER_STATUS", "HUMAN_ESCALATION_REQUEST"])).toBe("escalate");
    expect(demoteLane("assisted", "auto")).toBe("assisted");
  });

  it("demotes price language found in an otherwise auto-ready draft", () => {
    const result = enforceAutoLaneOutput("auto", "The cost is $450 per sample.");
    expect(result.lane).toBe("assisted");
    expect(result.demotions[0]).toContain("PRICE");
  });
});
