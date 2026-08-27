import { describe, expect, it } from "vitest";
import { corroborationOf, displacedBy, rankCrmMatches } from "./accountBinding";

const crm = (accountId: string | null, name: string | null, company: string | null) => ({ accountId, normalizedName: name, normalizedCompany: company });
const claimed = { full_name: "Nicolas Thatcher", company: "Harborline Foods" };

describe("matching a CRM record to an email claim", () => {
  it("matches on email even when Slack's real_name disagrees with the CRM spelling", () => {
    // The submission that failed on 26 August: the email matched exactly and the
    // name did not, and the old matcher treated that as no match at all.
    const { match, ambiguous } = rankCrmMatches([crm("acc_1", "nic thatcher", "harborline foods")], claimed);
    expect(match?.accountId).toBe("acc_1");
    expect(ambiguous).toBe(false);
  });

  it("matches on email alone when neither name nor company corroborates", () => {
    const { match, corroboration } = rankCrmMatches([crm("acc_1", "someone else", "another company")], claimed);
    expect(match?.accountId).toBe("acc_1");
    expect(corroboration).toBe(0);
  });

  it("prefers the better-corroborated record when an email appears twice", () => {
    const { match, ambiguous } = rankCrmMatches([crm("acc_weak", "someone else", "another company"), crm("acc_strong", "nicolas thatcher", "harborline foods")], claimed);
    expect(match?.accountId).toBe("acc_strong");
    expect(ambiguous).toBe(false);
  });

  it("declines to choose between two equally corroborated records", () => {
    const { match, ambiguous } = rankCrmMatches([crm("acc_a", "nicolas thatcher", "harborline foods"), crm("acc_b", "nicolas thatcher", "harborline foods")], claimed);
    expect(ambiguous).toBe(true);
    expect(match).toBeUndefined();
  });

  it("ignores records with no application account", () => {
    const { match } = rankCrmMatches([crm(null, "nicolas thatcher", "harborline foods"), crm("acc_1", "someone else", null)], claimed);
    expect(match?.accountId).toBe("acc_1");
  });

  it("returns no match when nothing shares the email", () => {
    expect(rankCrmMatches([], claimed)).toMatchObject({ match: undefined, ambiguous: false, corroboration: 0 });
  });

  it("scores name and company independently", () => {
    expect(corroborationOf(crm("a", "nicolas thatcher", "harborline foods"), claimed)).toBe(2);
    expect(corroborationOf(crm("a", "nicolas thatcher", "elsewhere"), claimed)).toBe(1);
    expect(corroborationOf(crm("a", null, null), claimed)).toBe(0);
  });
});

const claim = (bindingId: string, contactId: string | null, slackUserId: string) => ({ bindingId, contactId, slackTeamId: "T1", slackUserId });
const winner = { contactId: "c_1", slackTeamId: "T1", slackUserId: "U_new" };

describe("deciding which bound rows a new decision displaced", () => {
  it("displaces a row that held the Slack identity for a different contact", () => {
    expect(displacedBy([claim("bnd_old", "c_2", "U_new")], winner).map(row => row.bindingId)).toEqual(["bnd_old"]);
  });

  it("displaces a row that held the contact under a different Slack identity", () => {
    // This is the case the queue showed on 26 August: two `bound` rows for one
    // contact, because re-keying the contact never demoted the loser.
    expect(displacedBy([claim("bnd_old", "c_1", "U_old")], winner).map(row => row.bindingId)).toEqual(["bnd_old"]);
  });

  it("leaves a resubmission of the same link alone", () => {
    expect(displacedBy([claim("bnd_same", "c_1", "U_new")], winner)).toEqual([]);
  });

  it("displaces a row that never resolved to a contact but claimed the identity", () => {
    expect(displacedBy([claim("bnd_unmatched", null, "U_new")], winner).map(row => row.bindingId)).toEqual(["bnd_unmatched"]);
  });
});
