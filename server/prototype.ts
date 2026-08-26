import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { accounts, contacts, interactions, orders, products, responseFeedback, tests, users } from "../drizzle/schema";
import { analytes, assayCompanyPrices, assays, companyMemberships, regulatoryLimits, samples, shipments, skus, specifications, stabilityStudies, stabilityStudyTimePoints, testLimits, testResults, turnaroundTimes } from "../drizzle/canonicalSchema";
import { evaluateTest, formatCurrency, formatDate, formatNumber, formatStatus, stabilityStatus, summarizeTrend } from "./domain";
import { getDb } from "./db";
import { assertResultVisible, ResultVisibilityError } from "./permissions";
import { AUTO_CONFIDENCE_FLOOR, baseLane, declareGateChecks, demoteLane, enforceAutoLaneOutput, gateTrace, GENERAL_CONFIDENCE_FLOOR, INTENTS, operationalIntent, type GateTraceBuilder, type Intent, type Lane } from "./policy";
import { ensurePrototypeSeed } from "./prototypeSeed";
import { getKnowledgeDocument, retrieveKnowledge } from "./knowledge";
import { isOpenOrder, isOverdueOrder, orderBelongsTo, type AccountPosture } from "./posture";
import { ackClock, ageLabel, ageMinutes, categoryLabel, tierFor, tierRank, type QueueRow } from "./queue";
import { toDualVerdict, type DualVerdict } from "./verdict";

type EvidenceItem = { label: string; value: string; source: string; citable: boolean; advisory?: boolean; refusalCode?: string };
type Classification = { intents: Intent[]; confidence: number; sampleLabel?: string; analyteName?: string; productName?: string; destinationStates: string[]; statedClaim?: { value: number; unit: string } };
type ResolvedFacts = { userId?: number; companyId?: string; sampleId?: string; testId?: string; skuId?: string; orderId?: string; analyteId?: string; unresolvedSlots: string[]; idSpace: "platform" | "lims" };

const begins = () => Date.now();
const ownerFor = (companyId?: string | null) => companyId === "co_lumen" ? "usr_sarah" : companyId === "co_northwind" ? "usr_marcus" : "usr_admin";
const severity: Record<Lane, number> = { auto: 0, assisted: 1, escalate: 2 };

function classifyPrototype(text: string): Classification {
  const operational = operationalIntent(text); if (operational) return { intents: [operational], confidence: 1, destinationStates: [] };
  const lower = text.toLowerCase();
  const states = /\b(california|ca)\b/.test(lower) ? ["CA"] : [];
  if (/\b(lead|cadmium|arsenic|mercury|out of spec|oos)\b/.test(lower)) return { intents: ["OOS_RESULT"], confidence: .96, sampleLabel: /\b8812\b/.test(lower) ? "8812" : /\bhidden\b/.test(lower) ? "H-1" : undefined, analyteName: /cadmium/.test(lower) ? "cadmium" : /arsenic/.test(lower) ? "arsenic" : /mercury/.test(lower) ? "mercury" : "lead", productName: /\bhidden\b/.test(lower) ? "Hidden Bar" : undefined, destinationStates: states };
  if (/\b(label|claim|vitamin d3|d3|iu)\b/.test(lower)) return { intents: ["LABEL_CLAIM_VARIANCE"], confidence: .95, destinationStates: states };
  if (/\b(california|launch|recommend.*test|test.*recommend|sku)\b/.test(lower)) return { intents: ["SPEC_INTAKE", "TEST_RECOMMENDATION"], confidence: .93, destinationStates: states };
  if (/\b(price|pricing|quote)\b/.test(lower)) return { intents: ["PRICING_QUOTE"], confidence: .93, destinationStates: states };
  if (/\b(human|call|escalat)\b/.test(lower)) return { intents: ["HUMAN_ESCALATION_REQUEST"], confidence: .91, destinationStates: states };
  return { intents: ["UNKNOWN"], confidence: 0, destinationStates: states };
}

function addRefusal(evidence: EvidenceItem[], facts: ResolvedFacts, label: string, code: string, reason: string) {
  facts.unresolvedSlots.push(label.toLowerCase().replace(/\s+/g, "_")); evidence.push({ label, value: reason, source: "prototype safety gate", citable: false, refusalCode: code });
}

