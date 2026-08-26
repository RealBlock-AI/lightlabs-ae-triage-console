import { describe, expect, it } from "vitest";
import { ackClock, ageLabel } from "@shared/clock";
import { categoryLabel, tierFor, tierRank } from "./queue";

describe("queue row projection", () => {
  /**
   * Pinned to the real account records. These three are the tiers the design
   * shows in the queue, and they fall out of account_type + annual_spend
   * without a stored tier column.
   */
  it("derives the design's tiers from the account records", () => {
    expect(tierFor({ accountType: "brand", annualSpend: 156000 })).toBe("A1"); // Lumen Foods
    expect(tierFor({ accountType: "brand", annualSpend: 92000 })).toBe("A2");  // Northwind Nutrition
    expect(tierFor({ accountType: "coman", annualSpend: 840000 })).toBe("B1"); // Pinecrest Manufacturing
  });

  it("reads a spend stored as a string, and degrades visibly when unknown", () => {
    expect(tierFor({ accountType: "brand", annualSpend: "156000" })).toBe("A1");
    expect(tierFor({ accountType: "brand", annualSpend: null })).toBe("A2");
    expect(tierFor(null)).toBe("--");
    expect(tierFor({})).toBe("--");
  });

  it("ranks tier so account value sorts after urgency", () => {
    expect(tierRank("A1")).toBeLessThan(tierRank("A2"));
    expect(tierRank("A2")).toBeLessThan(tierRank("B1"));
  });

  it("names a row by its first recognised intent", () => {
    expect(categoryLabel(["OOS_RESULT"])).toBe("Out of spec result");
    expect(categoryLabel(["ORDER_STATUS", "OPS_SHIPPING"])).toBe("Order status");
    expect(categoryLabel(["OPS_DATA_EXPORT"])).toBe("Data export");
    expect(categoryLabel(["not_an_intent"])).toBe("Unclassified");
    expect(categoryLabel(null)).toBe("Unclassified");
  });

  it("counts age down in the largest useful unit", () => {
    const now = new Date("2026-08-26T10:00:00Z");
    expect(ageLabel(new Date("2026-08-26T09:42:00Z"), now)).toBe("18m");
    expect(ageLabel(new Date("2026-08-26T07:00:00Z"), now)).toBe("3h");
    expect(ageLabel(new Date("2026-08-24T10:00:00Z"), now)).toBe("2d");
    expect(ageLabel(new Date("2026-08-26T10:30:00Z"), now)).toBe("0m"); // clock skew, never negative
  });

  it("shows the acknowledgement promise in minutes and seconds", () => {
    const received = new Date("2026-08-26T10:00:00Z");
    // 79s left of the two-minute promise.
    expect(ackClock(received, new Date("2026-08-26T10:00:41Z"))).toEqual({ label: "1:19", urgent: false });
    // Under a minute: this is the only thing in the row that takes the lane colour.
    expect(ackClock(received, new Date("2026-08-26T10:01:19Z"))).toEqual({ label: "0:41", urgent: true });
    expect(ackClock(received, new Date("2026-08-26T10:00:00Z")).label).toBe("2:00");
  });

  it("keeps counting once the promise is missed, rather than resetting to zero", () => {
    const received = new Date("2026-08-26T10:00:00Z");
    const past = ackClock(received, new Date("2026-08-26T10:03:05Z"));
    expect(past.label).toBe("-1:05");
    expect(past.urgent).toBe(true);
  });

  it("stops counting once a countdown is no longer information", () => {
    // A four-digit negative on a day-old row is noise, and it drags the column
    // wide enough to unbalance the table.
    const received = new Date("2026-08-25T12:00:00Z");
    const stale = ackClock(received, new Date("2026-08-26T10:00:00Z"));
    expect(stale.label).toBe("missed");
    expect(stale.urgent).toBe(true);
  });
});
