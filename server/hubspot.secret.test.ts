import { describe, expect, it } from "vitest";

describe("configured HubSpot MCP Auth App credentials", () => {
  it("is accepted by HubSpot before the user-authorized OAuth code exchange", async () => {
    const clientId = process.env.HUBSPOT_MCP_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_MCP_CLIENT_SECRET;
    expect(clientId).toBeTruthy();
    expect(clientSecret).toBeTruthy();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: "https://lighttriage-gdngkmys.manus.space/integrations/hubspot/callback",
      code: "lightlabs-intentionally-invalid-validation-code",
      code_verifier: "a".repeat(64),
    });
    const response = await fetch("https://api.hubapi.com/oauth/v1/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    const payload = await response.json() as { error?: string };
    expect(payload.error).not.toBe("invalid_client");
    expect(["invalid_request", "invalid_grant"]).toContain(payload.error);
  });
});