async function assembleOrderEvidence(companyId: string, evidence: EvidenceItem[], facts: ResolvedFacts) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const order = (await db.select().from(orders).where(eq(orders.testingPlatformCompanyId, companyId)).orderBy(desc(orders.orderedAt)).limit(1))[0];
  if (!order) { addRefusal(evidence, facts, "Order", "ORDER_UNRESOLVED", "No unambiguous order record is available for this company."); return; }
  const relatedTest = (await db.select().from(tests).where(eq(tests.orderId, order.id)).orderBy(desc(tests.updatedAt)).limit(1))[0];
  const shipment = (await db.select().from(shipments).where(eq(shipments.companyId, companyId)).orderBy(desc(shipments.updatedAt)).limit(1))[0];
  facts.orderId = order.id;
  evidence.push({ label: "Order status", value: formatStatus(order.status), source: "orders", citable: true });
  if (relatedTest?.qbenchState) evidence.push({ label: "Laboratory state", value: formatStatus(relatedTest.qbenchState), source: "tests.qbench_state", citable: true });
  if (relatedTest?.estimatedCompleteDate) evidence.push({ label: "Estimated completion", value: formatDate(relatedTest.estimatedCompleteDate), source: "tests.estimated_complete_date", citable: true });
  if (shipment) evidence.push({ label: "Shipment status", value: formatStatus(shipment.status), source: "shipments", citable: true });
}

