import { ensureKnowledgeCatalog, LIGHT_LABS_KNOWLEDGE_CATALOG, refreshKnowledgeSource } from "../server/knowledge.ts";

await ensureKnowledgeCatalog();
const results = [];
for (let index = 0; index < LIGHT_LABS_KNOWLEDGE_CATALOG.length; index += 3) {
  const batch = LIGHT_LABS_KNOWLEDGE_CATALOG.slice(index, index + 3);
  const settled = await Promise.allSettled(batch.map(source => refreshKnowledgeSource(source.id)));
  settled.forEach((result, offset) => {
    const source = batch[offset];
    results.push({ sourceId: source.id, ok: result.status === "fulfilled", detail: result.status === "fulfilled" ? result.value.characters : String(result.reason) });
  });
}

const failures = results.filter(result => !result.ok);
console.table(results);
if (failures.length) {
  throw new Error(`${failures.length} approved source(s) could not be indexed.`);
}
