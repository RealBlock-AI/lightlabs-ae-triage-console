import { sql } from "drizzle-orm";
import { accountMemberships, accounts, contactIdentities, contacts, hubspotContextSnapshots, teamMembers, users } from "../drizzle/schema";
import { getDb } from "./db";

const now = () => new Date();

/**
 * Reconciles the demo records that predate the canonical identity migration.
 * It is safe to run repeatedly and intentionally touches only stable demo IDs.
 */
export async function ensureCanonicalBootstrap() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const timestamp = now();

  await db.insert(users).values([
    { id: 5910003, openId: "team_usr_marcus", name: "Marcus Reid", firstName: "Marcus", lastName: "Reid", email: "marcus@lightlabs.demo", loginMethod: "google", role: "admin", identityStatus: "verified", verifiedAt: timestamp, lastSignedIn: timestamp },
    { id: 5910004, openId: "team_usr_sarah", name: "Sarah Chen", firstName: "Sarah", lastName: "Chen", email: "sarah@lightlabs.demo", loginMethod: "google", role: "admin", identityStatus: "verified", verifiedAt: timestamp, lastSignedIn: timestamp },
    { id: 6990001, openId: "slack_T091XR4PAQY_U091XR4PTT2", name: "Nic Thatcher", firstName: "Nic", lastName: "Thatcher", email: "nthatcher@launch99.agency", loginMethod: "slack", role: "user", identityStatus: "verified", verifiedAt: timestamp, slackWorkspaceId: "T091XR4PAQY", slackUserId: "U091XR4PTT2", hubspotPortalId: "demo_portal", hubspotContactId: "demo_ct_nic", testingPlatformUserId: "plat_user_launch99", lastSignedIn: timestamp },
    { id: 9001, openId: "fixture-north-ops", name: "Priya Shah", firstName: "Priya", lastName: "Shah", email: "priya@northwind.demo", loginMethod: "slack", role: "user", identityStatus: "verified", verifiedAt: timestamp, slackWorkspaceId: "T_DEMO", slackUserId: "U_NORTH_OPS", hubspotPortalId: "demo_portal", hubspotContactId: "hs_north_ops", testingPlatformUserId: "LIMS-U-9001", lastSignedIn: timestamp },
    { id: 9002, openId: "fixture-lumen-qa", name: "Jordan Lee", firstName: "Jordan", lastName: "Lee", email: "jordan@lumen.demo", loginMethod: "slack", role: "user", identityStatus: "verified", verifiedAt: timestamp, slackWorkspaceId: "T_DEMO", slackUserId: "U_LUMEN_QA", hubspotPortalId: "demo_portal", hubspotContactId: "hs_lumen_qa", testingPlatformUserId: "LIMS-U-9002", lastSignedIn: timestamp },
    { id: 9003, openId: "fixture-coman", name: "Alex Morgan", firstName: "Alex", lastName: "Morgan", email: "alex@pinecrest.demo", loginMethod: "slack", role: "user", identityStatus: "verified", verifiedAt: timestamp, slackWorkspaceId: "T_DEMO", slackUserId: "U_PINE_QC", hubspotPortalId: "demo_portal", hubspotContactId: "hs_pine_qc", testingPlatformUserId: "LIMS-U-9003", lastSignedIn: timestamp },
    { id: 9004, openId: "fixture-denied", name: "Taylor Brooks", firstName: "Taylor", lastName: "Brooks", email: "taylor@denied.demo", loginMethod: "slack", role: "user", identityStatus: "pending", verifiedAt: null, slackWorkspaceId: "T_DEMO", slackUserId: "U_DENIED", hubspotPortalId: "demo_portal", hubspotContactId: "hs_denied", testingPlatformUserId: "LIMS-U-9004", lastSignedIn: timestamp },
  ]).onDuplicateKeyUpdate({
    set: {
      name: sql`values(name)`, firstName: sql`values(first_name)`, lastName: sql`values(last_name)`, email: sql`values(email)`, loginMethod: sql`values(loginMethod)`, role: sql`values(role)`, identityStatus: sql`values(identity_status)`, verifiedAt: sql`values(verified_at)`, slackWorkspaceId: sql`values(slack_workspace_id)`, slackUserId: sql`values(slack_user_id)`, hubspotPortalId: sql`values(hubspot_portal_id)`, hubspotContactId: sql`values(hubspot_contact_id)`, testingPlatformUserId: sql`values(testing_platform_user_id)`, updatedAt: timestamp,
    },
  });

  await db.insert(teamMembers).values([
    { id: "usr_sarah", userId: 5910004, name: "Sarah Chen", email: "sarah@lightlabs.demo", role: "ae", slackUserId: "U_AE_SARAH", slackWorkspaceId: "T_DEMO" },
    { id: "usr_marcus", userId: 5910003, name: "Marcus Reid", email: "marcus@lightlabs.demo", role: "ae", slackUserId: "U_AE_MARCUS", slackWorkspaceId: "T_DEMO" },
  ]).onDuplicateKeyUpdate({ set: { userId: sql`values(user_id)`, name: sql`values(name)`, email: sql`values(email)`, role: sql`values(role)`, slackUserId: sql`values(slack_user_id)`, slackWorkspaceId: sql`values(slack_workspace_id)` } });

  await db.insert(accounts).values([
    { id: "acct_northwind", name: "Northwind Nutrition", accountType: "brand", annualSpend: 92000, slackChannel: "#lightlabs-northwind", ownerId: "usr_sarah", ownerUserId: 5910004, hubspotPortalId: "demo_portal", hubspotCompanyId: "hs_north", testingPlatformAccountId: "co_northwind" },
    { id: "acct_lumen", name: "Lumen Foods", accountType: "brand", annualSpend: 156000, slackChannel: "#lightlabs-lumen", ownerId: "usr_sarah", ownerUserId: 5910004, hubspotPortalId: "demo_portal", hubspotCompanyId: "hs_lumen", testingPlatformAccountId: "co_lumen" },
    { id: "acct_pinecrest", name: "Pinecrest Manufacturing", accountType: "coman", annualSpend: 840000, slackChannel: "#lightlabs-pinecrest", ownerId: "usr_sarah", ownerUserId: 5910004, hubspotPortalId: "demo_portal", hubspotCompanyId: "hs_pine", testingPlatformAccountId: "co_pinecrest" },
    { id: "acct_launch99", name: "Launch99 Agency", accountType: "brand", annualSpend: 0, slackChannel: null, ownerId: "owner_sarah", ownerUserId: 5910004, hubspotPortalId: "demo_portal", hubspotCompanyId: "demo_co_launch99", testingPlatformAccountId: "plat_launch99" },
  ]).onDuplicateKeyUpdate({
    set: { name: sql`values(name)`, accountType: sql`values(account_type)`, annualSpend: sql`values(annual_spend)`, ownerId: sql`values(owner_id)`, ownerUserId: sql`values(owner_user_id)`, hubspotPortalId: sql`values(hubspot_portal_id)`, hubspotCompanyId: sql`values(hubspot_company_id)`, testingPlatformAccountId: sql`values(testing_platform_account_id)` },
  });

  await db.insert(contacts).values([
    { id: "con_northwind_ops", userId: 9001, accountId: "acct_northwind", internalOwnerUserId: 5910004, name: "Priya Shah", email: "priya@northwind.demo", slackUserId: "U_NORTH_OPS", slackWorkspaceId: "T_DEMO", hubspotPortalId: "demo_portal", hubspotContactId: "hs_north_ops", identityStatus: "verified", verifiedAt: timestamp, roleTitle: "Supply Chain Lead", hasPlatformLogin: 1 },
    { id: "con_lumen_qa", userId: 9002, accountId: "acct_lumen", internalOwnerUserId: 5910004, name: "Jordan Lee", email: "jordan@lumen.demo", slackUserId: "U_LUMEN_QA", slackWorkspaceId: "T_DEMO", hubspotPortalId: "demo_portal", hubspotContactId: "hs_lumen_qa", identityStatus: "verified", verifiedAt: timestamp, roleTitle: "QA Manager", hasPlatformLogin: 1 },
    { id: "con_pine_qc", userId: 9003, accountId: "acct_pinecrest", internalOwnerUserId: 5910004, name: "Alex Morgan", email: "alex@pinecrest.demo", slackUserId: "U_PINE_QC", slackWorkspaceId: "T_DEMO", hubspotPortalId: "demo_portal", hubspotContactId: "hs_pine_qc", identityStatus: "verified", verifiedAt: timestamp, roleTitle: "QC Manager", hasPlatformLogin: 1 },
    { id: "con_launch99_nic", userId: 6990001, accountId: "acct_launch99", internalOwnerUserId: 5910004, name: "Nic Thatcher", email: "nthatcher@launch99.agency", slackUserId: "U091XR4PTT2", slackWorkspaceId: "T091XR4PAQY", hubspotPortalId: "demo_portal", hubspotContactId: "demo_ct_nic", identityStatus: "verified", verifiedAt: timestamp, roleTitle: "Founder", hasPlatformLogin: 1 },
  ]).onDuplicateKeyUpdate({
    set: { userId: sql`values(user_id)`, accountId: sql`values(account_id)`, internalOwnerUserId: sql`values(internal_owner_user_id)`, name: sql`values(name)`, email: sql`values(email)`, slackUserId: sql`values(slack_user_id)`, slackWorkspaceId: sql`values(slack_workspace_id)`, hubspotPortalId: sql`values(hubspot_portal_id)`, hubspotContactId: sql`values(hubspot_contact_id)`, identityStatus: sql`values(identity_status)`, verifiedAt: sql`values(verified_at)`, roleTitle: sql`values(role_title)`, hasPlatformLogin: sql`values(has_platform_login)` },
  });

  await db.insert(accountMemberships).values([
    { id: "am_con_northwind_ops", accountId: "acct_northwind", userId: 9001, membershipType: "buyer", status: "active", buyerUserId: 9001, internalOwnerUserId: 5910004, receiveComanCoas: 0, createdAt: timestamp, updatedAt: timestamp },
    { id: "am_con_lumen_qa", accountId: "acct_lumen", userId: 9002, membershipType: "buyer", status: "active", buyerUserId: 9002, internalOwnerUserId: 5910004, receiveComanCoas: 0, createdAt: timestamp, updatedAt: timestamp },
    { id: "am_con_pine_qc", accountId: "acct_pinecrest", userId: 9003, membershipType: "coman", status: "active", buyerUserId: null, internalOwnerUserId: 5910004, receiveComanCoas: 1, createdAt: timestamp, updatedAt: timestamp },
    { id: "am_con_launch99_nic", accountId: "acct_launch99", userId: 6990001, membershipType: "buyer", status: "active", buyerUserId: 6990001, internalOwnerUserId: 5910004, receiveComanCoas: 0, createdAt: timestamp, updatedAt: timestamp },
  ]).onDuplicateKeyUpdate({ set: { status: sql`values(status)`, buyerUserId: sql`values(buyer_user_id)`, internalOwnerUserId: sql`values(internal_owner_user_id)`, receiveComanCoas: sql`values(receive_coman_coas)`, updatedAt: timestamp } });

  const identityRows = [
    ["con_northwind_ops", 9001, "T_DEMO", "U_NORTH_OPS", "priya@northwind.demo"],
    ["con_lumen_qa", 9002, "T_DEMO", "U_LUMEN_QA", "jordan@lumen.demo"],
    ["con_pine_qc", 9003, "T_DEMO", "U_PINE_QC", "alex@pinecrest.demo"],
    ["con_launch99_nic", 6990001, "T091XR4PAQY", "U091XR4PTT2", "nthatcher@launch99.agency"],
  ] as const;
  for (const [contactId, userId, tenantId, externalId, emailNormalized] of identityRows) {
    await db.insert(contactIdentities).values({ id: `ci_bootstrap_${contactId}`, contactId, userId, provider: "slack", tenantId, externalId, emailNormalized, verificationStatus: "verified", verificationMethod: "provisioned", verifiedAt: timestamp, revokedAt: null, verifiedByUserId: null, attributes: { seededBy: "canonical-bootstrap-v1" }, createdAt: timestamp, updatedAt: timestamp }).onDuplicateKeyUpdate({ set: { contactId: sql`values(contact_id)`, userId: sql`values(user_id)`, emailNormalized: sql`values(email_normalized)`, verificationStatus: "verified", verificationMethod: "provisioned", verifiedAt: timestamp, revokedAt: null, updatedAt: timestamp } });
  }

  await db.insert(hubspotContextSnapshots).values({ id: "hctx_launch99_current", contactId: "con_launch99_nic", hubspotContactId: "demo_ct_nic", sourceObjectIds: ["demo_ct_nic", "demo_co_launch99"], context: { company: "Launch99 Agency", owner: "Sarah Chen", source: "canonical-bootstrap-v1" }, retrievedAt: timestamp, status: "available", errorCode: null }).onDuplicateKeyUpdate({ set: { contactId: "con_launch99_nic", hubspotContactId: "demo_ct_nic", sourceObjectIds: ["demo_ct_nic", "demo_co_launch99"], context: { company: "Launch99 Agency", owner: "Sarah Chen", source: "canonical-bootstrap-v1" }, retrievedAt: timestamp, status: "available", errorCode: null } });
}
