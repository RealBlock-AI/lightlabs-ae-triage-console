import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mcpDocumentExtractions, mcpDocumentFileDeliveries, mcpDocuments } from "../drizzle/schema";
import { getDb } from "./db";
import type { McpActor } from "./mcpAccess";
import { createDocumentDelivery, extractDocumentToStaging, ingestSlackDocument, searchSavedDocuments } from "./documentVault";
import { ensureDemoData } from "./triage";

vi.mock("./storage", () => ({
  storageGetSignedUrl: vi.fn(async () => "https://storage.example.test/signed/shipping-label.pdf"),
  storagePut: vi.fn(async (key: string) => ({ key: `stored/${key}`, url: "https://storage.example.test/uploaded" })),
}));
vi.mock("./slackInstallations", () => ({
  fetchSlackFileForWorkspace: vi.fn(async () => ({ slackFileId: "F_AUTHORIZED_INGEST", name: "six-sample-intake.csv", title: "Six-sample intake", mimeType: "text/csv", bytes: Buffer.from("sample_name,quantity\nSix sample kit,6\n") })),
}));
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify({ sample_name: "Six sample kit", quantity: 6 }) } }] })),
}));

const documentId = "mcd_test_shipping_label";
let createdDocumentId: string | undefined;
const pinecrestActor: McpActor = { kind: "account", identity: { workspaceId: "T_DEMO", userId: "U_PINE_QC" }, userId: 9003, contactId: "con_pine_qc", accountIds: ["acct_pinecrest"] };
const lumenActor: McpActor = { kind: "account", identity: { workspaceId: "T_DEMO", userId: "U_LUMEN_QA" }, userId: 9002, contactId: "con_lumen_qa", accountIds: ["acct_lumen"] };

beforeEach(async () => {
  await ensureDemoData();
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  await db.insert(mcpDocuments).values({
    id: documentId,
    accountId: "acct_pinecrest",
    slackWorkspaceId: "T_DEMO",
    slackFileId: "F_TEST_LABEL",
    storageKey: "mcp-documents/acct_pinecrest/shipping-label.pdf",
    originalName: "six-sample-shipping-label.pdf",
    title: "Six-sample shipping label",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    contentSha256: "a".repeat(64),
    source: "internal_upload",
    uploadedBySlackUserId: "U_AE_SARAH",
    status: "available",
    createdAt: now,
    updatedAt: now,
  }).onDuplicateKeyUpdate({ set: { updatedAt: now } });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  const db = await getDb();
  if (createdDocumentId) {
    await db?.delete(mcpDocumentExtractions).where(eq(mcpDocumentExtractions.documentId, createdDocumentId));
    await db?.delete(mcpDocumentFileDeliveries).where(eq(mcpDocumentFileDeliveries.documentId, createdDocumentId));
    await db?.delete(mcpDocuments).where(eq(mcpDocuments.id, createdDocumentId));
    createdDocumentId = undefined;
  }
  await db?.delete(mcpDocumentExtractions).where(eq(mcpDocumentExtractions.documentId, documentId));
  await db?.delete(mcpDocumentFileDeliveries).where(eq(mcpDocumentFileDeliveries.documentId, documentId));
  await db?.delete(mcpDocuments).where(eq(mcpDocuments.id, documentId));
});

describe("account-bound document MCP tools", () => {
  it("returns only authorized account files and creates an auditable secure delivery link", async () => {
    const matches = await searchSavedDocuments({ actor: pinecrestActor, query: "shipping" });
    expect(matches).toEqual([expect.objectContaining({ id: documentId, title: "Six-sample shipping label" })]);
    await expect(searchSavedDocuments({ actor: pinecrestActor, accountId: "acct_lumen", query: "shipping" })).rejects.toThrow("does not match the bound account");

    const delivery = await createDocumentDelivery({ actor: pinecrestActor, documentId });
    expect(delivery.url).toBe("https://storage.example.test/signed/shipping-label.pdf");
    const db = await getDb();
    const audit = await db!.select().from(mcpDocumentFileDeliveries).where(and(eq(mcpDocumentFileDeliveries.documentId, documentId), eq(mcpDocumentFileDeliveries.requestedBySlackUserId, "U_PINE_QC")));
    expect(audit).toHaveLength(1);
  });

  it("blocks a different account from delivery or extraction before storage or model access", async () => {
    await expect(createDocumentDelivery({ actor: lumenActor, documentId })).rejects.toThrow("not authorized");
    await expect(extractDocumentToStaging({ actor: lumenActor, documentId, targetTable: "sample_intake_staging", fieldMappings: [{ fieldKey: "sample_name", targetTable: "sample_intake_staging", targetColumn: "sample_name", description: "Declared sample name" }] })).rejects.toThrow("not authorized");
  });

  it("blocks an account-bound caller from ingesting a Slack file into any other account before Slack is contacted", async () => {
    await expect(ingestSlackDocument({ actor: pinecrestActor, slackFileId: "F_EXTERNAL", accountId: "acct_lumen" })).rejects.toThrow("does not match the bound account");
  });

  it("allows an authorized actor to persist a Slack attachment and produce a completed extraction staging record", async () => {
    const ingested = await ingestSlackDocument({ actor: pinecrestActor, slackFileId: "F_AUTHORIZED_INGEST" });
    createdDocumentId = ingested.document.id;
    expect(ingested.duplicate).toBe(false);
    expect(ingested.document).toMatchObject({ accountId: "acct_pinecrest", slackFileId: "F_AUTHORIZED_INGEST", storageKey: expect.stringContaining("stored/mcp-documents/acct_pinecrest") });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("sample_name,quantity\nSix sample kit,6\n", { status: 200 })));
    const extraction = await extractDocumentToStaging({
      actor: pinecrestActor,
      documentId: ingested.document.id,
      targetTable: "sample_intake_staging",
      fieldMappings: [
        { fieldKey: "sample_name", targetTable: "sample_intake_staging", targetColumn: "sample_name", description: "Declared sample name" },
        { fieldKey: "quantity", targetTable: "sample_intake_staging", targetColumn: "quantity", description: "Declared sample quantity" },
      ],
    });
    expect(extraction.values).toEqual({ sample_name: "Six sample kit", quantity: 6 });
    const db = await getDb();
    const staged = (await db!.select().from(mcpDocumentExtractions).where(eq(mcpDocumentExtractions.id, extraction.extractionId)).limit(1))[0];
    expect(staged).toMatchObject({ status: "completed", targetTable: "sample_intake_staging", extractedValues: { sample_name: "Six sample kit", quantity: 6 } });
  });
});
