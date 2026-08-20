import { describe, expect, it } from "vitest";
import { ensureDemoData, getItemForViewer, getQueue, recordSend, requestClarification, runFixture, runTriage } from "./triage";
import { getDb } from "./db";
import { orders } from "../drizzle/schema";
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
  });
});
