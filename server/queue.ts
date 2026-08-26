import { INTENTS, type Intent, type Lane } from "./policy";

/**
 * The queue row.
 *
 * One row per open customer question, sorted by urgency, then account value,
 * then age. Everything the table renders is projected here, so the page holds
 * no lookup maps of its own and the sort can never disagree with the display.
 */

export type QueueRow = {
  id: string;
  lane: Lane;
  account: string;
  contact: string;
  tier: string;
  category: string;
  ageLabel: string;
  ageMinutes: number;
  slaLabel: string;
  /** Under a minute. The only thing in the row that changes colour. */
  slaUrgent: boolean;
  confidence: number | null;
  /** The lane reason, shown on the indented second line of the pair. */
  reason: string;
};

/* -------------------------------------------------------------------------
   Tier.

   Derived, not stored. The letter is the account type and the digit is a
   spend band, which reproduces the tiers the design shows: Lumen Foods
   (brand, 156k) is A1, Northwind (brand, 92k) is A2, and Pinecrest
   Manufacturing (coman, 840k) is B1.

   Tier is load-bearing - it is the second sort key, after urgency - so it is
   computed from account records rather than read from a fixtures file.
------------------------------------------------------------------------- */

/** Spend at or above this band as tier 1. Below it, tier 2. */
export const TIER_1_FLOOR = 100_000;

export function tierFor(account: { accountType?: string | null; annualSpend?: number | string | null } | null | undefined): string {
  if (!account?.accountType) return "--";
  const letter = account.accountType === "coman" ? "B" : "A";
  const spend = Number(account.annualSpend ?? 0);
  return `${letter}${Number.isFinite(spend) && spend >= TIER_1_FLOOR ? 1 : 2}`;
}

/** Sort weight for tier, so A1 outranks A2 outranks B1. */
export function tierRank(tier: string): number {
  const letter = tier.charCodeAt(0);
  const digit = Number(tier.slice(1)) || 9;
  return letter * 10 + digit;
}

/* ------------------------------------------------------------------------- */

const CATEGORY_LABEL: Readonly<Record<Intent, string>> = Object.freeze({
  ORDER_STATUS: "Order status",
  OPS_SHIPPING: "Shipping",
  OPS_DATA_EXPORT: "Data export",
  STABILITY_SCHEDULE: "Stability schedule",
  OPS_ORDER_ENTRY: "Order entry",
  SPEC_INTAKE: "Spec intake",
  TEST_RECOMMENDATION: "Test recommendation",
  ASSAY_SCOPE_QUESTION: "Assay scope question",
  PRICING_QUOTE: "Pricing quote",
  RELATIONSHIP_COMMERCIAL: "Commercial",
  OOS_RESULT: "Out of spec result",
  LABEL_CLAIM_VARIANCE: "Label claim variance",
  HUMAN_ESCALATION_REQUEST: "Escalation request",
  REGULATORY_LIMIT_QUESTION: "Regulatory limit question",
  UNKNOWN: "Unclassified",
});

const isIntent = (value: unknown): value is Intent =>
  typeof value === "string" && (INTENTS as readonly string[]).includes(value);

/** The first recognised intent names the row. */
export function categoryLabel(intents: unknown): string {
  const first = Array.isArray(intents) ? intents.find(isIntent) : undefined;
  return first ? CATEGORY_LABEL[first] : CATEGORY_LABEL.UNKNOWN;
}

/* -------------------------------------------------------------------------
   The clock.

   Two different promises live on an interaction and they are not the same
   number. slaMinutes is the resolution target (15 / 30 / 60 by lane). The
   clock the AE watches is the acknowledgement promise, and it is short - so
   it is shown in minutes and seconds, and it turns the escalate colour under
   a minute. Nothing else in the row changes.
------------------------------------------------------------------------- */

export const ACK_PROMISE_SECONDS = 120;

export function ageMinutes(receivedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - receivedAt.getTime()) / 60_000));
}

export function ageLabel(receivedAt: Date, now: Date): string {
  const minutes = ageMinutes(receivedAt, now);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/** Past this much overdue, a countdown stops being information. */
const MISSED_AFTER_SECONDS = 60 * 60;

export function ackClock(receivedAt: Date, now: Date, promiseSeconds = ACK_PROMISE_SECONDS) {
  const elapsed = Math.floor((now.getTime() - receivedAt.getTime()) / 1000);
  const remaining = promiseSeconds - elapsed;
  // A four-digit negative countdown on a day-old row is noise, not urgency, and
  // it drags the column wide enough to unbalance the table.
  if (-remaining > MISSED_AFTER_SECONDS) return { label: "missed", urgent: true };
  const shown = Math.abs(remaining);
  const label = `${remaining < 0 ? "-" : ""}${Math.floor(shown / 60)}:${String(shown % 60).padStart(2, "0")}`;
  // Under a minute left, or already past. Both want the AE's eye.
  return { label, urgent: remaining < 60 };
}
