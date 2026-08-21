import { describe, expect, it } from "vitest";
import { ensureDemoData, getItemForViewer, getQueue, recordSend, requestClarification, runFixture, runTriage } from "./triage";
import { getDb } from "./db";
import { contacts, hubspotContextSnapshots, orders } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("permanent AE triage safety contract", () => {
  it("seeds Appendix A identities, queues by owner, and enforces the query-level ownership boundary", async () => {
    await ensureDemoData();
    const result = await runFixture(2);
    const sarahItem = await getItemForViewer(result.interaction.id, "usr_sarah");
    const marcusItem = await getItemForViewer(result.interaction.id, "usr_marcus");
    expect(sarahItem?.accountName).toBe("Lumen Foods");
    expect(marcusItem).toBeUndefined();
    expect((await getQueue("usr_sarah")).some(item => item.id === result.interaction.id)).toBe(true);
    expect((await getQueue("usr_marcus")).some(item => item.id === result.interaction.id)).toBe(false);
  });

  it("blocks placeholder regulatory evidence even when a human tries to supply an override", async () => {
    const result = await runFixture(2);
    const item = await getItemForViewer(result.interaction.id, "usr_sarah");
    expect(item?.lane).toBe("escalate");
    expect(item?.sendDisabled).toBe(1);
    expect(item?.evidence.some(evidence => !evidence.citable)).toBe(true);
    await expect(recordSend({ interactionId: result.interaction.id, viewerId: "usr_sarah", sentText: "It is fine.", overrideReason: "Lab approved" })).rejects.toThrow(/disabled/i);
  });

  it("requires a persistent override reason for an escalation that is otherwise recordable", async () => {
    const result = await runFixture(7);
    await expect(recordSend({ interactionId: result.interaction.id, viewerId: "usr_sarah", sentText: "A lab director will join the call." })).rejects.toThrow(/override reason/i);
    await expect(recordSend({ interactionId: result.interaction.id, viewerId: "usr_sarah", sentText: "A lab director will join the call.", overrideReason: "Lab director approved customer-call commitment." })).resolves.toMatchObject({ editRatio: expect.any(Number) });
  });

  it("keeps clarification unavailable on escalations and permits it on assisted items", async () => {
    const escalation = await runFixture(7);
    await expect(requestClarification(escalation.interaction.id, "usr_sarah", "Can you clarify?")).rejects.toThrow(/unavailable/i);
    const assisted = await runFixture(6);
    await expect(requestClarification(assisted.interaction.id, "usr_marcus", "Please send the prior lab panel documentation.")).resolves.toBeUndefined();
  });

  it("deduplicates a retry and force-escalates an unidentified inbound sender without account data", async () => {
    const key = `test-channel|${Date.now()}`;
    const first = await runTriage({ source: "slack", channelRef: key, slackUserId: "U_UNKNOWN", rawText: "Can you tell me what results we have?" });
    const retry = await runTriage({ source: "slack", channelRef: key, slackUserId: "U_UNKNOWN", rawText: "Can you tell me what results we have?" });
    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(first.interaction.lane).toBe("escalate");
    expect(first.interaction.accountId).toBeNull();
    expect(first.interaction.laneReasons.join(" ")).toMatch(/could not be resolved/i);
  });

  it("deduplicates by durable external event ID even if a native Slack retry arrives with a different channel reference", async () => {
    const externalEventId = `Ev_P0_${Date.now()}`;
    const first = await runTriage({ source: "slack", channelRef: `C_P0_${externalEventId}|1710000000.000001`, externalEventId, sourceSchemaVersion: "slack-events-api-v1", threadRef: "1710000000.000000", sourceReceivedAt: new Date(), slackUserId: "U_UNKNOWN", slackWorkspaceId: "T_P0", rawText: "Can you tell me the order status?" });
    const retry = await runTriage({ source: "slack", channelRef: `C_P0_RETRY_${externalEventId}|1710000000.000002`, externalEventId, sourceSchemaVersion: "slack-events-api-v1", threadRef: "1710000000.000000", sourceReceivedAt: new Date(), slackUserId: "U_UNKNOWN", slackWorkspaceId: "T_P0", rawText: "Can you tell me the order status?" });
    expect(first.duplicate).toBe(false);
    expect(first.interaction.externalEventId).toBe(externalEventId);
    expect(first.interaction.sourceSchemaVersion).toBe("slack-events-api-v1");
    expect(retry.duplicate).toBe(true);
    expect(retry.interaction.id).toBe(first.interaction.id);
  });

  it("keeps the in-flight Appendix A order future-dated so the permanent demo cannot rot", async () => {
    await ensureDemoData();
    const db = await getDb();
    const order = (await db!.select().from(orders).where(eq(orders.id, "ord_4721")).limit(1))[0];
    expect(order?.promisedAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it("runs all eight Appendix A fixtures against a seeded contact and account", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => runFixture(index + 1)));
    for (const result of results) {
      expect(result.interaction.contactId).toBeTruthy();
      expect(result.interaction.accountId).toBeTruthy();
      expect(result.interaction.ownerId).toBeTruthy();
    }
  }, 15_000);

  it("requires a fresh verified HubSpot snapshot before a live Slack contact receives CRM-enriched handling", async () => {
    const db = await getDb();
    await db!.update(contacts).set({ hubspotContactId: "123", identityStatus: "verified" }).where(eq(contacts.id, "con_northwind_ops"));
    await db!.delete(hubspotContextSnapshots).where(eq(hubspotContextSnapshots.contactId, "con_northwind_ops"));
    const live = await runTriage({ source: "slack", channelRef: `crm-freshness|${Date.now()}`, slackUserId: "U_NORTH_OPS", slackWorkspaceId: "T_DEMO", rawText: "Any update on my order?" });
    expect(live.interaction.lane).toBe("escalate");
    expect(live.interaction.laneReasons).toContain("Force-escalated: no fresh verified HubSpot context snapshot exists for this Slack sender.");
    expect((await getItemForViewer(live.interaction.id, "usr_sarah"))?.hubspotContext).toBeNull();
  });

  it("recognizes a fresh verified HubSpot snapshot for a mapped live Slack sender", async () => {
    const db = await getDb();
    await db!.update(contacts).set({ hubspotContactId: "123", identityStatus: "verified" }).where(eq(contacts.id, "con_northwind_ops"));
    await db!.insert(hubspotContextSnapshots).values({ id: `hctx_test_${Date.now()}`, contactId: "con_northwind_ops", hubspotContactId: "123", sourceObjectIds: ["123", "company_7", "ticket_100"], context: { contact: { properties: { firstname: "Priya", lastname: "Shah", email: "priya@example.com" } }, company: { results: [{ properties: { name: "Northwind Nutrition" } }] }, recentTickets: { results: [{ id: "ticket_100" }, { id: "ticket_101" }] }, recentConversations: { results: [{ id: "conversation_1" }] } }, retrievedAt: new Date(), status: "available", errorCode: null });
    const live = await runTriage({ source: "slack", channelRef: `crm-present|${Date.now()}`, slackUserId: "U_NORTH_OPS", slackWorkspaceId: "T_DEMO", rawText: "Any update on my order?" });
    expect(live.interaction.contactId).toBe("con_northwind_ops");
    expect(live.interaction.laneReasons).not.toContain("Force-escalated: no fresh verified HubSpot context snapshot exists for this Slack sender.");
    const detail = await getItemForViewer(live.interaction.id, "usr_sarah");
    expect(detail?.hubspotContext).toMatchObject({ source: "HubSpot MCP · read-only verified snapshot" });
  });
});
