import { asc, sql } from "drizzle-orm";
import { demoSupportFieldDefinitions, demoTestingPlatformFieldDefinitions } from "../drizzle/schema";
import { getDb } from "./db";

type ReferenceField = { objectType: string; fieldKey: string; label: string; definition: string; dataType: "text" | "number" | "date" | "url" | "boolean" | "json"; searchable: number; writable: number; sortOrder: number };

export const TESTING_PLATFORM_FIELDS: ReferenceField[] = [
  { objectType: "accounts", fieldKey: "testing_platform_account_id", label: "Testing Platform Account ID", definition: "Stable operational identifier for the customer organization in the Testing Platform. Use it to scope account-level orders, tests, reports, and permissions.", dataType: "text", searchable: 1, writable: 0, sortOrder: 1 },
  { objectType: "orders", fieldKey: "order_id", label: "Order ID", definition: "Unique Testing Platform order identifier. Query when a support message concerns sample receipt, processing, shipment, or order status.", dataType: "text", searchable: 1, writable: 0, sortOrder: 2 },
  { objectType: "tests", fieldKey: "test_status", label: "Test status", definition: "Current workflow state for a test. This is read-only operational context and should not be altered by a support workflow.", dataType: "text", searchable: 1, writable: 0, sortOrder: 3 },
  { objectType: "tests", fieldKey: "spec_status", label: "Specification status", definition: "Authoritative in-spec, out-of-spec, or no-spec determination produced by the Testing Platform. It can inform a response but is never rewritten by the support agent.", dataType: "text", searchable: 1, writable: 0, sortOrder: 4 },
  { objectType: "reports", fieldKey: "report_state", label: "Report state", definition: "Publication and delivery state of the generated report. Query this before describing report availability to a customer.", dataType: "text", searchable: 1, writable: 0, sortOrder: 5 },
  { objectType: "results", fieldKey: "result_value", label: "Result value", definition: "Reported test measurement from the Testing Platform. This value is sensitive and only usable after account, contact, and release permissions are satisfied.", dataType: "number", searchable: 0, writable: 0, sortOrder: 6 },
];

export const SUPPORT_FIELDS: ReferenceField[] = [
  { objectType: "interactions", fieldKey: "interaction_id", label: "Support interaction ID", definition: "Internal identifier for a unified support record. Use this to retrieve the originating message, evidence, workflow state, and feedback history.", dataType: "text", searchable: 1, writable: 0, sortOrder: 1 },
  { objectType: "interactions", fieldKey: "source", label: "Support source", definition: "Channel that created the support interaction. Slack is the active prototype input channel; email is retained as cross-channel context.", dataType: "text", searchable: 1, writable: 0, sortOrder: 2 },
  { objectType: "interactions", fieldKey: "account_id", label: "Mapped account ID", definition: "Application account selected after identity resolution. It is the boundary for all customer context joined into a support workflow.", dataType: "text", searchable: 1, writable: 0, sortOrder: 3 },
  { objectType: "interactions", fieldKey: "lane", label: "Resolution lane", definition: "Automation routing decision: auto, assisted, or escalate. The system can only demote a case into a more cautious lane.", dataType: "text", searchable: 1, writable: 1, sortOrder: 4 },
  { objectType: "interactions", fieldKey: "status", label: "Support status", definition: "Operational lifecycle state such as open, awaiting customer, auto resolved, or resolved. A human or approved workflow may update this value.", dataType: "text", searchable: 1, writable: 1, sortOrder: 5 },
  { objectType: "response_feedback", fieldKey: "edit_ratio", label: "Review edit ratio", definition: "Relative amount of human editing applied to a draft response. It is a feedback-loop signal for policy review and not an automatic promotion mechanism.", dataType: "number", searchable: 0, writable: 0, sortOrder: 6 },
];

export async function seedReferenceCatalogs() {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const platformRows = TESTING_PLATFORM_FIELDS.map(field => ({ id: `dtpf_${field.objectType}_${field.fieldKey}`, sourceSystem: "platform" as const, ...field, displayedByDefault: 1 }));
  const supportRows = SUPPORT_FIELDS.map(field => ({ id: `dsf_${field.objectType}_${field.fieldKey}`, sourceSystem: "support" as const, ...field, displayedByDefault: 1 }));
  await db.insert(demoTestingPlatformFieldDefinitions).values(platformRows).onDuplicateKeyUpdate({ set: { label: sql`values(label)`, definition: sql`values(definition)`, dataType: sql`values(data_type)`, searchable: sql`values(searchable)`, writable: sql`values(writable)`, displayedByDefault: 1, sortOrder: sql`values(sort_order)` } });
  await db.insert(demoSupportFieldDefinitions).values(supportRows).onDuplicateKeyUpdate({ set: { label: sql`values(label)`, definition: sql`values(definition)`, dataType: sql`values(data_type)`, searchable: sql`values(searchable)`, writable: sql`values(writable)`, displayedByDefault: 1, sortOrder: sql`values(sort_order)` } });
  return { platform: platformRows.length, support: supportRows.length };
}

export async function listTestingPlatformFields() { await seedReferenceCatalogs(); const db = await getDb(); if (!db) throw new Error("Database unavailable"); return db.select().from(demoTestingPlatformFieldDefinitions).orderBy(asc(demoTestingPlatformFieldDefinitions.objectType), asc(demoTestingPlatformFieldDefinitions.sortOrder)); }
export async function listSupportFields() { await seedReferenceCatalogs(); const db = await getDb(); if (!db) throw new Error("Database unavailable"); return db.select().from(demoSupportFieldDefinitions).orderBy(asc(demoSupportFieldDefinitions.objectType), asc(demoSupportFieldDefinitions.sortOrder)); }
