import { ensureKnowledgeCatalog, ensureKnowledgeDocumentSections, getKnowledgeDocument, indexKnowledgeDocument, LIGHT_LABS_KNOWLEDGE_CATALOG, refreshKnowledgeSource } from "../server/knowledge.ts";

await ensureKnowledgeCatalog();
const results = [];
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function refreshWithFallback(source) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { const refreshed = await refreshKnowledgeSource(source.id); return { sourceId: source.id, status: "refreshed", characters: refreshed.characters, attempts: attempt }; }
    catch (error) { lastError = error; if (attempt < 3) await sleep(attempt * 500); }
  }
  const existing = await getKnowledgeDocument(source.id);
  if (existing.document?.markdown) { await indexKnowledgeDocument({ sourceId: source.id, content: existing.document.markdown, fetchedAt: existing.document.fetchedAt }); await ensureKnowledgeDocumentSections(source.id); return { sourceId: source.id, status: "retained", characters: existing.document.markdown.length, attempts: 3, detail: String(lastError) }; }
  throw lastError;
}
for (let index = 0; index < LIGHT_LABS_KNOWLEDGE_CATALOG.length; index += 3) {
  const batch = LIGHT_LABS_KNOWLEDGE_CATALOG.slice(index, index + 3);
  const settled = await Promise.allSettled(batch.map(source => refreshWithFallback(source)));
  settled.forEach((result, offset) => {
    const source = batch[offset];
    results.push({ sourceId: source.id, ok: result.status === "fulfilled", state: result.status === "fulfilled" ? result.value.status : "failed", detail: result.status === "fulfilled" ? result.value.characters : String(result.reason) });
  });
}

const failures = results.filter(result => !result.ok);
await Promise.all(LIGHT_LABS_KNOWLEDGE_CATALOG.map(source => ensureKnowledgeDocumentSections(source.id)));
console.table(results);
if (failures.length) {
  throw new Error(`${failures.length} approved source(s) could not be indexed.`);
}