async function assembleResultEvidence(requesterId: number, companyId: string, classification: Classification, evidence: EvidenceItem[], facts: ResolvedFacts, trace: GateTraceBuilder) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const product = classification.productName ? (await db.select().from(products).where(eq(products.name, classification.productName)).limit(2))[0] : (await db.select().from(products).where(eq(products.testingPlatformCompanyId, companyId)).limit(1))[0];
  const skuRows = product ? await db.select().from(skus).where(eq(skus.productId, product.id)) : [];
  const sku = skuRows[0];
  if (!sku) { trace.stop("result_ownership", "skus"); addRefusal(evidence, facts, "SKU", "SKU_UNRESOLVED", "No scoped SKU record was resolved for the sender."); return; }
  const candidates = await db.select().from(samples).where(eq(samples.skuId, sku.id));
  const exact = classification.sampleLabel ? candidates.filter(candidate => candidate.lot?.toLowerCase() === classification.sampleLabel?.toLowerCase() || candidate.name.toLowerCase() === classification.sampleLabel?.toLowerCase()) : candidates;
  if (exact.length !== 1) { trace.stop("result_ownership", "samples"); addRefusal(evidence, facts, "Sample", "SAMPLE_AMBIGUOUS", "The named sample did not resolve to exactly one scoped record."); return; }
  const sample = exact[0]; const test = (await db.select().from(tests).where(eq(tests.sampleId, sample.id)).orderBy(desc(tests.updatedAt)).limit(1))[0];
  if (!test) { trace.stop("result_ownership", "tests"); addRefusal(evidence, facts, "Test", "TEST_UNRESOLVED", "No test record was resolved for the selected sample."); return; }
  try { await assertResultVisible(requesterId, test.id, { reportRequired: true }); }
  catch (error) { const safe = error instanceof ResultVisibilityError ? error : new ResultVisibilityError("RESULT_NOT_FOUND", "The result could not be safely accessed."); trace.stop("result_ownership", "accounts"); addRefusal(evidence, facts, "Result visibility", safe.code, safe.message); return; }
  trace.pass("result_ownership", "accounts");
  const analyte = (await db.select().from(analytes).where(eq(analytes.name, classification.analyteName ?? "lead")).limit(1))[0];
  if (!analyte) { trace.stop("limit_resolved", "analytes"); addRefusal(evidence, facts, "Analyte", "ANALYTE_UNRESOLVED", "No matching analyte record was resolved."); return; }
  const result = (await db.select().from(testResults).where(and(eq(testResults.testId, test.id), eq(testResults.analyteId, analyte.id))).limit(1))[0];
  const limit = (await db.select().from(testLimits).where(and(eq(testLimits.testId, test.id), eq(testLimits.analyteId, analyte.id))).limit(1))[0];
  const current = (await db.select().from(specifications).where(and(eq(specifications.skuId, sku.id), eq(specifications.analyteId, analyte.id))).limit(1))[0] ?? null;
  if (!result || !limit) { trace.stop("limit_resolved", "test_limits"); addRefusal(evidence, facts, "Applied limit", "LIMIT_UNRESOLVED", "The released test does not have a resolvable result and applied limit pair."); return; }
  trace.pass("limit_resolved", "test_limits");
  const verdict = evaluateTest({ test: { specStatus: test.specStatus ?? "no_spec", updatedAt: test.updatedAt ?? test.createdAt ?? new Date(), publishedAt: test.publishedAt }, result: { concentration: result.concentration, unit: result.unit, loq: result.loq, evaluation: result.evaluation }, testLimit: { upperBound: limit.upperBound, lowerBound: limit.lowerBound, limitUnit: limit.limitUnit, limitBasis: limit.limitBasis, updatedAt: limit.updatedAt, source: limit.source, customized: Boolean(limit.customized) }, sample: { servingSizeGrams: sample.servingSizeGrams, labReportedServingSize: sample.labReportedServingSize }, currentSpec: current ? { upperBound: current.upperBound, lowerBound: current.lowerBound, limitUnit: current.limitUnit, limitBasis: current.limitBasis } : null, missingServingSize: false });
  if (verdict.agreement === "disagrees" && verdict.disagreementCause === "serving_size_ambiguous") trace.stop("serving_basis_agreement", "stopped here");
  else trace.pass("serving_basis_agreement", "samples + test_limits");
  facts.sampleId = sample.id; facts.testId = test.id; facts.skuId = sku.id; facts.analyteId = analyte.id;
  evidence.push({ label: "Platform verdict", value: formatStatus(verdict.specStatus), source: "tests.spec_status", citable: true });
  evidence.push({ label: "Applied limit", value: `${verdict.appliedLimit.source} · ${verdict.appliedLimit.table}`, source: "test_limits", citable: true });
  if (verdict.computed) evidence.push({ label: "Shadow check", value: `${formatNumber(verdict.computed.value)} ${verdict.computed.unit} · ${formatNumber(verdict.computed.percentOfBound)}% of ${verdict.computed.boundType} bound`, source: "test_results + test_limits", citable: true });
  if (verdict.branches) verdict.branches.forEach(branch => evidence.push({ label: `${formatStatus(branch.servingSource)} serving branch`, value: `${formatNumber(branch.grams)} g → ${formatNumber(branch.value)} ${branch.unit} · ${branch.passes ? "within applied bound" : "outside applied bound"}`, source: "samples + test_results + test_limits", citable: false, refusalCode: "SERVING_SIZE_AMBIGUOUS" }));
  if (verdict.refusal) evidence.push({ label: "Shadow check refusal", value: verdict.refusal.reason, source: "server/domain.ts", citable: false, refusalCode: verdict.refusal.code });
  if (verdict.currentSpecDiffers) evidence.push({ label: "Current spec advisory", value: "The current SKU specification differs from the applied test snapshot.", source: "specifications + test_limits", citable: false, advisory: true });
  if (verdict.agreement === "disagrees") evidence.push({ label: "Verdict disagreement", value: `The shadow check requires human review: ${verdict.disagreementCause?.replaceAll("_", " ")}.`, source: "server/domain.ts", citable: false, refusalCode: verdict.disagreementCause });
  const prior = await db.select({ result: testResults, sample: samples }).from(testResults).innerJoin(tests, eq(testResults.testId, tests.id)).innerJoin(samples, eq(tests.sampleId, samples.id)).where(and(eq(samples.skuId, sku.id), eq(testResults.analyteId, analyte.id), ne(samples.id, sample.id))).limit(3);
  const trendRows = prior.flatMap(row => row.result.concentration === null ? [] : [{ value: Number(row.result.concentration), unit: row.result.unit, collectedAt: row.sample.timeOfCollection, lotLabel: row.sample.lot }]); const trend = summarizeTrend(trendRows);
  if (Array.isArray(trend.points)) evidence.push({ label: "Prior SKU samples", value: trend.points.map(point => `${formatDate(point.collectedAt)} · ${point.lotLabel ?? "no lot label"} · ${formatNumber(point.value)} ${point.unit}`).join("; "), source: "samples + test_results", citable: true });
  return verdict;
}

