import { describe, expect, it } from "vitest";
import { normalize, validateClaim, seedDemoHubSpot, demoStatus, previewVerification, verifyClaim, getDemoContact, getBySlackIdentity, type VerificationClaim } from "./demoHubspot";

const claim: VerificationClaim = {
  schema_version: "0.1",
  claim_id: "clm_demo_123456",
  submitted_at: "2026-08-25T18:04:11.482Z",
  slack_team_id: "T091XR4PAQY",
  slack_user_id: "U091XR4PTT2",
  slack_display_name: "Nic",
  claimed_full_name: "Nic Thatcher",
  claimed_email: "nthatcher@launch99.agency",
  claimed_company: "Launch99 Agency",
  claimed_email_source: "slack",
};

describe("demo HubSpot verification claim", () => {
  it("normalizes case, accents, punctuation, and whitespace consistently", () => {
    expect(normalize("  LÁUNCH99  Agency!! ")).toBe("launch99 agency");
    expect(normalize("NTHATCHER@LAUNCH99.AGENCY")).toBe("nthatcher@launch99.agency");
  });
  it("accepts the agreed schema and preserves the submitted timestamp", () => {
    expect(validateClaim(claim).toISOString()).toBe("2026-08-25T18:04:11.482Z");
  });
  it("rejects unsupported schema versions and non-UTC timestamps", () => {
    expect(() => validateClaim({ ...claim, schema_version: "0.2" as "0.1" })).toThrow("Unsupported verification schema version");
    expect(() => validateClaim({ ...claim, submitted_at: "2026-08-25T18:04:11.482-05:00" })).toThrow("ISO 8601 UTC");
  });
  it("rejects invalid provenance and missing identity hints", () => {
    expect(() => validateClaim({ ...claim, claimed_email_source: "unknown" as "slack" })).toThrow("claimed_email_source");
    expect(() => validateClaim({ ...claim, claimed_company: "" })).toThrow("Name, email, and company claims are required");
  });
});

const dbTest = process.env.DATABASE_URL ? it : it.skip;
describe("demo HubSpot database workflow", () => {
  dbTest("seeds idempotently and resolves a clean three-signal claim once", async () => {
    const first = await seedDemoHubSpot();
    const second = await seedDemoHubSpot();
    expect(second).toEqual(first);
    expect((await demoStatus()).counts).toMatchObject({ companies: 3, contacts: 4, deals: 2 });
    const cleanClaim = { ...claim, claim_id: "clm_demo_db_123456", slack_user_id: "U_DEMO_VERIFY" };
    const preview = await previewVerification(cleanClaim);
    expect(preview.status).toBe("verified");
    expect(preview.signals.name.candidates).toContain("demo_ct_nic");
    const result = await verifyClaim(cleanClaim, "1");
    const replay = await verifyClaim(cleanClaim, "1");
    expect(result).toEqual(replay);
    expect(result.writeAllowed).toBe(true);
    expect((await getDemoContact("demo_ct_nic"))?.slackId).toBe("U_DEMO_VERIFY");
    expect((await getBySlackIdentity("T091XR4PAQY", "U_DEMO_VERIFY"))?.contact.id).toBe("demo_ct_nic");
  });
});
