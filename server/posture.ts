/**
 * Account posture - the four stat cells in the packet's right column.
 *
 * Four small facts about the account behind this one question, so the AE does
 * not open a second tab to find out whether this customer is already waiting
 * on something else.
 */

export type AccountPosture = {
  openOrders: number;
  overdueOrders: number;
  openQuestions: number;
  hasLogin: boolean;
};

/**
 * An order still in flight. Anything past release is the lab's work finished,
 * whatever happens commercially afterwards.
 */
const TERMINAL_ORDER_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "released",
  "cancelled",
  "archived",
]);

export function isOpenOrder(status: string | null | undefined): boolean {
  return Boolean(status) && !TERMINAL_ORDER_STATUSES.has(String(status).toLowerCase());
}

export function isOverdueOrder(
  order: { status?: string | null; promisedAt?: Date | null },
  now: Date,
): boolean {
  if (!isOpenOrder(order.status)) return false;
  return Boolean(order.promisedAt && order.promisedAt.getTime() < now.getTime());
}

/**
 * Does this order belong to the account behind the interaction?
 *
 * The orders table is inconsistent about which identifier it stores - some rows
 * carry a company id in account_id, some carry an account id, and company_id is
 * frequently null - so an order matches if any of its identifiers matches any
 * identifier we hold for the account.
 */
export function orderBelongsTo(
  order: { accountId?: string | null; companyId?: string | null; testingPlatformCompanyId?: string | null },
  identifiers: readonly (string | null | undefined)[],
): boolean {
  const held = new Set(identifiers.filter((value): value is string => Boolean(value)));
  return [order.accountId, order.companyId, order.testingPlatformCompanyId]
    .some(value => Boolean(value) && held.has(value as string));
}
