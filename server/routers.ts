import { z } from "zod";
import { nanoid } from "nanoid";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { APPENDIX_A, capacity, ensureDemoData, getItemForViewer, getQueue, recordSend, requestClarification, resolveItem, runFixture } from "./triage";
import { getKnowledgeDocument, getKnowledgeSection, listKnowledgeSources, refreshKnowledgeSource, retrieveKnowledge } from "./knowledge";
import { addPendingContactMapping, beginHubSpotAuthorization, completeHubSpotCallbackUrl, getHubSpotConnectionStatus, listAccountsForContactMapping, listContactMappings, refreshHubSpotContactContext, searchHubSpotContactsByEmail, verifyAndMapContact, verifyHubSpotMcpConnection } from "./hubspot";
import { approveMcpIdentityRequest, listInternalTeamMembers, listMcpIdentityRequests } from "./mcpIdentity";
import { listIntegrationAudit } from "./integrationAudit";
import { recordIntegrationAudit } from "./integrationAudit";
import { listIngestPolicies, setIngestPolicy } from "./ingestPolicy";
import { listExternalSlackIdentityCandidates } from "./externalIdentity";
import { listBindingReviews, reviewBinding } from "./accountBinding";
import { ensurePrototypeSeed } from "./prototypeSeed";
import { createStructuredIntake, decidePrototypeItem, getPrototypeItem, getPrototypeQueue, runPrototypeTriage, savePrototypeDraft, simulatePrototypePolicy } from "./prototype";
import { capacityMultiple } from "./domain";
import { getLimsConnectionStatus } from "./lims";
import { DEMO_FIELDS, demoStatus, filterDemoProperties, getBySlackIdentity, getDemoAccount, getDemoContact, getVerificationClaim, listDemoCompanies, listDemoContacts, listDemoDeals, listDemoFields, listDemoPolicies, previewVerification, seedDemoHubSpot, updateDemoContactField, upsertDemoRecord, verifyClaim, type VerificationClaim } from "./demoHubspot";
import { getOwnerPortfolio, listOwnerPortfolios, seedOwnerPortfolios } from "./portfolioService";
import { listSupportFields, listTestingPlatformFields } from "./referenceCatalog";