async function assembleRecommendation(companyId: string, classification: Classification, evidence: EvidenceItem[], facts: ResolvedFacts) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  if (!classification.destinationStates.length) { addRefusal(evidence, facts, "Destination jurisdiction", "JURISDICTION_UNKNOWN", "No destination state or market was stated; a regulatory regime cannot be settled."); return; }
  const california = classification.destinationStates.includes("CA");
  const purchasable = await db.select().from(assays).where(eq(assays.purchasable, 1)).limit(20);
  const eligible = purchasable.filter(assay => !california || (Boolean(assay.forProp65) && Boolean(assay.forAb899))).slice(0, 5);
  if (!eligible.length) { addRefusal(evidence, facts, "Assay catalog", "CATALOG_EMPTY", "No matching purchasable assay catalog entry was found."); return; }
  evidence.push({ label: "Jurisdiction", value: `${classification.destinationStates.join(", ")} · stated by customer`, source: "customer message", citable: false, advisory: true });
  if (california) evidence.push({ label: "Catalog coverage", value: "California coverage requires a catalog entry flagged for both Prop 65 and AB 899; this is an assay-scope recommendation, not a compliance conclusion.", source: "assays.for_prop65 + assays.for_ab899", citable: false, advisory: true });
  for (const assay of eligible) {
    const override = (await db.select().from(assayCompanyPrices).where(and(eq(assayCompanyPrices.assayId, assay.id), eq(assayCompanyPrices.companyId, companyId))).limit(1))[0];
    const rush = (await db.select().from(turnaroundTimes).where(eq(turnaroundTimes.assayId, assay.id)).orderBy(desc(turnaroundTimes.days)).limit(1))[0];
    const price = Number(override?.price ?? assay.price ?? 0); const timing = rush ? `${formatNumber(rush.days)} days ${formatStatus(rush.feeType)}` : assay.turnaroundTimeLabel ?? "not stated";
    evidence.push({ label: "Catalog panel", value: `${assay.name} · ${assay.method ?? "method not stated"} · ${assay.accredited ? "accredited" : "accreditation not stated"} · ${formatCurrency(price)} · ${timing}`, source: "assays + assay_company_prices + turnaround_times", citable: false, advisory: true });
  }
}

async function assembleStability(companyId: string, evidence: EvidenceItem[], facts: ResolvedFacts) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable"); const studies = await db.select().from(stabilityStudies).where(eq(stabilityStudies.companyId, companyId)); const study = studies[0]; if (!study) { addRefusal(evidence, facts, "Stability study", "STABILITY_UNRESOLVED", "No stability study record was resolved."); return; }
  const point = (await db.select().from(stabilityStudyTimePoints).where(eq(stabilityStudyTimePoints.stabilityStudyId, study.id)).orderBy(desc(stabilityStudyTimePoints.monthOffset)).limit(1))[0]; if (!point) { addRefusal(evidence, facts, "Stability time point", "STABILITY_UNRESOLVED", "No future stability time point was resolved."); return; }
  const schedule = stabilityStatus({ monthOffset: point.monthOffset, scheduledFor: point.date });
  evidence.push({ label: "Stability time point", value: `Month ${formatNumber(schedule.monthOffset)} scheduled for ${formatDate(schedule.scheduledFor)}`, source: "stability_studies + stability_study_time_points", citable: true });
}

function compose(lane: Lane, intents: Intent[], evidence: EvidenceItem[]) {
  const finding = (label: string) => evidence.find(item => item.label === label)?.value;
  if (lane === "auto" && intents.includes("ORDER_STATUS")) { const order = finding("Order status"); const laboratory = finding("Laboratory state"); const completion = finding("Estimated completion"); if (order && laboratory && completion) return { acknowledgment: "The latest operational records are ready.", draft: `Your latest order is ${order}. The related laboratory state is ${laboratory}, with an estimated completion date of ${completion}.` }; }
  if (lane === "auto" && intents.includes("OPS_SHIPPING")) { const shipment = finding("Shipment status"); if (shipment) return { acknowledgment: "The shipping record is ready.", draft: `The current shipment status is ${shipment}.` }; }
  if (lane === "auto" && intents.includes("STABILITY_SCHEDULE")) { const point = finding("Stability time point"); if (point) return { acknowledgment: "The scheduled stability record is ready.", draft: `The current study has a ${point}.` }; }
  const citations = evidence.filter(item => item.citable || item.advisory || item.source.startsWith("knowledge_sections#")).map(item => `${item.label}: ${item.value}`).join("\n");
  return lane === "escalate" ? { acknowledgment: "A human decision is required before any response is recorded.", draft: `Decision packet\n${citations}` } : { acknowledgment: "Records are assembled for an AE-reviewed response.", draft: `AE review packet\n${citations}` };
}

