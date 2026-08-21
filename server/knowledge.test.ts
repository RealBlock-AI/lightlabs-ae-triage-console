import { describe, expect, it } from "vitest";
import { ensureKnowledgeCatalog, getKnowledgeDocument, getKnowledgeSection, indexKnowledgeDocument, listKnowledgeSources, retrieveKnowledge } from "./knowledge";
import { runTriage } from "./triage";

describe("verified identity and knowledge retrieval", () => {
  it("uses the account-linked contact table as the verified Slack workspace identity boundary", async () => {
    const verified = await runTriage({ source: "slack", channelRef: `identity|verified|${Date.now()}`, slackUserId: "U_NORTH_OPS", slackWorkspaceId: "T_DEMO", rawText: "Any update on my order?", injected: { intents: ["ORDER_STATUS"], confidence: 0.99 } });
    const incorrectWorkspace = await runTriage({ source: "slack", channelRef: `identity|other|${Date.now()}`, slackUserId: "U_NORTH_OPS", slackWorkspaceId: "T_OTHER", rawText: "Any update on my order?", injected: { intents: ["ORDER_STATUS"], confidence: 0.99 } });
    expect(verified.interaction.contactId).toBe("con_northwind_ops");
    expect(verified.interaction.accountId).toBe("acct_northwind");
    expect(incorrectWorkspace.interaction.contactId).toBeNull();
    expect(incorrectWorkspace.interaction.lane).toBe("escalate");
  });

  it("keeps live classifications in the human queue unless deterministic identity, evidence, entity, and template gates all pass", async () => {
    const live = await runTriage({ source: "slack", channelRef: `verified-reply|live|${Date.now()}`, slackUserId: "U_NORTH_OPS", slackWorkspaceId: "T_DEMO", rawText: "Any update on my order?", injected: undefined });
    expect(live.interaction.verifiedReplyStatus).toBe("ineligible");
    expect(live.interaction.sendAllowed).toBe(0);
    expect(live.interaction.replyGateReasons).toContain("No deterministic entity-resolution record is available for this live interaction.");
  });

  it("returns source-attributed relevance scores, never discovery confidence, and keeps the answer gate closed without support", async () => {
    await ensureKnowledgeCatalog();
    const sources = await listKnowledgeSources();
    expect(sources).toHaveLength(39);
    await indexKnowledgeDocument({ sourceId: "k_test_allergen", content: "Allergen testing turnaround details: the allergen testing turnaround is two days for this approved testing menu." });
    const supported = await retrieveKnowledge({ query: "allergen testing turnaround" });
    const unsupported = await retrieveKnowledge({ query: "invented laboratory benefit" });
    expect(supported.sources[0]).toMatchObject({ title: expect.any(String), url: "https://www.lightlabs.com/tests/allergen", score: expect.any(Number) });
    expect(new Set(supported.sources.map(source => source.url)).size).toBe(supported.sources.length);
    expect(supported.gate.status).toBe("open");
    expect(supported.plans[0]?.summaryYaml).toContain("canonical_url:");
    expect(unsupported.sources.every(source => source.score < 0.82)).toBe(true);
    expect(unsupported.gate.status).toBe("closed");
  });

  it("preserves readable Markdown and returns a specifically requested section instead of requiring a full-document read", async () => {
    await indexKnowledgeDocument({ sourceId: "k_test_allergen", content: "# Allergen testing\n\nOverview of the approved assay menu.\n\n## Turnaround\n\nTypical turnaround is two business days for this test menu.\n\n## Samples\n\nFollow the approved sample-handling instructions." });
    const document = await getKnowledgeDocument("k_test_allergen");
    const turnaround = await getKnowledgeSection("k_test_allergen", "turnaround");
    expect(document.document?.markdown).toContain("## Turnaround");
    expect(document.document?.summaryYaml).toContain("sections:");
    expect(document.document?.sectionIndex?.map(section => section.anchor)).toContain("turnaround");
    expect(turnaround.section.markdown).toContain("Typical turnaround is two business days");
    expect(turnaround.section.markdown).not.toContain("approved sample-handling");
  });
});
