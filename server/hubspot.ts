import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "./db";
import { hubspotConnections, hubspotOauthSessions } from "../drizzle/schema";
import { ENV } from "./_core/env";

const REDIRECT_URI = "https://lighttriage-gdngkmys.manus.space/integrations/hubspot/callback";
const AUTHORIZATION_ENDPOINT = "https://mcp.hubspot.com/oauth/authorize/user";
const TOKEN_ENDPOINT = "https://mcp.hubspot.com/oauth/v3/token";
const now = () => new Date();
const clientId = () => process.env.HUBSPOT_MCP_CLIENT_ID || "";
const clientSecret = () => process.env.HUBSPOT_MCP_CLIENT_SECRET || "";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const encryptionKey = () => {
  if (!ENV.cookieSecret) throw new Error("Server encryption key is unavailable.");
  return createHash("sha256").update(ENV.cookieSecret).digest();
};
const encrypt = (value: string) => {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv); const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]); const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString("base64url")).join(".");
};
const decrypt = (value: string) => {
  const [ivValue, tagValue, encryptedValue] = value.split("."); if (!ivValue || !tagValue || !encryptedValue) throw new Error("Stored HubSpot credential is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url")); decipher.setAuthTag(Buffer.from(tagValue, "base64url")); return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
};

export async function beginHubSpotAuthorization(requestedByUserId: string) {
  if (!clientId() || !clientSecret()) throw new Error("HubSpot MCP Auth App credentials are not configured.");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const state = randomBytes(32).toString("base64url"); const verifier = randomBytes(48).toString("base64url"); const challenge = createHash("sha256").update(verifier).digest("base64url"); const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(hubspotOauthSessions).values({ id: `hso_${nanoid(18)}`, stateHash: hash(state), codeVerifierEncrypted: encrypt(verifier), requestedByUserId, createdAt: now(), expiresAt, usedAt: null });
  const authorizationUrl = new URL(AUTHORIZATION_ENDPOINT); authorizationUrl.searchParams.set("response_type", "code"); authorizationUrl.searchParams.set("client_id", clientId()); authorizationUrl.searchParams.set("redirect_uri", REDIRECT_URI); authorizationUrl.searchParams.set("state", state); authorizationUrl.searchParams.set("code_challenge", challenge); authorizationUrl.searchParams.set("code_challenge_method", "S256");
  return { authorizationUrl: authorizationUrl.toString(), expiresAt };
}

export async function completeHubSpotAuthorization(input: { code: string; state: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const session = (await db.select().from(hubspotOauthSessions).where(and(eq(hubspotOauthSessions.stateHash, hash(input.state)), isNull(hubspotOauthSessions.usedAt), gt(hubspotOauthSessions.expiresAt, now()))).limit(1))[0];
  if (!session) throw new Error("The HubSpot authorization session is missing, expired, or was already used.");
  const form = new URLSearchParams({ grant_type: "authorization_code", client_id: clientId(), client_secret: clientSecret(), redirect_uri: REDIRECT_URI, code: input.code, code_verifier: decrypt(session.codeVerifierEncrypted) });
  const response = await fetch(TOKEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: form });
  const payload = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!response.ok || !payload.access_token || !payload.refresh_token) throw new Error(payload.error_description || payload.error || "HubSpot did not return OAuth tokens.");
  const expiresAt = payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : null;
  await db.insert(hubspotConnections).values({ id: `hsc_${nanoid(18)}`, connectedByUserId: session.requestedByUserId, portalId: null, accessTokenEncrypted: encrypt(payload.access_token), refreshTokenEncrypted: encrypt(payload.refresh_token), accessTokenExpiresAt: expiresAt, status: "active", connectedAt: now(), updatedAt: now() });
  await db.update(hubspotOauthSessions).set({ usedAt: now() }).where(eq(hubspotOauthSessions.id, session.id));
  return { success: true };
}

export async function completeHubSpotCallbackUrl(callbackUrl: string) {
  const callback = new URL(callbackUrl);
  const expected = new URL(REDIRECT_URI);
  if (callback.origin !== expected.origin || callback.pathname !== expected.pathname) throw new Error("The pasted URL is not the registered Light Labs HubSpot callback URL.");
  const code = callback.searchParams.get("code"); const state = callback.searchParams.get("state");
  if (!code || !state) throw new Error("The pasted callback URL does not contain a HubSpot authorization code and state.");
  return completeHubSpotAuthorization({ code, state });
}

export async function getHubSpotConnectionStatus() {
  const db = await getDb(); if (!db) return { connected: false as const, updatedAt: null };
  const connection = (await db.select({ id: hubspotConnections.id, status: hubspotConnections.status, updatedAt: hubspotConnections.updatedAt, portalId: hubspotConnections.portalId }).from(hubspotConnections).orderBy(desc(hubspotConnections.updatedAt)).limit(1))[0];
  return connection ? { connected: connection.status === "active", updatedAt: connection.updatedAt, portalId: connection.portalId } : { connected: false as const, updatedAt: null, portalId: null };
}