export async function runPrototypeTriage(input: { source: string; channelRef: string | null; externalEventId?: string | null; rawText: string; slackUserId?: string | null; slackWorkspaceId?: string | null; attachmentsPresent?: boolean }) {
  await ensurePrototypeSeed(); const db = await getDb(); if (!db) throw new Error("Database unavailable"); const started = begins();
  if (input.externalEventId) { const duplicate = (await db.select().from(interactions).where(and(eq(interactions.source, input.source), eq(interactions.externalEventId, input.externalEventId))).limit(1))[0]; if (duplicate) return { duplicate: true, interaction: duplicate }; }
  const user = input.slackUserId && input.slackWorkspaceId ? (await db.select().from(users).where(and(eq(users.slackUserId, input.slackUserId), eq(users.slackWorkspaceId, input.slackWorkspaceId))).limit(1))[0] : undefined;
  const membership = user ? (await db.select().from(companyMemberships).where(eq(companyMemberships.userId, user.id)).limit(1))[0] : undefined;
  // The queue shows who asked. contacts carries the name and the platform-login
  // flag; nothing else on the interaction does.
  const contact = input.slackUserId ? (await db.select().from(contacts).where(eq(contacts.slackUserId, input.slackUserId)).limit(1))[0] : undefined;
  const facts: ResolvedFacts = { userId: user?.id, companyId: membership?.companyId, unresolvedSlots: [], idSpace: "platform" }; const evidence: EvidenceItem[] = [];
  const classification = classifyPrototype(input.rawText); let lane = baseLane(classification.intents); const reasons = [`Base routing derived from ${classification.intents.join(" + ")}.`];
  // Declared up front so the packet can show what was never reached, not just what ran.
  const trace = gateTrace(declareGateChecks(classification.intents));
  let knowledgeCitations: Array<{ sourceId: string; title: string; url: string; anchor: string; score: number; contentHash?: string }> = [];
  if (!user || !membership) { trace.stop("identity_verified", "contact_bindings"); lane = demoteLane(lane, "escalate"); addRefusal(evidence, facts, "Verified identity", "IDENTITY_UNRESOLVED", "The sender could not be resolved to a verified prototype user and company membership."); reasons.unshift("Force-escalated: sender identity was not resolved."); }
  else trace.pass("identity_verified", "contact_bindings");
  if (classification.confidence < GENERAL_CONFIDENCE_FLOOR) { lane = demoteLane(lane, "escalate"); reasons.unshift("Classifier confidence is below the general safety floor."); }
  else if (classification.confidence < AUTO_CONFIDENCE_FLOOR && lane === "auto") { lane = demoteLane(lane, "assisted"); reasons.unshift("Classifier confidence is below the auto safety floor."); }
  let domain: unknown;
  if (membership) {
    if (classification.intents.includes("ORDER_STATUS") || classification.intents.includes("OPS_SHIPPING") || classification.intents.includes("OPS_DATA_EXPORT")) await assembleOrderEvidence(membership.companyId, evidence, facts);
    if (classification.intents.includes("STABILITY_SCHEDULE")) await assembleStability(membership.companyId, evidence, facts);
    if (classification.intents.includes("OOS_RESULT")) { domain = await assembleResultEvidence(user!.id, membership.companyId, classification, evidence, facts, trace); if ((domain as any)?.agreement === "disagrees") { lane = demoteLane(lane, "escalate"); reasons.unshift("Force-escalated: platform verdict and shadow check disagree."); } }
    if (classification.intents.includes("TEST_RECOMMENDATION")) await assembleRecommendation(membership.companyId, classification, evidence, facts);
  }
  if (input.attachmentsPresent && classification.intents.includes("SPEC_INTAKE")) evidence.push({ label: "Structured intake", value: "A structured intake form is the supported path for attached specification data.", source: "ingest metadata", citable: false, advisory: true });
  const blocking = evidence.filter(item => !item.citable && !item.advisory); if (blocking.length || facts.unresolvedSlots.length) { lane = demoteLane(lane, "assisted"); reasons.push("A required fact could not be resolved or safely disclosed."); }
  if (lane !== "auto") {
    try {
      const retrieval = await retrieveKnowledge({ query: input.rawText, limit: 3 });
      const sourceById = new Map(retrieval.sources.map(source => [source.url, source]));
      const citationGroups = await Promise.all(retrieval.plans.map(async plan => {
        const source = await getKnowledgeDocument(plan.sourceId);
        if (!source.document) return [];
        const fallback = plan.relevantSections.length ? [] : source.document.sectionIndex?.slice(0, 1) ?? [];
        return [...plan.relevantSections, ...fallback].map(section => {
          if (!section.anchor || !section.excerpt) return [];
          evidence.push({ label: `Knowledge · ${source.source.title}`, value: section.excerpt, source: `knowledge_sections#${section.anchor}`, citable: retrieval.gate.status === "open", advisory: retrieval.gate.status !== "open" });
          return [{ sourceId: plan.sourceId, title: source.source.title, url: source.source.canonicalUrl, anchor: section.anchor, score: retrieval.sources.find(candidate => candidate.title === plan.title)?.score ?? 0 }];
        }).flat();
      }));
      knowledgeCitations = citationGroups.flat();
      if (retrieval.gate.status === "closed") reasons.push("Knowledge retrieval is attached for AE review; the answer gate remains closed.");
      void sourceById;
    } catch {
      evidence.push({ label: "Knowledge retrieval", value: "No indexed, attributable knowledge section was available for this assisted packet.", source: "knowledge_sections", citable: false, advisory: true });
    }
  }
  const text = compose(lane, classification.intents, evidence); const guarded = enforceAutoLaneOutput(lane, `${text.acknowledgment}\n${text.draft}`); lane = guarded.lane; reasons.push(...guarded.demotions);
  if (guarded.demotions.length) trace.stop("output_guard", "stopped here"); else trace.pass("output_guard", "policy.FORBIDDEN_IN_AUTO");
  const replyReasons: string[] = []; if (!user || !membership) replyReasons.push("A verified sender-to-company identity is required."); if (lane !== "auto") replyReasons.push("This interaction is not in an auto-eligible lane."); if (classification.confidence < AUTO_CONFIDENCE_FLOOR) replyReasons.push("Classifier confidence is below the auto floor."); if (blocking.length) replyReasons.push("A required evidence item is unresolved or non-citable."); if (!classification.intents.every(intent => ["ORDER_STATUS", "OPS_SHIPPING", "OPS_DATA_EXPORT", "STABILITY_SCHEDULE"].includes(intent))) replyReasons.push("No approved auto template exists for every intent."); const status = replyReasons.length ? "ineligible" as const : "eligible" as const;
  const id = `int_${nanoid(16)}`; const row = { id, source: input.source, channelRef: input.channelRef, externalEventId: input.externalEventId ?? input.channelRef ?? null, sourceSchemaVersion: "prototype-fixture-v2", threadRef: null, sourceReceivedAt: new Date(), contactId: contact?.id ?? null, accountId: membership?.companyId ?? null, ownerId: ownerFor(membership?.companyId), requestingUserId: user?.id ?? null, companyId: membership?.companyId ?? null, receivedAt: new Date(), rawText: input.rawText, intents: classification.intents, confidence: String(classification.confidence), imminentAction: 0, classifierMethod: operationalIntent(input.rawText) ? "deterministic_operational_v2" : "prototype_structured_v2", baseLane: baseLane(classification.intents), lane, laneReasons: reasons, gateTrace: trace.rows(), verifiedReplyStatus: status, replyGateReasons: replyReasons, acknowledgment: text.acknowledgment, draft: text.draft, evidence, precedent: null, knowledgeCitations, domainComputations: domain as Record<string, unknown> ?? null, resolvedFacts: facts, attachmentsPresent: input.attachmentsPresent ? 1 : 0, sendAllowed: status === "eligible" ? 1 : 0, sendDisabled: blocking.length ? 1 : 0, status: status === "eligible" ? "auto_resolved" as const : "open" as const, msToAck: Date.now() - started, humanMinutesSaved: "0", queuePriority: severity[lane], slaMinutes: lane === "escalate" ? 15 : lane === "assisted" ? 30 : 60, resolvedAt: null, resolvedBy: null };
  await db.insert(interactions).values(row); return { duplicate: false, interaction: row };
}

