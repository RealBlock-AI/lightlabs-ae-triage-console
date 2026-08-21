import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { APPENDIX_A, capacity, ensureDemoData, getItemForViewer, getQueue, recordSend, requestClarification, resolveItem, runFixture } from "./triage";
import { listKnowledgeSources, refreshKnowledgeSource, retrieveKnowledge } from "./knowledge";
import { addPendingContactMapping, beginHubSpotAuthorization, completeHubSpotCallbackUrl, getHubSpotConnectionStatus, listAccountsForContactMapping, listContactMappings, refreshHubSpotContactContext, searchHubSpotContactsByEmail, verifyAndMapContact, verifyHubSpotMcpConnection } from "./hubspot";

const viewerSchema = z.enum(["usr_sarah", "usr_marcus", "usr_admin"]);
const laneSchema = z.enum(["auto", "assisted", "escalate"]);
const adminProcedure = protectedProcedure.use(({ ctx, next }) => { if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access is required." }); return next(); });

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
    bootstrap: publicProcedure.mutation(async () => { await ensureDemoData(); return { success: true }; }),
    fixtures: publicProcedure.query(() => APPENDIX_A.map(({ id, text, classification }) => ({ id, text, lane: classification.intents.includes("ORDER_STATUS") || classification.intents.includes("OPS_SHIPPING") || classification.intents.includes("OPS_DATA_EXPORT") ? "auto" : classification.intents.includes("ASSAY_SCOPE_QUESTION") ? "assisted" : "escalate" }))),
    queue: publicProcedure.input(z.object({ viewerId: viewerSchema, lane: laneSchema.optional() })).query(({ input }) => getQueue(input.viewerId, input.lane)),
    item: publicProcedure.input(z.object({ id: z.string().min(1), viewerId: viewerSchema })).query(async ({ input }) => ({ item: await getItemForViewer(input.id, input.viewerId) ?? null })),
    runFixture: publicProcedure.input(z.object({ fixtureId: z.number().int().min(1).max(8) })).mutation(({ input }) => runFixture(input.fixtureId)),
    send: publicProcedure.input(z.object({ interactionId: z.string(), viewerId: viewerSchema, sentText: z.string().min(1), overrideReason: z.string().optional(), reviewed: z.boolean().optional() })).mutation(({ input }) => recordSend(input)),
    clarify: publicProcedure.input(z.object({ interactionId: z.string(), viewerId: viewerSchema, question: z.string().min(1) })).mutation(({ input }) => requestClarification(input.interactionId, input.viewerId, input.question)),
    resolve: publicProcedure.input(z.object({ interactionId: z.string(), viewerId: viewerSchema })).mutation(({ input }) => resolveItem(input.interactionId, input.viewerId)),
    capacity: publicProcedure.query(() => capacity()),
  }),
  knowledge: router({
    sources: publicProcedure.query(() => listKnowledgeSources()),
    search: publicProcedure.input(z.object({ query: z.string().min(3).max(2000), interactionId: z.string().optional(), limit: z.number().int().min(1).max(5).optional() })).query(({ input }) => retrieveKnowledge(input)),
    refreshSource: publicProcedure.input(z.object({ sourceId: z.string().min(1), viewerId: z.literal("usr_admin") })).mutation(({ input }) => refreshKnowledgeSource(input.sourceId)),
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
    verifyAndMapContact: adminProcedure.input(z.object({ contactId: z.string().min(1), hubspotContactId: z.string().regex(/^\d+$/) })).mutation(({ input }) => verifyAndMapContact(input)),
  }),
});

export type AppRouter = typeof appRouter;
