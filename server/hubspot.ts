import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "./db";
import { accounts, contacts, hubspotConnections, hubspotContextSnapshots, hubspotOauthSessions } from "../drizzle/schema";
import { ENV } from "./_core/env";

const REDIRECT_URI = "https://lighttriage-gdngkmys.manus.space/integrations/hubspot/callback";
const AUTHORIZATION_ENDPOINT = "https://mcp.hubspot.com/oauth/authorize/user";
const TOKEN_ENDPOINT = "https://mcp.hubspot.com/oauth/v3/token";
const MCP_ENDPOINT = "https://mcp.hubspot.com/";
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

type ConnectionRecord = typeof hubspotConnections.$inferSelect;
type JsonRpcResponse = { result?: unknown; error?: { message?: string } };

function parseMcpResponse(raw: string): JsonRpcResponse {
  const json = raw.trim().startsWith("data:") ? raw.trim().split("\n").filter(line => line.startsWith("data:")).at(-1)?.slice(5).trim() : raw;
  if (!json) throw new Error("HubSpot MCP returned an empty response.");
  return JSON.parse(json) as JsonRpcResponse;
}

async function updateConnectionTokens(connection: ConnectionRecord) {
  const tokenExpiresSoon = !connection.accessTokenExpiresAt || connection.accessTokenExpiresAt.getTime() < Date.now() + 60_000;
  if (!tokenExpiresSoon) return { accessToken: decrypt(connection.accessTokenEncrypted), connection };
  const form = new URLSearchParams({ grant_type: "refresh_token", client_id: clientId(), client_secret: clientSecret(), refresh_token: decrypt(connection.refreshTokenEncrypted) });
  const response = await fetch(TOKEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: form });
  const payload = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || "Unable to refresh HubSpot MCP access token.");
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const refreshed = { accessTokenEncrypted: encrypt(payload.access_token), refreshTokenEncrypted: encrypt(payload.refresh_token ?? decrypt(connection.refreshTokenEncrypted)), accessTokenExpiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : null, status: "active" as const, updatedAt: now() };
  await db.update(hubspotConnections).set(refreshed).where(eq(hubspotConnections.id, connection.id));
  return { accessToken: payload.access_token, connection: { ...connection, ...refreshed } };
}

async function getActiveConnection() {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const connection = (await db.select().from(hubspotConnections).where(eq(hubspotConnections.status, "active")).orderBy(desc(hubspotConnections.updatedAt)).limit(1))[0];
  if (!connection) throw new Error("HubSpot MCP is not connected.");
  return updateConnectionTokens(connection);
}

async function mcpRequest(accessToken: string, message: Record<string, unknown>, sessionId?: string) {
  const response = await fetch(MCP_ENDPOINT, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", accept: "application/json, text/event-stream", ...(sessionId ? { "mcp-session-id": sessionId } : {}) }, body: JSON.stringify(message) });
  const raw = await response.text();
  if (!response.ok) throw new Error(`HubSpot MCP request failed (${response.status}): ${raw.slice(0, 300)}`);
  const payload = parseMcpResponse(raw);
  if (payload.error) throw new Error(payload.error.message || "HubSpot MCP returned an error.");
  return { result: payload.result, sessionId: response.headers.get("mcp-session-id") ?? sessionId };
}

async function openHubSpotMcpSession() {
  const { accessToken, connection } = await getActiveConnection();
  const initialized = await mcpRequest(accessToken, { jsonrpc: "2.0", id: "initialize", method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "lightlabs-ae-triage", version: "1.0.0" } } });
  if (!initialized.sessionId) throw new Error("HubSpot MCP did not establish a Streamable HTTP session.");
  await fetch(MCP_ENDPOINT, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", "mcp-session-id": initialized.sessionId }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) });
  return { accessToken, connection, sessionId: initialized.sessionId };
}

export async function listHubSpotMcpTools() {
  const session = await openHubSpotMcpSession();
  const tools = await mcpRequest(session.accessToken, { jsonrpc: "2.0", id: "tools-list", method: "tools/list", params: {} }, session.sessionId);
  const entries = (tools.result as { tools?: Array<{ name?: string; description?: string; inputSchema?: unknown }> } | undefined)?.tools ?? [];
  return entries.map(tool => ({ name: tool.name ?? "", description: tool.description ?? "", inputSchema: tool.inputSchema ?? {} }));
}

