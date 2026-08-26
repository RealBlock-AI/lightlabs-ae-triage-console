import { createServer } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bobbyAccountBinding } from "./accountBinding";
import { getContactBySlackUser } from "./externalIdentity";

describe("Bobby HTTP account binding", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl = "";
  const headers = { "content-type": "application/json", Authorization: `Bearer ${process.env.LIGHTLABS_BINDING_SECRET}` };
  const request = {
    schema_version: "0.1" as const,
    binding_id: "bnd_6cb028de5d06bc19bb41e7528c1e2f73",
    requested_at: "2026-08-25T18:04:11.482Z",
    slack: { team_id: "T091XR4PAQY", user_id: "U091XR4PTT2", display_name: "Nic" },
    claimed: { full_name: "Nic Thatcher", email: "nthatcher@launch99.agency", company: "Launch99 Agency", email_source: "slack" as const },
  };

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.post("/integrations/bobby/account-binding", bobbyAccountBinding);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Unable to start account-binding test server.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });

  it("returns an explicit bound confirmation and replays it idempotently", async () => {
    const first = await fetch(`${baseUrl}/integrations/bobby/account-binding`, { method: "POST", headers, body: JSON.stringify(request) });
    const replay = await fetch(`${baseUrl}/integrations/bobby/account-binding`, { method: "POST", headers, body: JSON.stringify(request) });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ status: "bound", binding_id: request.binding_id, conflict: null, account: { account_id: "acct_launch99", account_name: "Launch99 Agency", owner_id: "owner_sarah" } });
    expect(await replay.json()).toMatchObject({ status: "bound", binding_id: request.binding_id, account: { account_id: "acct_launch99", account_name: "Launch99 Agency", owner_id: "owner_sarah" } });
    expect(await getContactBySlackUser({ workspaceId: request.slack.team_id, slackUserId: request.slack.user_id })).toMatchObject({ status: "verified", link_confirmation: { linked: true, status: "bound", binding_id: request.binding_id, account_id: "acct_launch99", account_name: "Launch99 Agency", owner_id: "owner_sarah", next_dm: { delivery_key: `account-binding:${request.binding_id}`, binding_id: request.binding_id } } });
  });

  it("fails closed with a conflict when a second Slack identity claims the bound record", async () => {
    const conflict = await fetch(`${baseUrl}/integrations/bobby/account-binding`, { method: "POST", headers, body: JSON.stringify({ ...request, binding_id: "bnd_launch99_conflict_20260825", slack: { team_id: request.slack.team_id, user_id: "U0OTHER999", display_name: "Different user" } }) });
    expect(await conflict.json()).toMatchObject({ status: "conflict", conflict: { reason: "contact_already_bound_to_different_slack_id", existing_slack_user_id: request.slack.user_id, contact_id: "con_launch99_nic" } });
  });
});
