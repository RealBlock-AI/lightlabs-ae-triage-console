import { describe, expect, it } from "vitest";
import { evaluateIngestPolicy, setIngestPolicy } from "./ingestPolicy";

describe("authoritative channel ingestion policy", () => {
  it("allows legacy native Slack events by default but requires an explicit policy for a custom bridge", async () => {
    const workspaceId = `T_POLICY_${Date.now()}`;
    expect(await evaluateIngestPolicy({ workspaceId, channelId: "C_DEFAULT", transport: "native_slack" })).toMatchObject({ allowed: true, reason: "native_default" });
    expect(await evaluateIngestPolicy({ workspaceId, channelId: "C_DEFAULT", transport: "custom_bridge" })).toMatchObject({ allowed: false, reason: "bridge_requires_explicit_policy" });
  });

  it("permits only the selected authoritative transport and fails closed for the other path", async () => {
    const workspaceId = `T_POLICY_${Date.now()}`; const channelId = "C_BRIDGE";
    await setIngestPolicy({ workspaceId, channelId, authoritativeTransport: "custom_bridge", enabled: true });
    expect(await evaluateIngestPolicy({ workspaceId, channelId, transport: "custom_bridge" })).toMatchObject({ allowed: true, reason: "authoritative_transport" });
    expect(await evaluateIngestPolicy({ workspaceId, channelId, transport: "native_slack" })).toMatchObject({ allowed: false, reason: "authoritative_custom_bridge" });
    await setIngestPolicy({ workspaceId, channelId, authoritativeTransport: "disabled", enabled: false });
    expect(await evaluateIngestPolicy({ workspaceId, channelId, transport: "custom_bridge" })).toMatchObject({ allowed: false, reason: "channel_disabled" });
  });
});