async function callHubSpotReadTool(name: "get_crm_objects" | "search_crm_objects" | "search_conversations", args: Record<string, unknown>) {
  const session = await openHubSpotMcpSession();
  return mcpRequest(session.accessToken, { jsonrpc: "2.0", id: `tool-${name}`, method: "tools/call", params: { name, arguments: args } }, session.sessionId);
}

function extractMcpObject(result: unknown) {
  const content = (result as { content?: Array<{ type?: string; text?: string }> } | undefined)?.content ?? [];
  const text = content.filter(item => item.type === "text" && item.text).map(item => item.text).join("\n");
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return { summary: text.slice(0, 12_000) }; }
}

function collectRecords(value: unknown, records: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) { value.forEach(item => collectRecords(item, records)); return records; }
  if (!value || typeof value !== "object") return records;
  const record = value as Record<string, unknown>;
  if (record.id || record.properties) records.push(record);
  Object.values(record).forEach(item => collectRecords(item, records));
  return records;
}

function findText(value: unknown, field: string): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) { for (const item of value) { const found = findText(item, field); if (found) return found; } return null; }
  const record = value as Record<string, unknown>;
  if (typeof record[field] === "string") return record[field] as string;
  for (const item of Object.values(record)) { const found = findText(item, field); if (found) return found; }
  return null;
}

export async function listContactMappings() {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = await db.select({ contact: contacts, account: accounts }).from(contacts).leftJoin(accounts, eq(contacts.accountId, accounts.id)).orderBy(contacts.name);
  return rows.map(({ contact, account }) => ({ id: contact.id, name: contact.name, email: contact.email, accountName: account?.name ?? "Unassigned", slackUserId: contact.slackUserId, slackWorkspaceId: contact.slackWorkspaceId, hubspotContactId: contact.hubspotContactId, identityStatus: contact.identityStatus, verifiedAt: contact.verifiedAt }));
}

export async function listAccountsForContactMapping() {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  return db.select({ id: accounts.id, name: accounts.name }).from(accounts).orderBy(accounts.name);
}

export async function addPendingContactMapping(input: { accountId: string; name: string; email: string; slackWorkspaceId: string; slackUserId: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const email = input.email.trim().toLowerCase(); const name = input.name.trim(); const slackWorkspaceId = input.slackWorkspaceId.trim(); const slackUserId = input.slackUserId.trim();
  if (!name || !email.includes("@") || !slackWorkspaceId || !slackUserId) throw new Error("Name, verified email, Slack workspace ID, and Slack user ID are required.");
  const account = (await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, input.accountId)).limit(1))[0]; if (!account) throw new Error("Choose a valid Light Labs account.");
  const existing = (await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.slackWorkspaceId, slackWorkspaceId), eq(contacts.slackUserId, slackUserId))).limit(1))[0]; if (existing) throw new Error("This Slack workspace and user are already mapped to a Light Labs contact.");
  const id = `con_${nanoid(16)}`;
  await db.insert(contacts).values({ id, accountId: input.accountId, name, email, slackUserId, slackWorkspaceId, hubspotPortalId: null, hubspotContactId: null, identityStatus: "pending", verifiedAt: null, roleTitle: null, hasPlatformLogin: 0 });
  return { id, identityStatus: "pending" as const };
}

export async function searchHubSpotContactsByEmail(email: string) {
  const normalized = email.trim().toLowerCase(); if (!normalized.includes("@")) throw new Error("A verified customer email address is required.");
  const result = await callHubSpotReadTool("search_crm_objects", { objectType: "contacts", query: normalized, properties: ["firstname", "lastname", "email", "company"], limit: 5 });
  const records = collectRecords(extractMcpObject(result.result)); const unique = new Map<string, { id: string; name: string; email: string | null; company: string | null }>();
  for (const record of records) {
    const properties = (record.properties ?? {}) as Record<string, unknown>; const id = String(record.id ?? properties.hs_object_id ?? ""); const candidateEmail = typeof properties.email === "string" ? properties.email : findText(record, "email");
    if (!id || !candidateEmail || candidateEmail.toLowerCase() !== normalized) continue;
    const first = typeof properties.firstname === "string" ? properties.firstname : findText(record, "firstname") ?? ""; const last = typeof properties.lastname === "string" ? properties.lastname : findText(record, "lastname") ?? ""; const company = typeof properties.company === "string" ? properties.company : findText(record, "company");
    unique.set(id, { id, name: `${first} ${last}`.trim() || candidateEmail, email: candidateEmail, company });
  }
  return Array.from(unique.values());
}

