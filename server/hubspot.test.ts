import { describe, expect, it } from "vitest";
import { beginHubSpotAuthorization, completeHubSpotCallbackUrl, getHubSpotConnectionStatus } from "./hubspot";

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

  it("does not report a HubSpot connection before the user completes OAuth consent", async () => {
    const status = await getHubSpotConnectionStatus();
    expect(status.connected).toBe(false);
  });

  it("refuses a manual callback URL from any origin other than the registered Light Labs callback", async () => {
    await expect(completeHubSpotCallbackUrl("https://example.com/integrations/hubspot/callback?code=abc&state=def")).rejects.toThrow(/registered Light Labs HubSpot callback/i);
  });
});
