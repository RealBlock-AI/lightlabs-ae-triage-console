import { describe, expect, it } from "vitest";
import { isOpenOrder, isOverdueOrder, orderBelongsTo } from "./posture";

const now = new Date("2026-08-26T12:00:00Z");

describe("account posture", () => {
  it("counts an order open until the lab's work is finished", () => {
    for (const status of ["created", "in_progress", "on_instrument", "pickup_exception", "delayed"]) {
      expect(isOpenOrder(status)).toBe(true);
    }
    for (const status of ["completed", "released", "cancelled", "archived"]) {
      expect(isOpenOrder(status)).toBe(false);
    }
    expect(isOpenOrder(null)).toBe(false);
  });

  it("only calls an open order overdue, and only against a real promise", () => {
    expect(isOverdueOrder({ status: "delayed", promisedAt: new Date("2025-01-05T06:00:00Z") }, now)).toBe(true);
    expect(isOverdueOrder({ status: "on_instrument", promisedAt: new Date("2026-09-10T07:28:50Z") }, now)).toBe(false);
    // A finished order cannot be overdue, however old its promise.
    expect(isOverdueOrder({ status: "completed", promisedAt: new Date("2020-01-01T00:00:00Z") }, now)).toBe(false);
    expect(isOverdueOrder({ status: "delayed", promisedAt: null }, now)).toBe(false);
  });

  it("matches an order on any identifier the account holds", () => {
    // The orders table stores a company id in account_id on some rows and an
    // account id on others, so both have to match.
    expect(orderBelongsTo({ accountId: "acct_lumen" }, ["co_lumen", "acct_lumen"])).toBe(true);
    expect(orderBelongsTo({ accountId: "co_lumen", companyId: "co_lumen" }, ["co_lumen", "acct_lumen"])).toBe(true);
    expect(orderBelongsTo({ accountId: "acct_northwind" }, ["co_lumen", "acct_lumen"])).toBe(false);
    expect(orderBelongsTo({ accountId: null, companyId: null }, ["co_lumen"])).toBe(false);
  });
});
