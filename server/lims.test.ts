import { describe, expect, it } from "vitest";
import { getLimsConnectionStatus } from "./lims";

describe("visible demo LIMS connection", () => {
  it("labels fixture laboratory records as simulated and non-authoritative", async () => {
    const status = await getLimsConnectionStatus();
    expect(status).toMatchObject({ provider: "QBench LIMS", mode: "demo", status: "simulated" });
    expect(status.disclaimer).toContain("do not control triage outcomes");
    expect(status.records.map(record => record.externalId)).toContain("QB-REPORT-8812");
  });
});
