import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { slackAccountBindings } from "../drizzle/schema";
import { listBindingReviews, reviewBinding } from "./accountBinding";
import { getDb } from "./db";

const dbTest = process.env.DATABASE_URL ? it : it.skip;

describe("account-binding review", () => {
  dbTest("lists a pending review and lets an administrator reject it with a customer-safe result", async () => {
    const db = await getDb();
    const bindingId = `bnd_review_reject_${Date.now()}`;
    const timestamp = new Date();
    await db!.insert(slackAccountBindings).values({ bindingId, schemaVersion: "0.1", requestedAt: timestamp, slackTeamId: "T_REVIEW_TEST", slackUserId: "U_REVIEW_TEST", slackDisplayName: "Review test", claimedFullName: "Review Test", claimedEmail: "review@example.com", claimedCompany: "Review Company", emailSource: "typed", status: "pending", contactId: null, accountId: null, conflict: null, reviewUrl: `https://example.test/bindings/${bindingId}`, message: "Awaiting review.", createdAt: timestamp, updatedAt: timestamp });
    const queued = await listBindingReviews({ bindingId });
    expect(queued[0]).toMatchObject({ bindingId, status: "pending", claimed: { email: "review@example.com" } });
    const decision = await reviewBinding({ bindingId, action: "reject", reviewedByUserId: "1" });
    expect(decision).toMatchObject({ bindingId, status: "rejected", message: "The account-link request was not approved. Your account manager will follow up." });
    await db!.delete(slackAccountBindings).where(eq(slackAccountBindings.bindingId, bindingId));
  });
});
