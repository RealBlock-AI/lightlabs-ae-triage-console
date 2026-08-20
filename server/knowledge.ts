import { and, desc, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { getDb } from "./db";
import { knowledgeDocuments, knowledgeRetrievalEvents, knowledgeSources } from "../drizzle/schema";

type SourceType = "insight" | "test_menu" | "compliance";
type AnswerSafety = "general_knowledge" | "review_required";
type SourceSeed = { id: string; canonicalUrl: string; title: string; sourceType: SourceType; answerSafety: AnswerSafety; discoveryScore: string };

const titleFor = (slug: string) => slug.split("-").map(part => part === "nmn" || part === "bpa" || part === "bht" || part === "bha" || part === "nsf" ? part.toUpperCase() : part === "prop" ? "Prop" : part[0]?.toUpperCase() + part.slice(1)).join(" ");
const insight = (slug: string, answerSafety: AnswerSafety = "general_knowledge"): SourceSeed => ({ id: `k_insight_${slug}`, canonicalUrl: `https://www.lightlabs.com/insights/${slug}`, title: titleFor(slug), sourceType: "insight", answerSafety, discoveryScore: "0.9500" });
const testPage = (slug: string): SourceSeed => ({ id: `k_test_${slug}`, canonicalUrl: `https://www.lightlabs.com/tests/${slug}`, title: `${titleFor(slug)} testing`, sourceType: "test_menu", answerSafety: "general_knowledge", discoveryScore: "0.9500" });

export const LIGHT_LABS_KNOWLEDGE_CATALOG: SourceSeed[] = [
  { id: "k_compliance", canonicalUrl: "https://www.lightlabs.com/compliance", title: "Compliance reporting for product testing", sourceType: "compliance", answerSafety: "review_required", discoveryScore: "0.7800" },
  insight("acrylamide-in-food"), insight("approved-supplier-program"), insight("artificial-sweeteners-guide-for-supplements"), insight("boswellia-supplement-quality-testing"), insight("bpa-bps-testing-compliance-guide", "review_required"), insight("butylated-hydroxyanisole-bha-testing-compliance-guide"), insight("butylated-hydroxytoluene-bht-testing-guide"), insight("certificate-of-conformance-vs-certificate-of-compliance"), insight("choline-testing-labeling-supplement-quality-guide", "review_required"), insight("curcumin-supplement-quality-testing"), insight("d-mannose-supplement-quality-testing"), insight("fructose-testing-labeling-guide", "review_required"), insight("glucosamine-supplement-testing"), insight("glyphosate-and-ampa-testing-guide"), insight("l-arginine-benefits-dosage-safety-testing"), insight("l-lysine-supplement-quality-testing"), insight("lactose-testing-compliance-guide", "review_required"), insight("listeria-species-testing-compliance-guide", "review_required"), insight("lot-release-testing"), insight("lutein-supplement-quality-testing"), insight("nmn-supplement-testing-guide"), insight("nsf-certified-for-sport", "review_required"), insight("prop-65-testing", "review_required"), insight("prop-65-testing-cost", "review_required"), insight("prop-65-testing-labs", "review_required"), insight("resveratrol-for-supplement-brands"), insight("rhodiola-rosea-supplement-quality-testing"), insight("supplier-audit-checklist-food-supplement-brands"), insight("supplier-risk-assessment"), insight("thallium-what-food-and-supplement-brands-should-know", "review_required"), insight("what-supplement-brands-should-know-about-quercetin"),
  testPage("allergen"), testPage("contaminants"), testPage("elemental"), testPage("microbial"), testPage("phytochemical-vitamin-and-actives"), testPage("preservatives-and-additives"), testPage("stability"),
];

const now = () => new Date();
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const terms = (value: string) => Array.from(new Set(normalize(value).split(" ").filter(term => term.length > 2 && !["the", "and", "for", "with", "from", "what", "does", "about", "this", "that", "have", "need"].includes(term))));

export async function ensureKnowledgeCatalog() {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  for (const source of LIGHT_LABS_KNOWLEDGE_CATALOG) {
    await db.insert(knowledgeSources).values({ ...source, retrievalStatus: "eligible", lastFetchedAt: null, createdAt: now(), updatedAt: now() }).onDuplicateKeyUpdate({ set: { title: source.title, sourceType: source.sourceType, answerSafety: source.answerSafety, discoveryScore: source.discoveryScore, retrievalStatus: "eligible", updatedAt: now() } });
  }
}

export async function listKnowledgeSources() {
  await ensureKnowledgeCatalog(); const db = await getDb(); if (!db) return [];
  const rows = await db.select({ source: knowledgeSources, documentCount: sql<number>`count(${knowledgeDocuments.id})` }).from(knowledgeSources).leftJoin(knowledgeDocuments, and(eq(knowledgeDocuments.sourceId, knowledgeSources.id), eq(knowledgeDocuments.status, "indexed"))).groupBy(knowledgeSources.id).orderBy(knowledgeSources.sourceType, knowledgeSources.title);
  return rows.map(({ source, documentCount }) => ({ ...source, documentCount: Number(documentCount) }));
}

export async function indexKnowledgeDocument(input: { sourceId: string; content: string; fetchedAt?: Date }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const source = (await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, input.sourceId)).limit(1))[0]; if (!source) throw new Error("Knowledge source is not in the approved catalog.");
  const content = input.content.trim(); if (content.length < 80) throw new Error("Knowledge document is too short to index safely.");
  const hash = createHash("sha256").update(content).digest("hex"); const capturedAt = input.fetchedAt ?? now();
  await db.insert(knowledgeDocuments).values({ id: `kd_${nanoid(18)}`, sourceId: source.id, content, contentHash: hash, fetchedAt: capturedAt, indexedAt: now(), status: "indexed" }).onDuplicateKeyUpdate({ set: { content, fetchedAt: capturedAt, indexedAt: now(), status: "indexed" } });
  await db.update(knowledgeSources).set({ lastFetchedAt: capturedAt, updatedAt: now() }).where(eq(knowledgeSources.id, source.id));
}