/**
 * The queue, projected for the table.
 *
 * Everything the row renders is resolved here - account, contact, tier,
 * category, both clocks and the lane reason - so the page holds no lookup maps
 * and the sort cannot disagree with what is on screen.
 *
 * Sorted by urgency, then account value, then age. Lane is a column, not a
 * grouping: the AE's cursor never has rows re-order underneath it.
 */
export async function getPrototypeQueue(): Promise<QueueRow[]> {
  await ensurePrototypeSeed();
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(interactions).where(isNotNull(interactions.companyId)).orderBy(desc(interactions.receivedAt)).limit(50);
  if (!rows.length) return [];

  // Two batched reads rather than a join per row.
  const companyIds = Array.from(new Set(rows.map(row => row.companyId).filter((id): id is string => Boolean(id))));
  const contactIds = Array.from(new Set(rows.map(row => row.contactId).filter((id): id is string => Boolean(id))));
  const userIds = Array.from(new Set(rows.map(row => row.requestingUserId).filter((id): id is number => typeof id === "number")));
  const accountRows = companyIds.length ? await db.select().from(accounts).where(inArray(accounts.testingPlatformAccountId, companyIds)) : [];
  const contactRows = contactIds.length ? await db.select().from(contacts).where(inArray(contacts.id, contactIds)) : [];
  const userRows = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
  const accountByCompany = new Map(accountRows.map(account => [account.testingPlatformAccountId ?? "", account]));
  const contactById = new Map(contactRows.map(contact => [contact.id, contact]));
  const userById = new Map(userRows.map(user => [user.id, user]));

  const now = new Date();
  const projected = rows.map((row): QueueRow => {
    const account = accountByCompany.get(row.companyId ?? "");
    const contact = row.contactId ? contactById.get(row.contactId) : undefined;
    const receivedAt = row.receivedAt ?? now;
    const clock = ackClock(receivedAt, now);
    return {
      id: row.id,
      lane: row.lane,
      account: account?.name ?? "Unmapped account",
      contact: contact?.name ?? (row.requestingUserId ? userById.get(row.requestingUserId)?.name : undefined) ?? "Unresolved contact",
      tier: tierFor(account),
      category: categoryLabel(row.intents),
      ageLabel: ageLabel(receivedAt, now),
      ageMinutes: ageMinutes(receivedAt, now),
      slaLabel: clock.label,
      slaUrgent: clock.urgent,
      confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
      reason: row.laneReasons?.[0] ?? "",
    };
  });

  const urgency: Record<Lane, number> = { escalate: 0, assisted: 1, auto: 2 };
  return projected.sort((a, b) =>
    urgency[a.lane] - urgency[b.lane]
    || tierRank(a.tier) - tierRank(b.tier)
    || b.ageMinutes - a.ageMinutes);
}
/**
 * One question, and everything needed to act on it - no second tab.
 *
 * The packet is assembled in a single call on purpose: it must not wait on a
 * waterfall of requests to become readable.
 */
