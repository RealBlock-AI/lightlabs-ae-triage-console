import { describe, expect, it } from "vitest";
import { AUTO_CONFIDENCE_FLOOR, CATEGORY_LANE, GATE_CHECKS, INTENTS, baseLane, declareGateChecks, demoteLane, enforceAutoLaneOutput, gateTrace } from "./policy";

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

/**
 * The packet reads the trace top to bottom. Passes are shown, the stopping row
 * is the only tinted one, and everything after it is marked "not reached" -
 * never omitted, because its absence is itself information.
 */
describe("gate trace", () => {
  const all = declareGateChecks(["OOS_RESULT"]);

  it("declares every check an out-of-spec result has to clear, in order", () => {
    expect(all).toEqual([...GATE_CHECKS]);
  });

  it("scopes the list to the intent, so nothing is listed that never applied", () => {
    // An order-status question owns no result and has no serving basis to agree on.
    expect(declareGateChecks(["ORDER_STATUS"])).toEqual(["identity_verified", "output_guard"]);
    expect(declareGateChecks(["REGULATORY_LIMIT_QUESTION"])).toContain("limit_resolved");
    expect(declareGateChecks(["REGULATORY_LIMIT_QUESTION"])).not.toContain("serving_basis_agreement");
  });

  it("emits the whole declared list even when nothing ran", () => {
    const rows = gateTrace(all).rows();
    expect(rows).toHaveLength(all.length);
    expect(rows.every(row => row.status === "not_reached")).toBe(true);
  });

  it("marks one stop and leaves everything after it not reached", () => {
    const trace = gateTrace(all);
    trace.pass("identity_verified", "contact_bindings");
    trace.pass("result_ownership", "accounts");
    trace.pass("limit_resolved", "test_limits");
    trace.stop("serving_basis_agreement", "stopped here");

    const rows = trace.rows();
    expect(rows.map(row => row.status)).toEqual(["pass", "pass", "pass", "stop", "not_reached"]);
    expect(rows.filter(row => row.status === "stop")).toHaveLength(1);
    expect(rows[4].read).toBe("not reached");
    expect(trace.stopped()).toBe(true);
  });

  it("records nothing after a stop, whatever the caller does next", () => {
    const trace = gateTrace(all);
    trace.stop("identity_verified", "contact_bindings");
    // A caller that keeps going must not be able to write a pass behind the stop.
    trace.pass("result_ownership", "accounts");
    trace.stop("limit_resolved", "test_limits");

    const rows = trace.rows();
    expect(rows[0].status).toBe("stop");
    expect(rows.slice(1).every(row => row.status === "not_reached")).toBe(true);
  });

  it("ignores a check that was never declared for this intent", () => {
    const trace = gateTrace(declareGateChecks(["ORDER_STATUS"]));
    trace.pass("serving_basis_agreement", "samples");
    expect(trace.rows().map(row => row.check)).toEqual(["identity_verified", "output_guard"]);
  });
});
