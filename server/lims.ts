/**
 * Demo-only LIMS surface. It intentionally returns transparent fixture payloads and never changes
 * canonical triage records; production wiring will replace this adapter with the laboratory's API.
 */
export async function getLimsConnectionStatus() {
  return {
    provider: "QBench LIMS",
    mode: "demo" as const,
    status: "simulated" as const,
    lastSyncedAt: new Date("2026-08-24T18:30:00.000Z"),
    disclaimer: "Demo records only. No external LIMS endpoint has been called and these records do not control triage outcomes.",
    records: [
      { externalId: "QB-SMP-8812", entity: "Sample", label: "LOT-8812 · Lumen protein powder", state: "received", occurredAt: "2026-08-24T15:10:00.000Z" },
      { externalId: "QB-TEST-8812", entity: "Test", label: "Heavy metals panel · lead", state: "review_complete", occurredAt: "2026-08-24T17:42:00.000Z" },
      { externalId: "QB-REPORT-8812", entity: "Report", label: "Certificate of analysis", state: "published", occurredAt: "2026-08-24T18:30:00.000Z" },
    ],
  };
}
