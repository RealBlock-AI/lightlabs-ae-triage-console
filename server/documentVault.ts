import { and, desc, eq, like } from "drizzle-orm";
import { createHash } from "node:crypto";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { nanoid } from "nanoid";
import { mcpDocumentExtractions, mcpDocumentFileDeliveries, mcpDocuments } from "../drizzle/schema";
import { getDb } from "./db";
import { assertAccountAccess, type McpActor } from "./mcpAccess";
import { fetchSlackFileForWorkspace } from "./slackInstallations";
import { storageGetSignedUrl, storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";

const now = () => new Date();
const textMimeTypes = new Set(["text/plain", "text/csv", "text/markdown", "application/json", "application/xml"]);
const fileSafeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "document";

export type FieldMapping = { fieldKey: string; targetTable: string; targetColumn: string; description: string };

function selectAccountId(actor: McpActor, requestedAccountId?: string) {
  if (actor.kind === "account") {
    if (requestedAccountId && !actor.accountIds.includes(requestedAccountId)) throw new Error("This document request does not match the bound account.");
    return actor.accountIds[0];
  }
  if (!requestedAccountId) throw new Error("Internal users must choose the account that owns this document.");
  return requestedAccountId;
}

async function requireDocument(actor: McpActor, documentId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const document = (await db.select().from(mcpDocuments).where(and(eq(mcpDocuments.id, documentId), eq(mcpDocuments.status, "available"))).limit(1))[0];
  if (!document) throw new Error("Saved document not found.");
  await assertAccountAccess(actor, document.accountId);
  return document;
}

function rowsFromWorkbook(bytes: Buffer) {
  const workbook = XLSX.read(bytes, { type: "buffer" });
  return workbook.SheetNames.slice(0, 5).map(name => {
    const worksheet = workbook.Sheets[name];
    return `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(worksheet).slice(0, 45_000)}`;
  }).join("\n\n");
}

async function textFromDocument(bytes: Buffer, mimeType: string, fileName: string) {
  const lowerName = fileName.toLowerCase();
  if (textMimeTypes.has(mimeType) || /\.(txt|csv|json|md|xml)$/i.test(lowerName)) return bytes.toString("utf8").slice(0, 90_000);
  if (mimeType.includes("wordprocessingml") || /\.docx$/i.test(lowerName)) return (await mammoth.extractRawText({ buffer: bytes })).value.slice(0, 90_000);
  if (mimeType.includes("spreadsheetml") || /\.(xlsx|xls)$/i.test(lowerName)) return rowsFromWorkbook(bytes).slice(0, 90_000);
  return null;
}

export async function ingestSlackDocument(input: { actor: McpActor; slackFileId: string; accountId?: string }) {
  const accountId = selectAccountId(input.actor, input.accountId);
  await assertAccountAccess(input.actor, accountId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const duplicate = (await db.select().from(mcpDocuments).where(and(
    eq(mcpDocuments.accountId, accountId),
    eq(mcpDocuments.slackWorkspaceId, input.actor.identity.workspaceId),
    eq(mcpDocuments.slackFileId, input.slackFileId),
  )).limit(1))[0];
  if (duplicate) return { document: duplicate, duplicate: true };

  const file = await fetchSlackFileForWorkspace({ workspaceId: input.actor.identity.workspaceId, slackFileId: input.slackFileId });
  const { key } = await storagePut(`mcp-documents/${accountId}/${fileSafeName(file.name)}`, file.bytes, file.mimeType);
  const document = {
    id: `mcd_${nanoid(18)}`,
    accountId,
    slackWorkspaceId: input.actor.identity.workspaceId,
    slackFileId: file.slackFileId,
    storageKey: key,
    originalName: file.name,
    title: file.title,
    mimeType: file.mimeType,
    sizeBytes: file.bytes.byteLength,
    contentSha256: createHash("sha256").update(file.bytes).digest("hex"),
    source: "slack_upload" as const,
    uploadedBySlackUserId: input.actor.identity.userId,
    status: "available" as const,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.insert(mcpDocuments).values(document);
  return { document, duplicate: false };
}

export async function searchSavedDocuments(input: { actor: McpActor; query: string; accountId?: string }) {
  const accountId = selectAccountId(input.actor, input.accountId);
  await assertAccountAccess(input.actor, accountId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db.select().from(mcpDocuments).where(and(
    eq(mcpDocuments.accountId, accountId),
    eq(mcpDocuments.status, "available"),
    like(mcpDocuments.originalName, `%${input.query.trim().slice(0, 120)}%`),
  )).orderBy(desc(mcpDocuments.updatedAt)).limit(12);
  return rows.map(row => ({ id: row.id, title: row.title, name: row.originalName, mimeType: row.mimeType, sizeBytes: row.sizeBytes, createdAt: row.createdAt }));
}

export async function createDocumentDelivery(input: { actor: McpActor; documentId: string }) {
  const document = await requireDocument(input.actor, input.documentId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const url = await storageGetSignedUrl(document.storageKey);
  await db.insert(mcpDocumentFileDeliveries).values({
    id: `mcf_${nanoid(18)}`,
    documentId: document.id,
    accountId: document.accountId,
    requestedBySlackUserId: input.actor.identity.userId,
    requestedByWorkspaceId: input.actor.identity.workspaceId,
    deliveryMethod: "mcp_signed_link",
    createdAt: now(),
  });
  return { document, url };
}

function fieldSchema(mappings: FieldMapping[]) {
  return {
    type: "object",
    properties: Object.fromEntries(mappings.map(mapping => [mapping.fieldKey, { type: ["string", "number", "boolean", "null"] }])),
    required: mappings.map(mapping => mapping.fieldKey),
    additionalProperties: false,
  };
}

export async function extractDocumentToStaging(input: { actor: McpActor; documentId: string; targetTable: string; fieldMappings: FieldMapping[] }) {
  const document = await requireDocument(input.actor, input.documentId);
  if (!/^[a-z][a-z0-9_]{1,80}$/i.test(input.targetTable)) throw new Error("Target table must be an approved identifier.");
  if (!input.fieldMappings.length || input.fieldMappings.length > 20) throw new Error("Provide between 1 and 20 approved field mappings.");
  if (new Set(input.fieldMappings.map(mapping => mapping.fieldKey)).size !== input.fieldMappings.length) throw new Error("Each extraction field key must be unique.");
  if (input.fieldMappings.some(mapping => !/^[a-z][a-z0-9_]{1,80}$/i.test(mapping.targetColumn))) throw new Error("Target columns must be approved identifiers.");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const extractionId = `mce_${nanoid(18)}`;
  await db.insert(mcpDocumentExtractions).values({
    id: extractionId,
    documentId: document.id,
    accountId: document.accountId,
    targetTable: input.targetTable,
    fieldMappings: input.fieldMappings,
    extractedValues: {},
    extractionModel: "gpt-5-mini",
    status: "processing",
    requestedBySlackUserId: input.actor.identity.userId,
    createdAt: now(),
    completedAt: null,
    errorCode: null,
  });
  try {
    const signedUrl = await storageGetSignedUrl(document.storageKey);
    const downloaded = await fetch(signedUrl);
    if (!downloaded.ok) throw new Error("Saved document could not be read from secure storage.");
    const bytes = Buffer.from(await downloaded.arrayBuffer());
    const text = await textFromDocument(bytes, document.mimeType, document.originalName);
    const sourceContent = text ? [{ type: "text" as const, text: `Document text:\n${text}` }] : document.mimeType === "application/pdf"
      ? [{ type: "file_url" as const, file_url: { url: signedUrl, mime_type: "application/pdf" as const } }]
      : document.mimeType.startsWith("image/")
        ? [{ type: "image_url" as const, image_url: { url: signedUrl } }]
        : null;
    if (!sourceContent) throw new Error("This file type is not yet supported for extraction. Use PDF, DOCX, XLSX, CSV, JSON, Markdown, text, or an image.");
    const response = await invokeLLM({
      model: "gpt-5-mini",
      maxTokens: 2500,
      messages: [
        { role: "system", content: "Extract only facts stated in the document. Return null for unavailable values. Do not infer, invent, or normalize facts beyond the requested field descriptions." },
        { role: "user", content: [{ type: "text", text: `Extract the following approved fields for staging in ${input.targetTable}:\n${input.fieldMappings.map(mapping => `- ${mapping.fieldKey} -> ${mapping.targetColumn}: ${mapping.description}`).join("\n")}` }, ...sourceContent] },
      ],
      response_format: { type: "json_schema", json_schema: { name: "document_extraction", strict: true, schema: fieldSchema(input.fieldMappings) } },
    });
    const raw = response.choices[0]?.message.content;
    const resultText = typeof raw === "string" ? raw : "";
    const extractedValues = JSON.parse(resultText) as Record<string, string | number | boolean | null>;
    await db.update(mcpDocumentExtractions).set({ extractedValues, status: "completed", completedAt: now() }).where(eq(mcpDocumentExtractions.id, extractionId));
    return { extractionId, document, targetTable: input.targetTable, values: extractedValues, mappings: input.fieldMappings };
  } catch (error) {
    await db.update(mcpDocumentExtractions).set({ status: "failed", completedAt: now(), errorCode: error instanceof Error ? error.message.slice(0, 120) : "extraction_failed" }).where(eq(mcpDocumentExtractions.id, extractionId));
    throw error;
  }
}