export async function verifyAndMapContact(input: { contactId: string; hubspotContactId: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const contact = (await db.select().from(contacts).where(eq(contacts.id, input.contactId)).limit(1))[0];
  if (!contact?.email) throw new Error("This Light Labs contact must have a verified email before it can be mapped.");
  const candidates = await searchHubSpotContactsByEmail(contact.email); const candidate = candidates.find(item => item.id === input.hubspotContactId);
  if (!candidate) throw new Error("The selected HubSpot contact does not exactly match the Light Labs contact email.");
  const connection = await getHubSpotConnectionStatus();
  await db.update(contacts).set({ hubspotContactId: candidate.id, hubspotPortalId: connection.portalId ?? "connected_mcp", identityStatus: "verified", verifiedAt: now() }).where(eq(contacts.id, contact.id));
  return { id: contact.id, hubspotContactId: candidate.id, email: candidate.email, verified: true as const };
}

export async function refreshHubSpotContactContext(input: { contactId: string; hubspotContactId: string }) {
  if (!/^\d+$/.test(input.hubspotContactId)) throw new Error("HubSpot enrichment requires a verified numeric HubSpot contact ID.");
  const contact = await callHubSpotReadTool("get_crm_objects", { objectType: "contacts", objectIds: [Number(input.hubspotContactId)], properties: ["firstname", "lastname", "email", "company", "hubspot_owner_id", "lifecyclestage"] });
  const associationFilter = [{ associationFilters: [{ objectType: "contacts", operator: "EQUAL", objectIdValues: [Number(input.hubspotContactId)] }] }];
  let company: { result: unknown } | null = null;
  let tickets: { result: unknown } | null = null;
  let conversations: { result: unknown } | null = null;
  try { company = await callHubSpotReadTool("search_crm_objects", { objectType: "companies", properties: ["name", "domain", "hubspot_owner_id"], limit: 1, filterGroups: associationFilter }); } catch { company = null; }
  try { tickets = await callHubSpotReadTool("search_crm_objects", { objectType: "tickets", properties: ["subject", "hs_pipeline_stage", "hubspot_owner_id", "createdate"], limit: 3, sorts: ["-createdate"], filterGroups: associationFilter }); } catch { tickets = null; }
  try { conversations = await callHubSpotReadTool("search_conversations", { objectType: "contacts", objectId: Number(input.hubspotContactId), maxConversations: 3, messageLimit: 0, includeMessages: false }); } catch { conversations = null; }
  const normalized = { contact: extractMcpObject(contact.result), company: company ? extractMcpObject(company.result) : { available: false }, recentTickets: tickets ? extractMcpObject(tickets.result) : { available: false }, recentConversations: conversations ? extractMcpObject(conversations.result) : { available: false } };
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const retrievedAt = now();
  await db.insert(hubspotContextSnapshots).values({ id: `hctx_${nanoid(18)}`, contactId: input.contactId, hubspotContactId: input.hubspotContactId, sourceObjectIds: [input.hubspotContactId], context: normalized, retrievedAt, status: "available", errorCode: null });
  return { available: true as const, retrievedAt };
}

export async function verifyHubSpotMcpConnection() {
  const session = await openHubSpotMcpSession();
  const details = await mcpRequest(session.accessToken, { jsonrpc: "2.0", id: "user-details", method: "tools/call", params: { name: "get_user_details", arguments: {} } }, session.sessionId);
  const serialized = JSON.stringify(details.result);
  const portalId = serialized.match(/"portalId"\s*:\s*"?([^",}]+)/i)?.[1] ?? serialized.match(/"portal_id"\s*:\s*"?([^",}]+)/i)?.[1] ?? null;
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.update(hubspotConnections).set({ portalId, status: "active", updatedAt: now() }).where(eq(hubspotConnections.id, session.connection.id));
  return { connected: true as const, portalId, response: details.result };
}