const viewerSchema = z.enum(["usr_sarah", "usr_marcus", "usr_admin"]);
const laneSchema = z.enum(["auto", "assisted", "escalate"]);
const adminProcedure = protectedProcedure.use(({ ctx, next }) => { if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access is required." }); return next(); });
const retiredLegacyTriage = () => ({ retired: true, message: "The legacy fixture triage API is retired. Use the canonical prototype API." }) as any;

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  triage: router({
    bootstrap: publicProcedure.mutation(retiredLegacyTriage),
    fixtures: publicProcedure.query(retiredLegacyTriage),
    queue: publicProcedure.input(z.object({ viewerId: viewerSchema, lane: laneSchema.optional() })).query(retiredLegacyTriage),
    item: publicProcedure.input(z.object({ id: z.string().min(1), viewerId: viewerSchema })).query(retiredLegacyTriage),
    runFixture: publicProcedure.input(z.object({ fixtureId: z.number().int().min(1).max(8) })).mutation(retiredLegacyTriage),
    send: publicProcedure.input(z.object({ interactionId: z.string(), viewerId: viewerSchema, sentText: z.string().min(1), overrideReason: z.string().optional(), reviewed: z.boolean().optional() })).mutation(retiredLegacyTriage),
    clarify: publicProcedure.input(z.object({ interactionId: z.string(), viewerId: viewerSchema, question: z.string().min(1) })).mutation(retiredLegacyTriage),
    resolve: publicProcedure.input(z.object({ interactionId: z.string(), viewerId: viewerSchema })).mutation(retiredLegacyTriage),
    capacity: publicProcedure.query(retiredLegacyTriage),
  }),
  prototype: router({
    bootstrap: publicProcedure.mutation(async () => { await ensurePrototypeSeed(); return { success: true }; }),
    queue: publicProcedure.query(() => getPrototypeQueue()),
    item: publicProcedure.input(z.object({ id: z.string().min(1) })).query(({ input }) => getPrototypeItem(input.id)),
    // What-if only. This is a query, not a mutation, because it must never
    // be able to change the routing policy it is modelling.
    simulate: publicProcedure.input(z.object({ proposals: z.record(z.string(), laneSchema) }))
      .query(({ input }) => simulatePrototypePolicy(input.proposals as never)),
    saveDraft: publicProcedure.input(z.object({ id: z.string().min(1), draft: z.string().max(20000) })).mutation(({ input }) => savePrototypeDraft(input)),
    decide: publicProcedure.input(z.object({
      id: z.string().min(1),
      action: z.enum(["send", "ask_customer", "resolve", "override"]),
      // An override reason cannot be empty. Enforced here as well as in the UI.
      overrideReason: z.string().trim().min(1).optional(),
      // Likewise: asking the customer means asking something.
      question: z.string().trim().min(1).max(2000).optional(),
      sentText: z.string().max(20000).optional(),
    })).mutation(({ input }) => decidePrototypeItem(input)),
    run: publicProcedure.input(z.object({ userId: z.enum(["northwind", "lumen", "coman", "denied"]), text: z.string().min(3).max(4000), attachmentsPresent: z.boolean().optional() })).mutation(async ({ input }) => {
      await ensurePrototypeSeed();
      const identity = { northwind: "U_NORTH_OPS", lumen: "U_LUMEN_QA", coman: "U_PINE_QC", denied: "U_DENIED" }[input.userId];
      return runPrototypeTriage({ source: "prototype_console", channelRef: `console|${Date.now()}`, externalEventId: `console|${nanoid()}`, slackUserId: identity, slackWorkspaceId: "T_DEMO", rawText: input.text, attachmentsPresent: input.attachmentsPresent });
    }),
    intake: publicProcedure.input(z.object({ userId: z.enum(["northwind", "lumen", "coman", "denied"]), companyId: z.string().min(1), productName: z.string().min(2).max(200), skuCode: z.string().min(2).max(120), category: z.string().min(2).max(100), availableSampleGrams: z.number().positive().optional(), analyteName: z.string().min(2).max(160), limitValue: z.number().positive().optional(), limitUnit: z.string().min(1).max(32).optional(), limitBasis: z.enum(["per_serving", "per_kg", "per_capsule", "per_100g"]).optional(), source: z.string().min(2).max(200) })).mutation(async ({ input }) => {
      await ensurePrototypeSeed();
      const requester = { northwind: 9001, lumen: 9002, coman: 9003, denied: 9004 }[input.userId];
      return createStructuredIntake({ ...input, requestingUserId: requester });
    }),
    capacity: publicProcedure.input(z.object({ n: z.number().min(.01).max(.95), d: z.number().min(0).max(.99), t: z.number().min(1).max(20) })).query(({ input }) => ({ formula: "1 / (n + (1 − n) × (1 − d) / T)", multiple: capacityMultiple(input.n, input.d, input.t), ceiling: 1 / input.n, points: [1, 2, 3, 4, 5, 6, 7, 8].map(t => ({ t, value: capacityMultiple(input.n, input.d, t) })) })),
  }),
  portfolio: router({
    bootstrap: publicProcedure.mutation(async () => { await seedOwnerPortfolios(); await seedDemoHubSpot(); return { success: true }; }),
    owners: publicProcedure.query(() => listOwnerPortfolios()),
    detail: publicProcedure.input(z.object({ ownerId: z.string().min(1) })).query(({ input }) => getOwnerPortfolio(input.ownerId)),
  }),
  referenceCatalog: router({
    fields: publicProcedure.query(async () => { await seedDemoHubSpot(); return { hubspot: await listDemoFields(), platform: await listTestingPlatformFields(), support: await listSupportFields() }; }),
  }),
  knowledge: router({
    sources: publicProcedure.query(() => listKnowledgeSources()),
    document: publicProcedure.input(z.object({ sourceId: z.string().min(1) })).query(({ input }) => getKnowledgeDocument(input.sourceId)),
    section: publicProcedure.input(z.object({ sourceId: z.string().min(1), anchor: z.string().min(1) })).query(({ input }) => getKnowledgeSection(input.sourceId, input.anchor)),
    search: publicProcedure.input(z.object({ query: z.string().min(3).max(2000), interactionId: z.string().optional(), limit: z.number().int().min(1).max(5).optional() })).query(({ input }) => retrieveKnowledge(input)),
    refreshSource: publicProcedure.input(z.object({ sourceId: z.string().min(1), viewerId: z.literal("usr_admin") })).mutation(({ input }) => refreshKnowledgeSource(input.sourceId)),
  }),
  demoHubspot: router({
    status: adminProcedure.query(() => demoStatus()),
    bootstrap: adminProcedure.mutation(() => seedDemoHubSpot()),
    fields: adminProcedure.query(() => listDemoFields()),
    companies: adminProcedure.query(() => listDemoCompanies()),
    contacts: adminProcedure.query(() => listDemoContacts()),
    deals: adminProcedure.query(() => listDemoDeals()),
    account: adminProcedure.input(z.object({ id: z.string().min(1) })).query(({ input }) => getDemoAccount(input.id)),
    contact: adminProcedure.input(z.object({ id: z.string().min(1) })).query(({ input }) => getDemoContact(input.id)),
    verificationPreview: adminProcedure.input(z.object({ schema_version: z.literal("0.1"), claim_id: z.string().min(7).max(96), submitted_at: z.string(), slack_team_id: z.string().min(3).max(64), slack_user_id: z.string().min(3).max(120), slack_display_name: z.string().max(160), claimed_full_name: z.string().min(1).max(160), claimed_email: z.string().email(), claimed_company: z.string().min(1).max(240), claimed_email_source: z.enum(["slack", "typed"]) })).mutation(({ input }) => previewVerification(input as VerificationClaim)),
    verifyClaim: adminProcedure.input(z.object({ schema_version: z.literal("0.1"), claim_id: z.string().min(7).max(96), submitted_at: z.string(), slack_team_id: z.string().min(3).max(64), slack_user_id: z.string().min(3).max(120), slack_display_name: z.string().max(160), claimed_full_name: z.string().min(1).max(160), claimed_email: z.string().email(), claimed_company: z.string().min(1).max(240), claimed_email_source: z.enum(["slack", "typed"]) })).mutation(({ input, ctx }) => verifyClaim(input as VerificationClaim, String(ctx.user.id))),
    claimStatus: adminProcedure.input(z.object({ claimId: z.string().min(7).max(96) })).query(({ input }) => getVerificationClaim(input.claimId)),
    bySlackIdentity: adminProcedure.input(z.object({ slackTeamId: z.string().min(3), slackUserId: z.string().min(3) })).query(({ input }) => getBySlackIdentity(input.slackTeamId, input.slackUserId)),
    fieldCatalog: adminProcedure.query(() => DEMO_FIELDS),
    policies: adminProcedure.query(() => listDemoPolicies()),
    updateContactField: adminProcedure.input(z.object({ contactId: z.string().min(1), fieldKey: z.string().min(1).max(160), value: z.union([z.string(), z.number(), z.boolean(), z.null()]) })).mutation(({ input, ctx }) => updateDemoContactField({ ...input, actorUserId: String(ctx.user.id) })),
    upsert: adminProcedure.input(z.object({ objectType: z.enum(["companies", "contacts", "deals"]), id: z.string().min(1).max(64), properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])) })).mutation(({ input, ctx }) => upsertDemoRecord({ ...input, actorUserId: String(ctx.user.id) })),
    filterProperties: adminProcedure.input(z.object({ role: z.enum(["admin", "user", "read_only"]), objectType: z.enum(["companies", "contacts", "deals"]), properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])) })).query(({ input }) => filterDemoProperties(input.role, input.objectType, input.properties)),
  }),
  hubspot: router({
    status: adminProcedure.query(() => getHubSpotConnectionStatus()),
    beginAuthorization: adminProcedure.mutation(({ ctx }) => beginHubSpotAuthorization(String(ctx.user.id))),
    completeManualAuthorization: adminProcedure.input(z.object({ callbackUrl: z.string().url().max(4000) })).mutation(({ input }) => completeHubSpotCallbackUrl(input.callbackUrl)),
    verifyConnection: adminProcedure.mutation(() => verifyHubSpotMcpConnection()),
    refreshVerifiedContact: adminProcedure.input(z.object({ contactId: z.string().min(1), hubspotContactId: z.string().regex(/^\d+$/) })).mutation(({ input }) => refreshHubSpotContactContext(input)),
    contactMappings: adminProcedure.query(() => listContactMappings()),
    mappingAccounts: adminProcedure.query(() => listAccountsForContactMapping()),
    addPendingContact: adminProcedure.input(z.object({ accountId: z.string().min(1), name: z.string().min(2).max(160), email: z.string().email(), slackWorkspaceId: z.string().min(1).max(64), slackUserId: z.string().min(1).max(100) })).mutation(({ input }) => addPendingContactMapping(input)),
    searchContactsByEmail: adminProcedure.input(z.object({ email: z.string().email() })).mutation(({ input }) => searchHubSpotContactsByEmail(input.email)),
    verifyAndMapContact: adminProcedure.input(z.object({ contactId: z.string().min(1), hubspotContactId: z.string().regex(/^\d+$/) })).mutation(({ input, ctx }) => verifyAndMapContact({ ...input, verifiedByUserId: String(ctx.user.id) })),
    externalSlackCandidates: adminProcedure.query(() => listExternalSlackIdentityCandidates()),
  }),
  identity: router({
    writePending: adminProcedure.input(z.object({ accountId: z.string().min(1), name: z.string().min(2).max(160), email: z.string().email(), slackWorkspaceId: z.string().min(1).max(64), slackUserId: z.string().min(1).max(100) })).mutation(async ({ input, ctx }) => {
      const identity = await addPendingContactMapping(input);
      await recordIntegrationAudit({ surface: "bobby", eventType: "identity_write_staged", outcome: "accepted", statusCode: 201, slackWorkspaceId: input.slackWorkspaceId, slackUserId: input.slackUserId, metadata: { accountId: input.accountId, contactId: identity.id, writtenByUserId: ctx.user.id, verificationState: "pending_exact_hubspot_email" } });
      return { ...identity, disposition: "pending_exact_hubspot_email" as const };
    }),
  }),
  bindingReview: router({
    list: adminProcedure.input(z.object({ bindingId: z.string().min(7).max(128).optional() }).optional()).query(({ input }) => listBindingReviews(input)),
    decide: adminProcedure.input(z.object({ bindingId: z.string().min(7).max(128), action: z.enum(["approve", "reject", "resolve_conflict"]), message: z.string().max(500).optional() })).mutation(({ input, ctx }) => reviewBinding({ ...input, reviewedByUserId: String(ctx.user.id) })),
  }),
  lims: router({ status: publicProcedure.query(() => getLimsConnectionStatus()) }),
  mcpAccess: router({
    pendingIdentities: adminProcedure.query(() => listMcpIdentityRequests()),
    teamMembers: adminProcedure.query(() => listInternalTeamMembers()),
    approveIdentity: adminProcedure.input(z.object({ requestId: z.string().min(1), teamMemberId: z.string().min(1) })).mutation(({ input }) => approveMcpIdentityRequest(input)),
  }),
  integrationAudit: router({ recent: adminProcedure.input(z.object({ surface: z.enum(["mcp", "slack_ingest"]).optional() }).optional()).query(({ input }) => listIntegrationAudit(input?.surface)) }),
  ingestPolicies: router({
    list: adminProcedure.query(() => listIngestPolicies()),
    set: adminProcedure.input(z.object({ workspaceId: z.string().min(1).max(64), channelId: z.string().min(1).max(100), authoritativeTransport: z.enum(["native_slack", "custom_bridge", "disabled"]), enabled: z.boolean() })).mutation(async ({ input, ctx }) => {
      const policy = await setIngestPolicy(input);
      await recordIntegrationAudit({ surface: "slack_ingest", eventType: "bridge_policy_saved", outcome: "accepted", statusCode: 200, slackWorkspaceId: input.workspaceId, metadata: { channelId: input.channelId, authoritativeTransport: input.authoritativeTransport, enabled: input.enabled, writtenByUserId: ctx.user.id } });
      return policy;
    }),
  }),
});

export type AppRouter = typeof appRouter;
