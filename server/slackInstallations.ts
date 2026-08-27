import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { slackAppInstallations, slackOauthStates } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

const SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access";
const APP_BASE_URL = "https://lighttriage-gdngkmys.manus.space";
const INSTALL_SCOPES = ["mcp:connect", "users:read", "users:read.email", "files:read"];
const now = () => new Date();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function encryptionKey() {
  if (!ENV.cookieSecret) throw new Error("Server encryption key is unavailable.");
  return createHash("sha256").update(ENV.cookieSecret).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64url")).join(".");
}

function decrypt(value: string) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Stored Slack credential is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function clientId() {
  const value = process.env.SLACK_CLIENT_ID;
  if (!value) throw new Error("SLACK_CLIENT_ID is not configured.");
  return value;
}

function clientSecret() {
  const value = process.env.SLACK_CLIENT_SECRET;
  if (!value) throw new Error("SLACK_CLIENT_SECRET is not configured.");
  return value;
}

export const slackOAuthRedirectUrl = () => `${APP_BASE_URL}/integrations/slack/oauth/callback`;

export async function beginSlackInstallation(requestedByUserId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const state = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(slackOauthStates).values({
    id: `sos_${nanoid(18)}`,
    stateHash: hash(state),
    requestedByUserId,
    createdAt: now(),
    expiresAt,
    usedAt: null,
  });

  const authorizationUrl = new URL(SLACK_AUTHORIZE_URL);
  authorizationUrl.searchParams.set("client_id", clientId());
  authorizationUrl.searchParams.set("scope", INSTALL_SCOPES.join(","));
  authorizationUrl.searchParams.set("redirect_uri", slackOAuthRedirectUrl());
  authorizationUrl.searchParams.set("state", state);
  return { authorizationUrl: authorizationUrl.toString(), expiresAt };
}

type SlackTokenResponse = {
  ok?: boolean;
  error?: string;
  access_token?: string;
  scope?: string;
  app_id?: string;
  bot_user_id?: string;
  team?: { id?: string; name?: string };
  enterprise?: { id?: string; name?: string } | null;
  authed_user?: { id?: string };
};

export async function completeSlackInstallation(input: { code: string; state: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const pending = (await db.select().from(slackOauthStates).where(and(
    eq(slackOauthStates.stateHash, hash(input.state)),
    isNull(slackOauthStates.usedAt),
    gt(slackOauthStates.expiresAt, now()),
  )).limit(1))[0];
  if (!pending) throw new Error("The Slack installation state is missing, expired, or was already used.");

  const form = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    code: input.code,
    redirect_uri: slackOAuthRedirectUrl(),
  });
  const response = await fetch(SLACK_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form,
  });
  const payload = await response.json() as SlackTokenResponse;
  if (!response.ok || !payload.ok || !payload.access_token || !payload.team?.id) {
    throw new Error(payload.error || "Slack did not return an app installation token.");
  }

  const installedAt = now();
  await db.insert(slackAppInstallations).values({
    id: `sai_${nanoid(18)}`,
    slackWorkspaceId: payload.team.id,
    enterpriseId: payload.enterprise?.id ?? null,
    slackAppId: payload.app_id ?? process.env.SLACK_APP_ID ?? null,
    installerSlackUserId: payload.authed_user?.id ?? null,
    botSlackUserId: payload.bot_user_id ?? null,
    botTokenEncrypted: encrypt(payload.access_token),
    grantedScopes: (payload.scope ?? "").split(",").map(scope => scope.trim()).filter(Boolean),
    status: "active",
    installedAt,
    updatedAt: installedAt,
  }).onDuplicateKeyUpdate({ set: {
    enterpriseId: payload.enterprise?.id ?? null,
    slackAppId: payload.app_id ?? process.env.SLACK_APP_ID ?? null,
    installerSlackUserId: payload.authed_user?.id ?? null,
    botSlackUserId: payload.bot_user_id ?? null,
    botTokenEncrypted: encrypt(payload.access_token),
    grantedScopes: (payload.scope ?? "").split(",").map(scope => scope.trim()).filter(Boolean),
    status: "active",
    updatedAt: installedAt,
  } });
  await db.update(slackOauthStates).set({ usedAt: installedAt }).where(eq(slackOauthStates.id, pending.id));
  return { workspaceId: payload.team.id, enterpriseId: payload.enterprise?.id ?? null };
}

export async function getSlackInstallationForWorkspace(workspaceId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const installation = (await db.select().from(slackAppInstallations).where(and(
    eq(slackAppInstallations.slackWorkspaceId, workspaceId),
    eq(slackAppInstallations.status, "active"),
  )).orderBy(desc(slackAppInstallations.updatedAt)).limit(1))[0];
  if (!installation) throw new Error("Light Labs is not installed in this Slack workspace.");
  return { ...installation, botToken: decrypt(installation.botTokenEncrypted) };
}

export async function getSlackInstallationStatus() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    workspaceId: slackAppInstallations.slackWorkspaceId,
    enterpriseId: slackAppInstallations.enterpriseId,
    appId: slackAppInstallations.slackAppId,
    botUserId: slackAppInstallations.botSlackUserId,
    grantedScopes: slackAppInstallations.grantedScopes,
    status: slackAppInstallations.status,
    installedAt: slackAppInstallations.installedAt,
    updatedAt: slackAppInstallations.updatedAt,
  }).from(slackAppInstallations).orderBy(desc(slackAppInstallations.updatedAt));
}

type SlackFileApiResponse = {
  ok?: boolean;
  error?: string;
  file?: { id?: string; name?: string; title?: string; mimetype?: string; size?: number; team_id?: string; user_team?: string; source_team?: string; url_private_download?: string; url_private?: string; is_deleted?: boolean };
};

export async function fetchSlackFileForWorkspace(input: { workspaceId: string; slackFileId: string }) {
  const installation = await getSlackInstallationForWorkspace(input.workspaceId);
  const apiUrl = new URL("https://slack.com/api/files.info");
  apiUrl.searchParams.set("file", input.slackFileId);
  const metadataResponse = await fetch(apiUrl, { headers: { authorization: `Bearer ${installation.botToken}`, accept: "application/json" } });
  const metadata = await metadataResponse.json() as SlackFileApiResponse;
  const file = metadata.file;
  if (!metadataResponse.ok || !metadata.ok || !file?.id || file.is_deleted) throw new Error(metadata.error || "Slack file is unavailable.");
  const sourceWorkspace = file.team_id ?? file.user_team ?? file.source_team;
  if (sourceWorkspace && sourceWorkspace !== input.workspaceId) throw new Error("The requested Slack file belongs to a different workspace.");
  const size = typeof file.size === "number" ? file.size : 0;
  if (size <= 0 || size > 15 * 1024 * 1024) throw new Error("Only files from 1 byte through 15 MB can be processed by this MCP workflow.");
  const downloadUrl = file.url_private_download ?? file.url_private;
  if (!downloadUrl) throw new Error("Slack did not provide a private file download URL.");
  const download = await fetch(downloadUrl, { headers: { authorization: `Bearer ${installation.botToken}` } });
  if (!download.ok) throw new Error(`Slack file download failed (${download.status}).`);
  return {
    slackFileId: file.id,
    name: file.name ?? file.title ?? `slack-${file.id}`,
    title: file.title ?? file.name ?? `Slack file ${file.id}`,
    mimeType: file.mimetype ?? "application/octet-stream",
    bytes: Buffer.from(await download.arrayBuffer()),
  };
}