export async function getPrototypeItem(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const row = (await db.select().from(interactions).where(eq(interactions.id, id)).limit(1))[0];
  if (!row) return undefined;

  const account = row.companyId
    ? (await db.select().from(accounts).where(eq(accounts.testingPlatformAccountId, row.companyId)).limit(1))[0]
    : undefined;
  const contact = row.contactId
    ? (await db.select().from(contacts).where(eq(contacts.id, row.contactId)).limit(1))[0]
    : undefined;
  // Rows written before contact resolution carry no contact_id; fall back to
  // the requesting user so the packet header names a person.
  const requester = !contact && row.requestingUserId
    ? (await db.select().from(users).where(eq(users.id, row.requestingUserId)).limit(1))[0]
    : undefined;

  // The orders table is inconsistent about which identifier it stores, so match
  // on every identifier this account is known by.
  const identifiers = [row.companyId, row.accountId, account?.id];
  const orderRows = await db.select().from(orders);
  const mine = orderRows.filter(order => orderBelongsTo(order, identifiers));
  const now = new Date();

  const openQuestions = row.companyId
    ? Number((await db.select({ count: sql<number>`count(*)` }).from(interactions)
        .where(and(eq(interactions.companyId, row.companyId), eq(interactions.status, "open"))))[0]?.count ?? 0)
    : 0;

  const posture: AccountPosture = {
    openOrders: mine.filter(order => isOpenOrder(order.status)).length,
    overdueOrders: mine.filter(order => isOverdueOrder(order, now)).length,
    openQuestions,
    hasLogin: Boolean(contact?.hasPlatformLogin),
  };

  // Two defensible answers, when the evaluator found them. Rows written before
  // the applied bound was carried project to undefined, and the packet falls
  // back to the ordinary single readout.
  const verdict = row.domainComputations as Parameters<typeof toDualVerdict>[0] | null;
  const dualVerdict: DualVerdict | undefined = verdict
    ? toDualVerdict(verdict, { analyte: "lead", resultRef: row.id })
    : undefined;

  return {
    ...row,
    account: account?.name ?? "Unmapped account",
    contact: contact?.name ?? requester?.name ?? "Unresolved contact",
    tier: tierFor(account),
    category: categoryLabel(row.intents),
    posture,
    dualVerdict,
  };
}