export async function refreshKnowledgeSource(sourceId: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const source = (await db.select().from(knowledgeSources).where(and(eq(knowledgeSources.id, sourceId), eq(knowledgeSources.retrievalStatus, "eligible"))).limit(1))[0]; if (!source) throw new Error("Approved knowledge source not found.");
  const response = await fetch(source.canonicalUrl, { headers: { "user-agent": "LightLabs-Triage-Knowledge/1.0" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Knowledge fetch failed with HTTP ${response.status}.`);
  const html = await response.text(); const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  await indexKnowledgeDocument({ sourceId, content: text }); return { sourceId, characters: text.length };
}

function relevance(query: string, title: string, content: string) {
  const queryTerms = terms(query); if (!queryTerms.length) return 0; const titleText = normalize(title); const bodyText = normalize(content); const matched = queryTerms.filter(term => bodyText.includes(term)); const titleMatched = queryTerms.filter(term => titleText.includes(term)); const phrase = bodyText.includes(normalize(query)) ? 1 : 0;
  return Math.min(1, (matched.length / queryTerms.length) * 0.65 + (titleMatched.length / queryTerms.length) * 0.2 + phrase * 0.15);
}

function excerpt(content: string, query: string) {
  const lower = content.toLowerCase(); const position = terms(query).map(term => lower.indexOf(term)).find(index => index >= 0) ?? 0; const start = Math.max(0, position - 140); return `${start ? "…" : ""}${content.slice(start, start + 420).replace(/\s+/g, " ").trim()}${content.length > start + 420 ? "…" : ""}`;
}

export async function retrieveKnowledge(input: { query: string; interactionId?: string; limit?: number }) {
  await ensureKnowledgeCatalog(); const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const query = input.query.trim(); if (query.length < 3) throw new Error("A knowledge query must include at least three characters.");
  const rows = await db.select({ source: knowledgeSources, document: knowledgeDocuments }).from(knowledgeDocuments).innerJoin(knowledgeSources, eq(knowledgeDocuments.sourceId, knowledgeSources.id)).where(and(eq(knowledgeDocuments.status, "indexed"), eq(knowledgeSources.retrievalStatus, "eligible"))).orderBy(desc(knowledgeDocuments.indexedAt));
  const candidates = rows.map(({ source, document }) => ({ title: source.title, url: source.canonicalUrl, snippet: excerpt(document.content, query), score: relevance(query, source.title, document.content), answerSafety: source.answerSafety })).filter(match => match.score >= 0.35).sort((a, b) => b.score - a.score);
  const matches = candidates.filter((match, index, all) => all.findIndex(candidate => candidate.url === match.url) === index).slice(0, Math.min(Math.max(input.limit ?? 3, 1), 5));
  const gateReasons = matches.length ? [] : ["No attributable indexed source matched the request."]; if (matches[0] && matches[0].score < 0.82) gateReasons.push("Top retrieval relevance is below the verified-answer threshold."); if (matches.some(match => match.answerSafety === "review_required")) gateReasons.push("Retrieved content requires human review and cannot independently open the answer gate.");
  const gate = gateReasons.length ? "closed" as const : "open" as const;
  await db.insert(knowledgeRetrievalEvents).values({ id: `kr_${nanoid(18)}`, queryText: query, interactionId: input.interactionId ?? null, retrievedAt: now(), topScore: String(matches[0]?.score ?? 0), sourceCount: matches.length, gate, reasons: gateReasons });
  return { sources: matches.map(({ answerSafety: _answerSafety, ...source }) => ({ ...source, score: Number(source.score.toFixed(4)) })), gate: { status: gate, reasons: gateReasons } };
}
