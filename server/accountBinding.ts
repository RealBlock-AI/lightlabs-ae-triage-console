import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, ne, or } from "drizzle-orm";
import { accounts, contactIdentities, contacts, demoHubspotContacts, externalSlackIdentityCandidates, slackAccountBindings, users } from "../drizzle/schema";
import { getDb } from "./db";
import { normalize } from "./demoHubspot";
import { recordIntegrationAudit } from "./integrationAudit";

const REVIEW_BASE_URL = "https://lighttriage-gdngkmys.manus.space/bindings";
const now = () => new Date();

type AccountBindingRequest = {
  schema_version: "0.1";
  binding_id: string;
  requested_at: string;
  slack: { team_id: string; user_id: string; display_name?: string };
  claimed: { full_name: string; email: string; company: string; email_source: "slack" | "typed" };
};

type BindingStatus = "pending" | "bound" | "conflict" | "rejected";

function secretMatches(provided: string | undefined) {
  const expected = process.env.LIGHTLABS_BINDING_SECRET;
  if (!expected || !provided || expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function hasValidAccountBindingCredential(req: Request) {
  const authorization = req.header("authorization");
  return secretMatches(authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined);
}

function parseBinding(input: unknown): AccountBindingRequest | undefined {
  const body = input as Record<string, unknown>;
  const slack = body?.slack as Record<string, unknown> | undefined;
  const claimed = body?.claimed as Record<string, unknown> | undefined;
  if (body?.schema_version !== "0.1" || typeof body?.binding_id !== "string" || typeof body?.requested_at !== "string" || typeof slack?.team_id !== "string" || typeof slack?.user_id !== "string" || typeof claimed?.full_name !== "string" || typeof claimed?.email !== "string" || typeof claimed?.company !== "string" || (claimed?.email_source !== "slack" && claimed?.email_source !== "typed")) return undefined;
  if (!/^bnd_[A-Za-z0-9_-]{6,120}$/.test(body.binding_id) || !/^T[A-Z0-9_-]{2,63}$/.test(slack.team_id) || !/^U[A-Z0-9_-]{2,119}$/.test(slack.user_id) || Number.isNaN(Date.parse(body.requested_at)) || !body.requested_at.endsWith("Z") || !claimed.full_name.trim() || !claimed.email.includes("@") || !claimed.company.trim()) return undefined;
  return { schema_version: "0.1", binding_id: body.binding_id, requested_at: body.requested_at, slack: { team_id: slack.team_id.trim(), user_id: slack.user_id.trim(), display_name: typeof slack.display_name === "string" ? slack.display_name.trim() || undefined : undefined }, claimed: { full_name: claimed.full_name.trim(), email: claimed.email.trim().toLowerCase(), company: claimed.company.trim(), email_source: claimed.email_source } };
}

function reviewUrl(bindingId: string) { return `${REVIEW_BASE_URL}/${encodeURIComponent(bindingId)}`; }

function bindingResponse(input: { bindingId: string; status: BindingStatus; conflict?: Record<string, unknown> | null; message?: string | null; account?: { id: string; name: string; ownerId: string } | null }) {
  return { status: input.status, binding_id: input.bindingId, conflict: input.conflict ?? null, review_url: reviewUrl(input.bindingId), message: input.message ?? null, account: input.status === "bound" && input.account ? { account_id: input.account.id, account_name: input.account.name, owner_id: input.account.ownerId } : null };
}

async function storedResponse(binding: typeof slackAccountBindings.$inferSelect) {
  const db = await getDb();
  const account = binding.accountId && db ? (await db.select().from(accounts).where(eq(accounts.id, binding.accountId)).limit(1))[0] : undefined;
  return bindingResponse({ bindingId: binding.bindingId, status: binding.status, conflict: binding.conflict, message: binding.message, account: account ? { id: account.id, name: account.name, ownerId: account.ownerId } : null });
}

async function persistBinding(input: { request: AccountBindingRequest; status: BindingStatus; contactId?: string | null; accountId?: string | null; conflict?: Record<string, unknown> | null; message?: string | null }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const timestamp = now();
  await db.insert(slackAccountBindings).values({ bindingId: input.request.binding_id, schemaVersion: input.request.schema_version, requestedAt: new Date(input.request.requested_at), slackTeamId: input.request.slack.team_id, slackUserId: input.request.slack.user_id, slackDisplayName: input.request.slack.display_name ?? null, claimedFullName: input.request.claimed.full_name, claimedEmail: input.request.claimed.email, claimedCompany: input.request.claimed.company, emailSource: input.request.claimed.email_source, status: input.status, contactId: input.contactId ?? null, accountId: input.accountId ?? null, conflict: input.conflict ?? null, reviewUrl: reviewUrl(input.request.binding_id), message: input.message ?? null, createdAt: timestamp, updatedAt: timestamp });
}

type CrmCandidate = { accountId: string | null; normalizedName: string | null; normalizedCompany: string | null };
type BindingClaim = { bindingId: string; contactId: string | null; slackTeamId: string; slackUserId: string };

/** How much a CRM record backs up an email match. Never a gate, only a score. */
export function corroborationOf(candidate: CrmCandidate, claimed: { full_name: string; company: string }) {
  return (candidate.normalizedName === normalize(claimed.full_name) ? 1 : 0) + (candidate.normalizedCompany === normalize(claimed.company) ? 1 : 0);
}

/** Pick the CRM record an email claim refers to, or decline to pick.
 *
 *  Email is the identity claim; name and company corroborate it. Bobby prefills
 *  the name from Slack's real_name, which routinely disagrees with the CRM
 *  spelling - "Nicolas Thatcher" against "Nic Thatcher" - and a disagreement
 *  there is not evidence that the email is wrong. Two records sharing an email
 *  with equal corroboration is not a match anything can choose between, so it
 *  returns no match rather than guessing a customer into the wrong account. */
export function rankCrmMatches<T extends CrmCandidate>(matches: readonly T[], claimed: { full_name: string; company: string }) {
  const ranked = matches.filter(candidate => candidate.accountId).sort((a, b) => corroborationOf(b, claimed) - corroborationOf(a, claimed));
  const ambiguous = ranked.length > 1 && corroborationOf(ranked[0], claimed) === corroborationOf(ranked[1], claimed);
  return { match: ambiguous ? undefined : ranked[0], ambiguous, corroboration: ranked[0] ? corroborationOf(ranked[0], claimed) : 0 };
}

/** Which of the still-`bound` rows a new decision has just made untrue.
 *
 *  A row matching the winner on both sides describes the same link under a
 *  different binding id - a resubmission, not a displacement. Only rows that
 *  disagree on one side have actually been displaced. */
export function displacedBy<T extends BindingClaim>(overlapping: readonly T[], winner: { contactId: string; slackTeamId: string; slackUserId: string }) {
  return overlapping.filter(row => row.contactId !== winner.contactId || row.slackTeamId !== winner.slackTeamId || row.slackUserId !== winner.slackUserId);
}

// A binding row is a claim that one Slack identity and one contact are linked.
// When a later decision re-keys either side, the older rows are claims that are
// no longer true - and the review queue renders them as live links. On 26 August
// it showed two `bound` rows for one contact; only one of them was real.
async function demoteDisplacedBindings(input: { keepBindingId: string; contactId: string; slackTeamId: string; slackUserId: string; timestamp: Date }) {
  const db = await getDb(); if (!db) return [];
  const overlapping = await db.select().from(slackAccountBindings).where(and(eq(slackAccountBindings.status, "bound"), ne(slackAccountBindings.bindingId, input.keepBindingId), or(eq(slackAccountBindings.contactId, input.contactId), and(eq(slackAccountBindings.slackTeamId, input.slackTeamId), eq(slackAccountBindings.slackUserId, input.slackUserId)))));
  const displaced = displacedBy(overlapping, input);
  for (const row of displaced) {
    await db.update(slackAccountBindings).set({ status: "conflict", conflict: { reason: "displaced_by_later_binding", replaced_by: input.keepBindingId, previous_contact_id: row.contactId, previous_slack_user_id: row.slackUserId }, message: "This link was replaced by a later account-binding decision and is no longer active.", updatedAt: input.timestamp }).where(eq(slackAccountBindings.bindingId, row.bindingId));
  }
  return displaced.map(row => row.bindingId);
}

// A stored `bound` row is only true for as long as the binding still owns the
// identity. Replaying a binding_id whose identity was later taken away used to
// echo the stored `bound`, so Bobby would tell a customer they are linked while
// get_contact_by_slack_user reported them unmapped. Re-check before echoing.
async function reconcileStoredBinding(binding: typeof slackAccountBindings.$inferSelect) {
  if (binding.status !== "bound" || !binding.contactId) return binding;
  const db = await getDb(); if (!db) return binding;
  const owned = (await db.select().from(contactIdentities).where(and(eq(contactIdentities.provider, "slack"), eq(contactIdentities.tenantId, binding.slackTeamId), eq(contactIdentities.externalId, binding.slackUserId), eq(contactIdentities.contactId, binding.contactId), eq(contactIdentities.verificationStatus, "verified"))).limit(1))[0];
  if (owned) return binding;
  const timestamp = now();
  const conflict = { reason: "binding_no_longer_owns_identity", slack_user_id: binding.slackUserId, contact_id: binding.contactId };
  const message = "This link is no longer active because the Slack identity was reassigned. Your account manager needs to review it.";
  await db.update(slackAccountBindings).set({ status: "conflict", conflict, message, updatedAt: timestamp }).where(eq(slackAccountBindings.bindingId, binding.bindingId));
  await recordIntegrationAudit({ surface: "bobby", eventType: "account_binding_stale_replay", outcome: "accepted", statusCode: 200, slackWorkspaceId: binding.slackTeamId, slackUserId: binding.slackUserId, metadata: { bindingId: binding.bindingId, previousStatus: "bound", status: "conflict" } });
  return { ...binding, status: "conflict" as const, conflict, message, updatedAt: timestamp };
}

export async function listBindingReviews(input?: { bindingId?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = input?.bindingId ? await db.select().from(slackAccountBindings).where(eq(slackAccountBindings.bindingId, input.bindingId)).limit(1) : await db.select().from(slackAccountBindings).orderBy(desc(slackAccountBindings.updatedAt)).limit(100);
  return rows.map(binding => ({ bindingId: binding.bindingId, requestedAt: binding.requestedAt, slack: { workspaceId: binding.slackTeamId, userId: binding.slackUserId, displayName: binding.slackDisplayName }, claimed: { fullName: binding.claimedFullName, email: binding.claimedEmail, company: binding.claimedCompany, emailSource: binding.emailSource }, status: binding.status, contactId: binding.contactId, accountId: binding.accountId, conflict: binding.conflict, reviewUrl: reviewUrl(binding.bindingId), message: binding.message, updatedAt: binding.updatedAt }));
}

export async function reviewBinding(input: { bindingId: string; action: "approve" | "reject" | "resolve_conflict"; reviewedByUserId: string; message?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const binding = (await db.select().from(slackAccountBindings).where(eq(slackAccountBindings.bindingId, input.bindingId)).limit(1))[0];
  if (!binding) throw new Error("Binding request not found.");
  const timestamp = now();
  const message = input.message?.trim() || (input.action === "reject" ? "The account-link request was not approved. Your account manager will follow up." : "Your Slack account is linked to your Light Labs account.");
  if (input.action === "reject") {
    await db.update(slackAccountBindings).set({ status: "rejected", conflict: null, message, updatedAt: timestamp }).where(eq(slackAccountBindings.bindingId, binding.bindingId));
    await recordIntegrationAudit({ surface: "bobby", eventType: "account_binding_reviewed", outcome: "accepted", statusCode: 200, slackWorkspaceId: binding.slackTeamId, slackUserId: binding.slackUserId, metadata: { bindingId: binding.bindingId, action: "reject", reviewedByUserId: input.reviewedByUserId } });
    return (await listBindingReviews({ bindingId: binding.bindingId }))[0];
  }
  if (!binding.contactId || !binding.accountId) throw new Error("This binding has no matched application contact and cannot be approved until an AE maps it.");
  if (binding.status === "conflict" && input.action !== "resolve_conflict") throw new Error("Use the explicit conflict-resolution action to replace an existing Slack identity.");
  const [contact, account] = await Promise.all([db.select().from(contacts).where(eq(contacts.id, binding.contactId)).limit(1).then(rows => rows[0]), db.select().from(accounts).where(eq(accounts.id, binding.accountId)).limit(1).then(rows => rows[0])]);
  if (!contact || !account) throw new Error("The matched contact or account is no longer available.");
  const [user] = contact.userId ? await db.select().from(users).where(eq(users.id, contact.userId)).limit(1) : [];
  const existingIdentity = (await db.select().from(contactIdentities).where(and(eq(contactIdentities.provider, "slack"), eq(contactIdentities.tenantId, binding.slackTeamId), eq(contactIdentities.externalId, binding.slackUserId), eq(contactIdentities.verificationStatus, "verified"))).limit(1))[0];
  if (existingIdentity && existingIdentity.contactId !== contact.id) {
    await db.update(contactIdentities).set({ verificationStatus: "revoked", revokedAt: timestamp, updatedAt: timestamp }).where(eq(contactIdentities.id, existingIdentity.id));
    await db.update(contacts).set({ identityStatus: "revoked" }).where(eq(contacts.id, existingIdentity.contactId));
  }
  await db.update(contactIdentities).set({ verificationStatus: "revoked", revokedAt: timestamp, updatedAt: timestamp }).where(and(eq(contactIdentities.contactId, contact.id), eq(contactIdentities.provider, "slack"), ne(contactIdentities.externalId, binding.slackUserId)));
  await db.update(contacts).set({ slackWorkspaceId: binding.slackTeamId, slackUserId: binding.slackUserId, identityStatus: "verified", verifiedAt: timestamp }).where(eq(contacts.id, contact.id));
  if (user) await db.update(users).set({ openId: user.loginMethod === "slack" && user.openId?.startsWith("slack_") ? `slack_${binding.slackTeamId}_${binding.slackUserId}`.slice(0, 64) : user.openId, slackWorkspaceId: binding.slackTeamId, slackUserId: binding.slackUserId, identityStatus: "verified", verifiedAt: timestamp, updatedAt: timestamp }).where(eq(users.id, user.id));
  const demoContact = (await db.select().from(demoHubspotContacts).where(and(eq(demoHubspotContacts.accountId, account.id), eq(demoHubspotContacts.normalizedEmail, normalize(binding.claimedEmail)))).limit(1))[0];
  if (demoContact) await db.update(demoHubspotContacts).set({ slackTeamId: binding.slackTeamId, slackId: binding.slackUserId, verificationStatus: "verified", verifiedAt: timestamp, properties: { ...(demoContact.properties ?? {}), slack_id: binding.slackUserId }, updatedAt: timestamp }).where(eq(demoHubspotContacts.id, demoContact.id));
  await db.insert(contactIdentities).values({ id: `ci_review_${binding.bindingId}`, contactId: contact.id, userId: contact.userId, provider: "slack", tenantId: binding.slackTeamId, externalId: binding.slackUserId, emailNormalized: binding.claimedEmail, verificationStatus: "verified", verificationMethod: "customer_claimed", verifiedAt: timestamp, revokedAt: null, verifiedByUserId: input.reviewedByUserId, attributes: { bindingId: binding.bindingId, emailSource: binding.emailSource, reviewAction: input.action }, createdAt: timestamp, updatedAt: timestamp }).onDuplicateKeyUpdate({ set: { contactId: contact.id, userId: contact.userId, emailNormalized: binding.claimedEmail, verificationStatus: "verified", verificationMethod: "customer_claimed", verifiedAt: timestamp, revokedAt: null, verifiedByUserId: input.reviewedByUserId, attributes: { bindingId: binding.bindingId, emailSource: binding.emailSource, reviewAction: input.action }, updatedAt: timestamp } });
  await db.update(externalSlackIdentityCandidates).set({ status: "mapped", resolvedContactId: contact.id, resolvedAt: timestamp, resolvedByUserId: input.reviewedByUserId, lastSeenAt: timestamp }).where(and(eq(externalSlackIdentityCandidates.slackWorkspaceId, binding.slackTeamId), eq(externalSlackIdentityCandidates.slackUserId, binding.slackUserId)));
  await db.update(slackAccountBindings).set({ status: "bound", conflict: null, message, contactId: contact.id, accountId: account.id, updatedAt: timestamp }).where(eq(slackAccountBindings.bindingId, binding.bindingId));
  const displaced = await demoteDisplacedBindings({ keepBindingId: binding.bindingId, contactId: contact.id, slackTeamId: binding.slackTeamId, slackUserId: binding.slackUserId, timestamp });
  await recordIntegrationAudit({ surface: "bobby", eventType: "account_binding_reviewed", outcome: "accepted", statusCode: 200, slackWorkspaceId: binding.slackTeamId, slackUserId: binding.slackUserId, metadata: { bindingId: binding.bindingId, action: input.action, reviewedByUserId: input.reviewedByUserId, contactId: contact.id, accountId: account.id, displacedBindingIds: displaced } });
  return (await listBindingReviews({ bindingId: binding.bindingId }))[0];
}

export function bobbyAccountBindingHealth(req: Request, res: Response) {
  if (!hasValidAccountBindingCredential(req)) { res.setHeader("WWW-Authenticate", 'Bearer realm="light-labs-account-binding"'); return res.status(401).json({ ok: false, error: "Unauthorized account-binding credential." }); }
  return res.json({ ok: true, service: "light-labs-account-binding" });
}

export async function bobbyAccountBinding(req: Request, res: Response) {
  if (!hasValidAccountBindingCredential(req)) { res.setHeader("WWW-Authenticate", 'Bearer realm="light-labs-account-binding"'); await recordIntegrationAudit({ surface: "bobby", eventType: "account_binding_credential_rejected", outcome: "rejected", statusCode: 401, metadata: {} }); return res.status(401).json({ status: "rejected", binding_id: null, conflict: null, review_url: null, message: "Unauthorized account-binding credential." }); }
  const request = parseBinding(req.body);
  if (!request) return res.status(400).json({ status: "rejected", binding_id: null, conflict: null, review_url: null, message: "Invalid account-binding request. Use schema version 0.1 with a stable bnd_ binding_id and valid Slack identifiers." });
  const db = await getDb(); if (!db) return res.status(500).json(bindingResponse({ bindingId: request.binding_id, status: "rejected", message: "The account-binding service is unavailable." }));
  const existing = (await db.select().from(slackAccountBindings).where(eq(slackAccountBindings.bindingId, request.binding_id)).limit(1))[0];
  if (existing) return res.json(await storedResponse(await reconcileStoredBinding(existing)));

  // Email is the identity claim. Name and company corroborate it; they do not
  // gate it. Bobby prefills the name from Slack's real_name, which routinely
  // disagrees with the CRM spelling - a real submission failed on "Nicolas
  // Thatcher" against "Nic Thatcher" while the email matched exactly - and that
  // disagreement is not evidence the email is wrong.
  const demoMatches = await db.select().from(demoHubspotContacts).where(eq(demoHubspotContacts.normalizedEmail, normalize(request.claimed.email)));
  const { match: demoContact, ambiguous, corroboration } = rankCrmMatches(demoMatches, request.claimed);
  if (!demoContact?.accountId) {
    const unmatched = ambiguous ? "More than one customer record shares that email address, so your account manager needs to confirm which account to link." : "The request was recorded for AE review; an exact customer record was not yet available.";
    await persistBinding({ request, status: "pending", message: unmatched });
    await recordIntegrationAudit({ surface: "bobby", eventType: "account_binding", outcome: "accepted", statusCode: 200, slackWorkspaceId: request.slack.team_id, slackUserId: request.slack.user_id, metadata: { bindingId: request.binding_id, status: "pending", emailMatches: demoMatches.length, ambiguous } });
    return res.json(bindingResponse({ bindingId: request.binding_id, status: "pending", message: unmatched }));
  }

  const [contact] = await db.select().from(contacts).where(and(eq(contacts.accountId, demoContact.accountId), eq(contacts.email, request.claimed.email))).limit(1);
  const [account] = await db.select().from(accounts).where(eq(accounts.id, demoContact.accountId)).limit(1);
  if (!contact || !account) {
    await persistBinding({ request, status: "pending", message: "The CRM match was found but is awaiting application-account review." });
    await recordIntegrationAudit({ surface: "bobby", eventType: "account_binding", outcome: "accepted", statusCode: 200, slackWorkspaceId: request.slack.team_id, slackUserId: request.slack.user_id, metadata: { bindingId: request.binding_id, status: "pending" } });
    return res.json(bindingResponse({ bindingId: request.binding_id, status: "pending", message: "The CRM match was found but is awaiting application-account review." }));
  }

  const [reverseContact] = await db.select().from(contacts).where(and(eq(contacts.slackWorkspaceId, request.slack.team_id), eq(contacts.slackUserId, request.slack.user_id), ne(contacts.id, contact.id))).limit(1);
  const [contactSlackIdentity] = await db.select().from(contactIdentities).where(and(eq(contactIdentities.contactId, contact.id), eq(contactIdentities.provider, "slack"), eq(contactIdentities.verificationStatus, "verified"))).limit(1);
  const conflict = reverseContact ? { reason: "slack_id_already_mapped", existing_slack_user_id: request.slack.user_id, contact_id: reverseContact.id } : contactSlackIdentity && (contactSlackIdentity.tenantId !== request.slack.team_id || contactSlackIdentity.externalId !== request.slack.user_id) ? { reason: "contact_already_bound_to_different_slack_id", existing_slack_user_id: contactSlackIdentity.externalId, contact_id: contact.id } : null;
  if (conflict) {
    await persistBinding({ request, status: "conflict", contactId: contact.id, accountId: account.id, conflict, message: "Another Slack account is already linked to that Light Labs account, so your account manager needs to review it." });
    await recordIntegrationAudit({ surface: "bobby", eventType: "account_binding", outcome: "accepted", statusCode: 200, slackWorkspaceId: request.slack.team_id, slackUserId: request.slack.user_id, metadata: { bindingId: request.binding_id, status: "conflict", contactId: contact.id } });
    return res.json(bindingResponse({ bindingId: request.binding_id, status: "conflict", conflict, message: "Another Slack account is already linked to that Light Labs account, so your account manager needs to review it." }));
  }

  if (request.claimed.email_source !== "slack") {
    await persistBinding({ request, status: "pending", contactId: contact.id, accountId: account.id, message: "The request is awaiting AE confirmation because the email was typed rather than verified by Slack." });
    return res.json(bindingResponse({ bindingId: request.binding_id, status: "pending", message: "The request is awaiting AE confirmation because the email was typed rather than verified by Slack." }));
  }

  const timestamp = now();
  const [user] = contact.userId ? await db.select().from(users).where(eq(users.id, contact.userId)).limit(1) : [];
  await db.update(demoHubspotContacts).set({ slackTeamId: request.slack.team_id, slackId: request.slack.user_id, verificationStatus: "verified", verifiedAt: timestamp, properties: { ...(demoContact.properties ?? {}), slack_id: request.slack.user_id }, updatedAt: timestamp }).where(eq(demoHubspotContacts.id, demoContact.id));
  await db.update(contacts).set({ slackWorkspaceId: request.slack.team_id, slackUserId: request.slack.user_id, identityStatus: "verified", verifiedAt: timestamp }).where(eq(contacts.id, contact.id));
  if (user) await db.update(users).set({ openId: user.loginMethod === "slack" && user.openId?.startsWith("slack_") ? `slack_${request.slack.team_id}_${request.slack.user_id}`.slice(0, 64) : user.openId, slackWorkspaceId: request.slack.team_id, slackUserId: request.slack.user_id, identityStatus: "verified", verifiedAt: timestamp, updatedAt: timestamp }).where(eq(users.id, user.id));
  await db.update(contactIdentities).set({ verificationStatus: "revoked", revokedAt: timestamp, updatedAt: timestamp }).where(and(eq(contactIdentities.contactId, contact.id), eq(contactIdentities.provider, "slack"), ne(contactIdentities.externalId, request.slack.user_id)));
  await db.insert(contactIdentities).values({ id: `ci_binding_${request.binding_id}`, contactId: contact.id, userId: contact.userId, provider: "slack", tenantId: request.slack.team_id, externalId: request.slack.user_id, emailNormalized: request.claimed.email, verificationStatus: "verified", verificationMethod: "customer_claimed", verifiedAt: timestamp, revokedAt: null, verifiedByUserId: "bobby", attributes: { bindingId: request.binding_id, emailSource: request.claimed.email_source }, createdAt: timestamp, updatedAt: timestamp }).onDuplicateKeyUpdate({ set: { contactId: contact.id, userId: contact.userId, emailNormalized: request.claimed.email, verificationStatus: "verified", verificationMethod: "customer_claimed", verifiedAt: timestamp, revokedAt: null, verifiedByUserId: "bobby", attributes: { bindingId: request.binding_id, emailSource: request.claimed.email_source }, updatedAt: timestamp } });
  await db.update(externalSlackIdentityCandidates).set({ status: "mapped", resolvedContactId: contact.id, resolvedAt: timestamp, resolvedByUserId: "bobby", lastSeenAt: timestamp }).where(and(eq(externalSlackIdentityCandidates.slackWorkspaceId, request.slack.team_id), eq(externalSlackIdentityCandidates.slackUserId, request.slack.user_id)));
  await persistBinding({ request, status: "bound", contactId: contact.id, accountId: account.id, message: "Your Slack account is linked to your Light Labs account." });
  const displaced = await demoteDisplacedBindings({ keepBindingId: request.binding_id, contactId: contact.id, slackTeamId: request.slack.team_id, slackUserId: request.slack.user_id, timestamp });
  await recordIntegrationAudit({ surface: "bobby", eventType: "account_binding", outcome: "accepted", statusCode: 200, slackWorkspaceId: request.slack.team_id, slackUserId: request.slack.user_id, metadata: { bindingId: request.binding_id, status: "bound", contactId: contact.id, accountId: account.id, corroboration, displacedBindingIds: displaced } });
  return res.json(bindingResponse({ bindingId: request.binding_id, status: "bound", message: "Your Slack account is linked to your Light Labs account.", account: { id: account.id, name: account.name, ownerId: account.ownerId } }));
}
