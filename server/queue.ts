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

/* The clocks now live in shared/clock.ts, because the packet ticks them in
   the browser while the queue computes them on the server. */
export { ackClock, ageLabel, ageMinutes, ACK_PROMISE_SECONDS } from "@shared/clock";
