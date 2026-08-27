import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { slackAppInstallations, slackOauthStates } from "../drizzle/schema";
import { getDb } from "./db";
import { beginSlackInstallation, completeSlackInstallation, getSlackInstallationForWorkspace, getSlackInstallationStatus } from "./slackInstallations";

const requestedByUserId = "slack-install-test-user";
const workspaceId = "T_MCP_INSTALL_TEST";

afterEach(async () => {
  vi.unstubAllGlobals();
  const db = await getDb();
  await db?.delete(slackOauthStates).where(eq(slackOauthStates.requestedByUserId, requestedByUserId));
  await db?.delete(slackAppInstallations).where(eq(slackAppInstallations.slackWorkspaceId, workspaceId));
});

describe("durable Slack app installation", () => {
  it("hashes a one-time OAuth state and persists an encrypted workspace token beyond the request", async () => {
    const first = await beginSlackInstallation(requestedByUserId);
    const state = new URL(first.authorizationUrl).searchParams.get("state");
    expect(state).toBeTruthy();
    expect(first.authorizationUrl).toContain("mcp%3Aconnect");
    const db = await getDb();
    const storedState = (await db!.select().from(slackOauthStates).where(eq(slackOauthStates.requestedByUserId, requestedByUserId)).limit(1))[0];
    expect(storedState?.stateHash).not.toBe(state);
    expect(storedState?.usedAt).toBeNull();
    expect(storedState?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const fakeFetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, access_token: "xoxb-first-token", scope: "mcp:connect,files:read", app_id: "A_LIGHTLABS", bot_user_id: "U_LIGHTLABS_BOT", team: { id: workspaceId }, enterprise: { id: "E_LIGHTLABS" }, authed_user: { id: "U_INSTALLER" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fakeFetch);
    await expect(completeSlackInstallation({ code: "first-code", state: state! })).resolves.toEqual({ workspaceId, enterpriseId: "E_LIGHTLABS" });
    await expect(completeSlackInstallation({ code: "first-code", state: state! })).rejects.toThrow("missing, expired, or was already used");

    const storedInstallation = (await db!.select().from(slackAppInstallations).where(eq(slackAppInstallations.slackWorkspaceId, workspaceId)).limit(1))[0];
    expect(storedInstallation?.botTokenEncrypted).not.toContain("xoxb-first-token");
    expect(storedInstallation?.grantedScopes).toEqual(["mcp:connect", "files:read"]);
    await expect(getSlackInstallationForWorkspace(workspaceId)).resolves.toMatchObject({ botToken: "xoxb-first-token", status: "active" });
    expect((await getSlackInstallationStatus()).find(item => item.workspaceId === workspaceId)).not.toHaveProperty("botToken");
  });

  it("updates the single durable workspace installation when Slack rotates the app token", async () => {
    const first = await beginSlackInstallation(requestedByUserId);
    const firstState = new URL(first.authorizationUrl).searchParams.get("state");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, access_token: "xoxb-before-rotation", scope: "mcp:connect,files:read", team: { id: workspaceId } }), { status: 200, headers: { "content-type": "application/json" } })));
    await completeSlackInstallation({ code: "before-rotation", state: firstState! });
    const second = await beginSlackInstallation(requestedByUserId);
    const secondState = new URL(second.authorizationUrl).searchParams.get("state");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, access_token: "xoxb-after-rotation", scope: "mcp:connect,files:read,users:read", team: { id: workspaceId } }), { status: 200, headers: { "content-type": "application/json" } })));
    await completeSlackInstallation({ code: "after-rotation", state: secondState! });

    const db = await getDb();
    const records = await db!.select().from(slackAppInstallations).where(eq(slackAppInstallations.slackWorkspaceId, workspaceId));
    expect(records).toHaveLength(1);
    await expect(getSlackInstallationForWorkspace(workspaceId)).resolves.toMatchObject({ botToken: "xoxb-after-rotation", grantedScopes: ["mcp:connect", "files:read", "users:read"] });
  });
});
