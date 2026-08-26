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
    // A regulatory question resolves no limit in this pipeline: only OOS_RESULT
    // reaches assembleResultEvidence. Declaring limit_resolved here left a row
    // nothing could fill, and an unfilled row reads as "not reached" - which
    // says an earlier check stopped the run when none had.
    expect(declareGateChecks(["REGULATORY_LIMIT_QUESTION"])).not.toContain("limit_resolved");
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

describe("gate trace declarations match what the pipeline records", () => {
  // Result evidence is assembled only for OOS_RESULT, so these are the only
  // intents that can fill the result, limit and serving rows.
  it("declares only identity and the output guard for a label-claim question", () => {
    expect(declareGateChecks(["LABEL_CLAIM_VARIANCE"])).toEqual(["identity_verified", "output_guard"]);
  });

  it("declares only identity and the output guard for a regulatory question", () => {
    expect(declareGateChecks(["REGULATORY_LIMIT_QUESTION"])).toEqual(["identity_verified", "output_guard"]);
  });

  it("still declares the full chain for an out-of-spec result", () => {
    expect(declareGateChecks(["OOS_RESULT"])).toEqual([
      "identity_verified", "result_ownership", "limit_resolved", "serving_basis_agreement", "output_guard",
    ]);
  });

  /**
   * The invariant behind the fix: a declared check must be one some code path
   * can record. Otherwise it renders as "not reached" forever, asserting a stop
   * that never happened. Checked here rather than at runtime, because the
   * builder deliberately always emits the full declared list.
   */
  it("never declares a check no code path can record", () => {
    // What the pipeline records, by intent (prototype.ts): identity and the
    // output guard always; the result chain only under OOS_RESULT.
    const alwaysRecorded = ["identity_verified", "output_guard"];
    const underOosResult = ["result_ownership", "limit_resolved", "serving_basis_agreement"];
    for (const intent of INTENTS) {
      const recordable = new Set(intent === "OOS_RESULT" ? [...alwaysRecorded, ...underOosResult] : alwaysRecorded);
      for (const check of declareGateChecks([intent])) {
        expect(recordable.has(check), `${intent} declares ${check}, which nothing records`).toBe(true);
      }
    }
  });
});

describe("the data-export auto template clears its own output guard", () => {
  it("does not demote itself on pricing, regulatory or verdict language", () => {
    const draft = "There are 47 released test records on this account for the current year. The full history is available in the platform, where it can be reviewed and exported.";
    expect(enforceAutoLaneOutput("auto", draft).lane).toBe("auto");
  });
});
