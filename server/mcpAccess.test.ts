import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { slackAccountBindings } from "../drizzle/schema";
import { getDb } from "./db";
import { assertAccountAccess, resolveMcpActor } from "./mcpAccess";
import { ensureDemoData } from "./triage";

const bindingId = "binding_mcp_access_pinecrest";

afterEach(async () => {
  const db = await getDb();
  await db?.delete(slackAccountBindings).where(eq(slackAccountBindings.bindingId, bindingId));
});

describe("MCP account-bound Slack authorization", () => {
  it("requires the durable bound record and independently verifies the active canonical membership", async () => {
    await ensureDemoData();
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const timestamp = new Date();
    await db.insert(slackAccountBindings).values({
      bindingId,
      schemaVersion: "0.1",
      requestedAt: timestamp,
      slackTeamId: "T_DEMO",
      slackUserId: "U_PINE_QC",
      slackDisplayName: "Alex Morgan",
      claimedFullName: "Alex Morgan",
      claimedEmail: "alex@pinecrest.demo",
      claimedCompany: "Pinecrest Manufacturing",
      emailSource: "slack",
      status: "bound",
      contactId: "con_pine_qc",
      accountId: "acct_pinecrest",
      conflict: null,
      reviewUrl: null,
      message: "Test binding",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const actor = await resolveMcpActor({ workspaceId: "T_DEMO", userId: "U_PINE_QC" });
    expect(actor).toMatchObject({ kind: "account", contactId: "con_pine_qc", accountIds: ["acct_pinecrest"] });
    await expect(assertAccountAccess(actor, "acct_pinecrest")).resolves.toMatchObject({ id: "acct_pinecrest" });
    await expect(assertAccountAccess(actor, "acct_lumen")).rejects.toThrow("not authorized");

    const records = await db.select().from(slackAccountBindings).where(and(eq(slackAccountBindings.bindingId, bindingId), eq(slackAccountBindings.status, "bound")));
    expect(records).toHaveLength(1);
  });
});
