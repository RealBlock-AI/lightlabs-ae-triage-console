import { describe, expect, it } from "vitest";
import { ensurePrototypeSeed } from "./prototypeSeed";
import { runPrototypeTriage } from "./prototype";
import { indexKnowledgeDocument } from "./knowledge";

describe("canonical prototype triage", () => {
  it("makes a previously unseen verified order-status request eligible for the auto lane", async () => {
    await ensurePrototypeSeed();
    const result = await runPrototypeTriage({ source: "test", channelRef: `unseen-order|${Date.now()}`, externalEventId: `unseen-order|${Date.now()}`, slackWorkspaceId: "T_DEMO", slackUserId: "U_NORTH_OPS", rawText: "quick check, where is our latest protein order sitting right now?" });
    expect(result.interaction.lane).toBe("auto");
    expect(result.interaction.verifiedReplyStatus).toBe("eligible");
    expect(result.interaction.evidence.some(item => item.label === "Laboratory state")).toBe(true);
  }, 15_000);

  it("escalates a serving-size disagreement while preserving both computed branches", async () => {
    await ensurePrototypeSeed();
    const result = await runPrototypeTriage({ source: "test", channelRef: `serving-split|${Date.now()}`, externalEventId: `serving-split|${Date.now()}`, slackWorkspaceId: "T_DEMO", slackUserId: "U_LUMEN_QA", rawText: "lot 8812 came back at 12.4 ppb lead and we need to understand the result" });
    expect(result.interaction.lane).toBe("escalate");
    expect(result.interaction.evidence.filter(item => item.label.includes("serving branch"))).toHaveLength(2);
    expect(result.interaction.evidence.find(item => item.label === "Verdict disagreement")?.value).toContain("serving size ambiguous");
  }, 15_000);

  it("returns a named refusal and no concentration for a hidden cross-company result", async () => {
    await ensurePrototypeSeed();
    const result = await runPrototypeTriage({ source: "test", channelRef: `hidden-partner|${Date.now()}`, externalEventId: `hidden-partner|${Date.now()}`, slackWorkspaceId: "T_DEMO", slackUserId: "U_PINE_QC", rawText: "what is the lead result for Hidden Bar?" });
    const serialized = JSON.stringify(result.interaction);
    expect(serialized).not.toContain("5.1");
    expect(result.interaction.evidence.find(item => item.refusalCode === "RESULT_PARTNERSHIP_DENIED")).toBeTruthy();
  }, 15_000);

  it("returns a California-scoped catalog recommendation only in an assisted packet", async () => {
    await ensurePrototypeSeed();
    const result = await runPrototypeTriage({ source: "test", channelRef: `ca-recommendation|${Date.now()}`, externalEventId: `ca-recommendation|${Date.now()}`, slackWorkspaceId: "T_DEMO", slackUserId: "U_LUMEN_QA", rawText: "We are launching a new SKU in California. What testing should we consider?" });
    expect(result.interaction.lane).toBe("assisted");
    expect(result.interaction.evidence.find(item => item.label === "Catalog coverage")?.value).toContain("Prop 65 and AB 899");
    expect(result.interaction.evidence.find(item => item.label === "Catalog panel")?.value).toContain("Heavy Metals Panel");
    expect(result.interaction.verifiedReplyStatus).toBe("ineligible");
  }, 15_000);

  it("attaches stable source and anchor metadata when approved knowledge supports an assisted packet", async () => {
    await ensurePrototypeSeed();
    await indexKnowledgeDocument({ sourceId: "k_test_contaminants", content: "# Contaminant panel testing\n\n## Turnaround\n\nApproved contaminant panel turnaround is two business days." });
    const result = await runPrototypeTriage({ source: "test", channelRef: `knowledge-anchor|${Date.now()}`, externalEventId: `knowledge-anchor|${Date.now()}`, slackWorkspaceId: "T_DEMO", slackUserId: "U_LUMEN_QA", rawText: "contaminant panel turnaround" });
    expect(result.interaction.lane).toBe("escalate");
    expect(result.interaction.knowledgeCitations?.[0]).toMatchObject({ sourceId: "k_test_contaminants", url: "https://www.lightlabs.com/tests/contaminants", anchor: expect.any(String) });
    expect(result.interaction.evidence.some(item => item.source.startsWith("knowledge_sections#"))).toBe(true);
  }, 15_000);
});
