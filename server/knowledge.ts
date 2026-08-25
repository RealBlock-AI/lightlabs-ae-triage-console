import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { getDb } from "./db";
import { knowledgeDocuments, knowledgeRetrievalEvents, knowledgeSections, knowledgeSources } from "../drizzle/schema";

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
const toMarkdown = (html: string) => { const body = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? html; return body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n").replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n").replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n").replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1").replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n").replace(/<br\s*\/?>/gi, "\n").replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim(); };
const sectionIndexFor = (content: string) => content.split(/\n(?=#{1,3}\s)/).map(section => { const [headingLine, ...body] = section.trim().split("\n"); const heading = headingLine.replace(/^#{1,3}\s+/, "").trim() || "Overview"; return { heading, anchor: heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), excerpt: body.join(" ").replace(/\s+/g, " ").slice(0, 220) }; }).filter(section => section.heading || section.excerpt).slice(0, 30);
const summaryFor = (source: Pick<SourceSeed, "title" | "canonicalUrl" | "sourceType" | "answerSafety">, content: string) => { const sections = sectionIndexFor(content); const topics = Array.from(new Set([...terms(source.title), ...terms(sections.map(section => section.heading).join(" "))])).slice(0, 12); return [
  `title: ${JSON.stringify(source.title)}`,
  `canonical_url: ${source.canonicalUrl}`,
  `source_type: ${source.sourceType}`,
  `answer_safety: ${source.answerSafety}`,
  "topics:", ...topics.map(topic => `  - ${topic}`),
  "sections:", ...sections.map(section => `  - heading: ${JSON.stringify(section.heading)}\n    anchor: ${section.anchor}\n    preview: ${JSON.stringify(section.excerpt)}`),
].join("\n"); };

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
  const hash = createHash("sha256").update(content).digest("hex"); const capturedAt = input.fetchedAt ?? now(); const discoveredSections = sectionIndexFor(content); const candidateSections = discoveredSections.length ? discoveredSections : [{ heading: "Overview", anchor: "overview", excerpt: content.replace(/\s+/g, " ").slice(0, 500) }]; const anchorCounts = new Map<string, number>(); const sections = candidateSections.map(section => { const baseAnchor = section.anchor || "overview"; const count = (anchorCounts.get(baseAnchor) ?? 0) + 1; anchorCounts.set(baseAnchor, count); return { ...section, anchor: count === 1 ? baseAnchor : `${baseAnchor}-${count}` }; }); const summaryYaml = summaryFor(source, content);
  const priorDocuments = await db.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(eq(knowledgeDocuments.sourceId, source.id));
  if (priorDocuments.length) await db.delete(knowledgeSections).where(inArray(knowledgeSections.documentId, priorDocuments.map(document => document.id)));
  await db.update(knowledgeDocuments).set({ status: "superseded" }).where(and(eq(knowledgeDocuments.sourceId, source.id), eq(knowledgeDocuments.status, "indexed")));
  await db.insert(knowledgeDocuments).values({ id: `kd_${nanoid(18)}`, sourceId: source.id, content, markdownContent: content, contentFormat: "markdown", parserVersion: "main-content-markdown-v1", summaryYaml, sectionIndex: sections, contentHash: hash, fetchedAt: capturedAt, indexedAt: now(), status: "indexed" }).onDuplicateKeyUpdate({ set: { content, markdownContent: content, contentFormat: "markdown", parserVersion: "main-content-markdown-v1", summaryYaml, sectionIndex: sections, fetchedAt: capturedAt, indexedAt: now(), status: "indexed" } });
  const document = (await db.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.sourceId, source.id), eq(knowledgeDocuments.contentHash, hash))).limit(1))[0];
  if (document) {
    await db.delete(knowledgeSections).where(eq(knowledgeSections.documentId, document.id));
    if (sections.length) await db.insert(knowledgeSections).values(sections.map((section, ordinal) => ({ id: `ks_${nanoid(18)}`, documentId: document.id, ordinal, headingPath: section.heading, anchor: section.anchor || `section-${ordinal + 1}`, markdownContent: (() => { const lines = content.split("\n"); const start = lines.findIndex(line => line.replace(/^#{1,3}\s+/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === section.anchor); const end = lines.findIndex((line, index) => index > start && /^#{1,3}\s+/.test(line)); return (start >= 0 ? lines.slice(start, end > start ? end : undefined).join("\n") : section.excerpt).trim(); })(), excerpt: section.excerpt, tokenCount: Math.ceil(section.excerpt.split(/\s+/).filter(Boolean).length * 1.35), contentHash: createHash("sha256").update(`${hash}:${section.anchor}`).digest("hex"), answerSafety: source.answerSafety === "review_required" ? "review_required" as const : "general_knowledge" as const, effectiveFrom: capturedAt, effectiveTo: null })));
  }
  await db.update(knowledgeSources).set({ lastFetchedAt: capturedAt, updatedAt: now() }).where(eq(knowledgeSources.id, source.id));
}

export async function refreshKnowledgeSource(sourceId: string) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const source = (await db.select().from(knowledgeSources).where(and(eq(knowledgeSources.id, sourceId), eq(knowledgeSources.retrievalStatus, "eligible"))).limit(1))[0]; if (!source) throw new Error("Approved knowledge source not found.");
  const response = await fetch(source.canonicalUrl, { headers: { "user-agent": "LightLabs-Triage-Knowledge/1.0" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Knowledge fetch failed with HTTP ${response.status}.`);
  const html = await response.text(); const markdown = toMarkdown(html);
  await indexKnowledgeDocument({ sourceId, content: markdown }); return { sourceId, characters: markdown.length };
}

export async function getKnowledgeDocument(sourceId: string) {
  await ensureKnowledgeCatalog(); const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const row = (await db.select({ source: knowledgeSources, document: knowledgeDocuments }).from(knowledgeSources).leftJoin(knowledgeDocuments, and(eq(knowledgeDocuments.sourceId, knowledgeSources.id), eq(knowledgeDocuments.status, "indexed"))).where(eq(knowledgeSources.id, sourceId)).orderBy(desc(knowledgeDocuments.indexedAt)).limit(1))[0];
  if (!row?.source) throw new Error("Knowledge source not found.");
  return { source: row.source, document: row.document ? { id: row.document.id, markdown: row.document.markdownContent ?? row.document.content, summaryYaml: row.document.summaryYaml, sectionIndex: row.document.sectionIndex, fetchedAt: row.document.fetchedAt } : null };
}

export async function getKnowledgeSection(sourceId: string, anchor: string) {
  const detail = await getKnowledgeDocument(sourceId); if (!detail.document) throw new Error("This approved source has not been indexed yet.");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const section = (await db.select().from(knowledgeSections).where(and(eq(knowledgeSections.documentId, detail.document.id), eq(knowledgeSections.anchor, anchor))).limit(1))[0];
  if (!section) throw new Error("The requested section does not exist in this knowledge source.");
  return { source: { title: detail.source.title, url: detail.source.canonicalUrl, answerSafety: detail.source.answerSafety }, section: { heading: section.headingPath, anchor: section.anchor, excerpt: section.excerpt, markdown: section.markdownContent, tokenCount: section.tokenCount } };
}

export async function ensureKnowledgeDocumentSections(sourceId: string) {
  const detail = await getKnowledgeDocument(sourceId); if (!detail.document) throw new Error("This approved source has not been indexed yet.");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const existing = await db.select({ id: knowledgeSections.id }).from(knowledgeSections).where(eq(knowledgeSections.documentId, detail.document.id)).limit(1);
  if (existing.length) return { sourceId, sectionCount: existing.length, status: "present" as const };
  await indexKnowledgeDocument({ sourceId, content: detail.document.markdown, fetchedAt: detail.document.fetchedAt });
  const refreshed = await getKnowledgeDocument(sourceId); const sectionCount = refreshed.document?.sectionIndex?.length ?? 0;
  if (!sectionCount) throw new Error("Indexed knowledge document has no targetable section.");
  return { sourceId, sectionCount, status: "backfilled" as const };
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
  const candidates = rows.map(({ source, document }) => ({ sourceId: source.id, title: source.title, url: source.canonicalUrl, snippet: excerpt(document.content, query), score: relevance(query, source.title, document.content), answerSafety: source.answerSafety, summaryYaml: document.summaryYaml, sectionIndex: document.sectionIndex ?? [] })).filter(match => match.score >= 0.35).sort((a, b) => b.score - a.score);
  const matches = candidates.filter((match, index, all) => all.findIndex(candidate => candidate.url === match.url) === index).slice(0, Math.min(Math.max(input.limit ?? 3, 1), 5));
  const gateReasons = matches.length ? [] : ["No attributable indexed source matched the request."]; if (matches[0] && matches[0].score < 0.82) gateReasons.push("Top retrieval relevance is below the verified-answer threshold."); if (matches.some(match => match.answerSafety === "review_required")) gateReasons.push("Retrieved content requires human review and cannot independently open the answer gate.");
  const gate = gateReasons.length ? "closed" as const : "open" as const;
  await db.insert(knowledgeRetrievalEvents).values({ id: `kr_${nanoid(18)}`, queryText: query, interactionId: input.interactionId ?? null, retrievedAt: now(), topScore: String(matches[0]?.score ?? 0), sourceCount: matches.length, gate, reasons: gateReasons });
  return { sources: matches.map(({ sourceId: _sourceId, answerSafety: _answerSafety, summaryYaml: _summaryYaml, sectionIndex: _sectionIndex, ...source }) => ({ ...source, score: Number(source.score.toFixed(4)) })), plans: matches.map(match => ({ sourceId: match.sourceId, title: match.title, summaryYaml: match.summaryYaml, relevantSections: match.sectionIndex.filter(section => relevance(query, section.heading, section.excerpt) >= 0.2).slice(0, 3) })), gate: { status: gate, reasons: gateReasons } };
}
