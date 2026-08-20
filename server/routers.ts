import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { APPENDIX_A, capacity, ensureDemoData, getItemForViewer, getQueue, recordSend, requestClarification, resolveItem, runFixture } from "./triage";

const viewerSchema = z.enum(["usr_sarah", "usr_marcus", "usr_admin"]);
const laneSchema = z.enum(["auto", "assisted", "escalate"]);

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
});

export type AppRouter = typeof appRouter;
