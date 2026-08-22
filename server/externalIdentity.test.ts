import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { externalSlackIdentityCandidates, interactions } from "../drizzle/schema";
import { getDb } from "./db";
import { captureExternalSlackIdentityCandidate, getContactBySlackUser, resolveExternalSlackIdentityCandidate } from "./externalIdentity";
import { ensureDemoData, runTriage } from "./triage";

describe("external Slack identity candidates", () => {
  it("keeps a first-contact bridge sender pending until exact-email mapping, then reconciles only the linked interaction", async () => {
    await ensureDemoData(); const workspaceId = `T_EXT_${Date.now()}`; const slackUserId = "U_EXT"; const triage = await runTriage({ source: "custom_slack_bot", channelRef: `custom|${workspaceId}|D_EXT:${Date.now()}`, externalEventId: `D_EXT:${Date.now()}`, sourceSchemaVersion: "custom-bot-v0.1", rawText: "I need help with a test order.", slackWorkspaceId: workspaceId, slackUserId });
    await captureExternalSlackIdentityCandidate({ workspaceId, slackUserId, channelId: "D_EXT", channelType: "im", externallySharedChannel: false, sourceTransport: "custom_bridge", interactionId: triage.interaction.id });
    expect(await getContactBySlackUser({ workspaceId, slackUserId })).toMatchObject({ status: "pending_candidate", candidate: { last_channel_id: "D_EXT" } });
    const db = await getDb(); await resolveExternalSlackIdentityCandidate({ workspaceId, slackUserId, contactId: "con_northwind_ops", resolvedByUserId: "usr_admin" });
    const candidate = (await db!.select().from(externalSlackIdentityCandidates).where(and(eq(externalSlackIdentityCandidates.slackWorkspaceId, workspaceId), eq(externalSlackIdentityCandidates.slackUserId, slackUserId))).limit(1))[0]; const interaction = (await db!.select().from(interactions).where(eq(interactions.id, triage.interaction.id)).limit(1))[0];
    expect(candidate).toMatchObject({ status: "mapped", resolvedContactId: "con_northwind_ops", resolvedByUserId: "usr_admin" }); expect(interaction).toMatchObject({ contactId: "con_northwind_ops", accountId: "acct_northwind", ownerId: "usr_sarah" }); expect(interaction?.lane).toBe("escalate");
    await db!.delete(externalSlackIdentityCandidates).where(and(eq(externalSlackIdentityCandidates.slackWorkspaceId, workspaceId), eq(externalSlackIdentityCandidates.slackUserId, slackUserId)));
  });
});