export async function createStructuredIntake(input: { requestingUserId: number; companyId: string; productName: string; skuCode: string; category: string; availableSampleGrams?: number; analyteName: string; limitValue?: number; limitUnit?: string; limitBasis?: "per_serving" | "per_kg" | "per_capsule" | "per_100g"; source: string }) {
  await ensurePrototypeSeed(); const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const membership = (await db.select().from(companyMemberships).where(and(eq(companyMemberships.userId, input.requestingUserId), eq(companyMemberships.companyId, input.companyId))).limit(1))[0];
  if (!membership) throw new Error("The selected user does not have access to this company intake.");
  const now = new Date(); const productId = `prod_${nanoid(12)}`; const skuId = `sku_${nanoid(12)}`;
  const analyte = (await db.select().from(analytes).where(eq(analytes.name, input.analyteName.toLowerCase())).limit(1))[0] ?? (await db.insert(analytes).values({ id: `an_${nanoid(12)}`, name: input.analyteName.toLowerCase(), shortName: null, categoryId: null, limsId: null, createdAt: now, updatedAt: now }).$returningId())[0];
  const analyteId = "id" in analyte ? String(analyte.id) : String(analyte);
  await db.insert(products).values({ id: productId, accountId: input.companyId, appAccountId: input.companyId, testingPlatformCompanyId: input.companyId, testingPlatformProductId: productId, name: input.productName, category: input.category, brand: null, productType: "finished_good", shelfLife: null, servingSizeG: input.availableSampleGrams ? String(input.availableSampleGrams) : null, limsId: null, createdAt: now, updatedAt: now, archivedAt: null });
  await db.insert(skus).values({ id: skuId, name: input.productName, code: input.skuCode, supplier: null, productId, servingSizeGrams: input.availableSampleGrams ? String(input.availableSampleGrams) : null, servingSizeUnit: input.availableSampleGrams ? "g" : null, specRequiresServingSize: input.limitBasis === "per_serving" ? 1 : 0, limsId: null, archivedAt: null, createdAt: now, updatedAt: now });
  if (input.limitValue !== undefined && input.limitUnit && input.limitBasis) await db.insert(specifications).values({ id: `spec_${nanoid(12)}`, skuId, analyteId, source: input.source, limitType: "upper", limitUnit: input.limitUnit, limitBasis: input.limitBasis, upperBound: String(input.limitValue), lowerBound: null, createdAt: now, updatedAt: now });
  return { productId, skuId, analyteId };
}

/* -------------------------------------------------------------------------
   Acting on a packet.

   The draft is edited in place and autosaves on blur. A decision is recorded
   against the interaction, and an override records why - a lane the system
   chose and a human overruled is exactly the case the audit trail exists for.
------------------------------------------------------------------------- */

export type PacketAction = "send" | "ask_customer" | "resolve" | "override";

export async function savePrototypeDraft(input: { id: string; draft: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(interactions).set({ draft: input.draft }).where(eq(interactions.id, input.id));
  return { saved: true as const };
}

export async function decidePrototypeItem(input: { id: string; action: PacketAction; overrideReason?: string; sentText?: string; userId?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const row = (await db.select().from(interactions).where(eq(interactions.id, input.id)).limit(1))[0];
  if (!row) throw new Error("That interaction no longer exists.");

  // An override without a reason is the one thing this action exists to
  // prevent, so it is refused on the server as well as disabled in the UI.
  const reason = input.overrideReason?.trim();
  if (input.action === "override" && !reason) throw new Error("An override requires a reason.");

  // auto_resolved means the system answered without a human. A human pressing
  // send on a reviewed draft, or overruling the lane outright, is "resolved" -
  // recording either as auto_resolved would misreport the audit trail.
  const status = input.action === "ask_customer" ? "awaiting_customer" as const
    : input.action === "send" && row.lane === "auto" ? "auto_resolved" as const
    : "resolved" as const;
  const now = new Date();

  // Asking the customer pauses the item rather than closing it, so it keeps no
  // resolution timestamp.
  const closed = status !== "awaiting_customer";
  await db.update(interactions).set({
    status,
    draft: input.sentText ?? row.draft,
    resolvedAt: closed ? now : null,
    resolvedBy: closed ? (input.userId ?? "usr_sarah") : null,
  }).where(eq(interactions.id, input.id));

  if (reason) {
    await db.insert(responseFeedback).values({
      id: `fb_${nanoid(16)}`,
      interactionId: input.id,
      userId: input.userId ?? "usr_sarah",
      draftedText: row.draft ?? null,
      sentText: input.sentText ?? row.draft ?? "",
      editRatio: "0",
      category: Array.isArray(row.intents) ? row.intents[0] ?? "UNKNOWN" : "UNKNOWN",
      lane: row.lane,
      overrideReason: reason,
      createdAt: now,
    });
  }

  return { status, recordedReason: Boolean(reason) };
}
