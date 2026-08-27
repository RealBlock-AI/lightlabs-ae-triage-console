import { describe, expect, it } from "vitest";
import { addPendingContactMapping, beginHubSpotAuthorization, completeHubSpotCallbackUrl, getHubSpotConnectionStatus, listHubSpotMcpTools, refreshHubSpotContactContext, verifyHubSpotMcpConnection } from "./hubspot";

const runLiveHubSpotChecks = process.env.RUN_LIVE_HUBSPOT_TESTS === "true";

describe("HubSpot MCP OAuth setup", () => {
  it("creates a PKCE authorization URL with the published callback and records a pending server-side session", async () => {
    const result = await beginHubSpotAuthorization("usr_admin");
    const url = new URL(result.authorizationUrl);
    expect(url.origin).toBe("https://mcp.hubspot.com");
    expect(url.pathname).toBe("/oauth/authorize/user");
    expect(url.searchParams.get("redirect_uri")).toBe("https://lighttriage-gdngkmys.manus.space/integrations/hubspot/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toHaveLength(43);
  });

  it("reports only non-sensitive HubSpot connection status after OAuth consent", async () => {
    const status = await getHubSpotConnectionStatus();
    expect(status.connected).toEqual(expect.any(Boolean));
    expect(status).toHaveProperty("updatedAt");
    if (status.connected) expect(status.updatedAt).toEqual(expect.anything());
    else expect(status.updatedAt).toBeNull();
    expect(status).not.toHaveProperty("accessTokenEncrypted");
    expect(status).not.toHaveProperty("refreshTokenEncrypted");
  });

  it("refuses a manual callback URL from any origin other than the registered Light Labs callback", async () => {
    await expect(completeHubSpotCallbackUrl("https://example.com/integrations/hubspot/callback?code=abc&state=def")).rejects.toThrow(/registered Light Labs HubSpot callback/i);
  });

  it.runIf(runLiveHubSpotChecks)("performs a read-only authenticated HubSpot MCP health check", async () => {
    const verification = await verifyHubSpotMcpConnection();
    expect(verification.connected).toBe(true);
  }, 15_000);

  it.runIf(runLiveHubSpotChecks)("discovers the live HubSpot MCP read-only tool contract before CRM enrichment", async () => {
    const tools = await listHubSpotMcpTools();
    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining(["get_user_details", "search_crm_objects", "get_crm_objects", "search_conversations"]));
  }, 15_000);

  it("rejects an unverified non-numeric HubSpot contact identity before any CRM lookup", async () => {
    await expect(refreshHubSpotContactContext({ contactId: "con_demo", hubspotContactId: "not-a-crm-id" })).rejects.toThrow(/verified numeric HubSpot contact ID/i);
  });

  it("requires a complete Slack identity when an administrator begins a verified contact mapping", async () => {
    await expect(addPendingContactMapping({ accountId: "acct_northwind", name: "Customer Test", email: "customer@example.test", slackWorkspaceId: "", slackUserId: "U_TEST" })).rejects.toThrow(/workspace ID/i);
  });
});
