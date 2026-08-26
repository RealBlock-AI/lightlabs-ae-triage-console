import { and, eq, gt } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hubspotContextSnapshots } from "../drizzle/schema";
import { getDb } from "./db";
import { getBySlackIdentity } from "./demoHubspot";
import { getContactBySlackUser } from "./externalIdentity";
import { getOwnerPortfolio } from "./portfolioService";

const dbTest = process.env.DATABASE_URL ? it : it.skip;

describe("Launch99 Slack-to-app linkage", () => {
  dbTest("resolves Nic's verified Slack identity to Launch99 Agency, Sarah Chen, and fresh CRM context", async () => {
    const slackIdentity = await getBySlackIdentity("T091XR4PAQY", "U_DEMO_VERIFY");
    expect(slackIdentity).toMatchObject({
      contact: { id: "demo_ct_nic", verificationStatus: "verified" },
      account: { id: "acct_launch99", name: "Launch99 Agency", ownerId: "owner_sarah" },
    });

    const coreIdentity = await getContactBySlackUser({ workspaceId: "T091XR4PAQY", slackUserId: "U_DEMO_VERIFY" });
    expect(coreIdentity).toMatchObject({
      status: "verified",
      contact: { id: "con_launch99_nic", account_id: "acct_launch99", name: "Nic Thatcher" },
      internal_owner_user_id: 5910004,
    });

    const portfolio = await getOwnerPortfolio("owner_sarah");
    expect(portfolio.accounts).toContainEqual(expect.objectContaining({ id: "acct_launch99", name: "Launch99 Agency", accountType: "Brand", verifiedSlackContacts: ["Nic Thatcher"] }));

    const db = await getDb();
    const currentSnapshot = await db!.select().from(hubspotContextSnapshots).where(and(
      eq(hubspotContextSnapshots.contactId, "con_launch99_nic"),
      eq(hubspotContextSnapshots.status, "available"),
      gt(hubspotContextSnapshots.retrievedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
    )).limit(1);
    expect(currentSnapshot[0]).toMatchObject({ id: "hctx_launch99_current", hubspotContactId: "demo_ct_nic", status: "available" });
  });
});
