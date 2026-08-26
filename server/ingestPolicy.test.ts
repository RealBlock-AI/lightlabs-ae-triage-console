import { describe, expect, it } from "vitest";
import { evaluateIngestPolicy, setIngestPolicy } from "./ingestPolicy";

describe("authoritative channel ingestion policy", () => {
  it("allows native Slack and authenticated custom-bridge events by default", async () => {
    const workspaceId = `T_POLICY_${Date.now()}`;
    expect(await evaluateIngestPolicy({ workspaceId, channelId: "C_DEFAULT", transport: "native_slack" })).toMatchObject({ allowed: true, reason: "native_default" });
    expect(await evaluateIngestPolicy({ workspaceId, channelId: "C_DEFAULT", transport: "custom_bridge" })).toMatchObject({ allowed: true, reason: "bridge_permissive_default" });
  });

  it("permits only the selected authoritative transport and fails closed for the other path", async () => {
    const workspaceId = `T_POLICY_${Date.now()}`; const channelId = "C_BRIDGE";
    await setIngestPolicy({ workspaceId, channelId, authoritativeTransport: "custom_bridge", enabled: true });
    expect(await evaluateIngestPolicy({ workspaceId, channelId, transport: "custom_bridge" })).toMatchObject({ allowed: true, reason: "authoritative_transport" });
    expect(await evaluateIngestPolicy({ workspaceId, channelId, transport: "native_slack" })).toMatchObject({ allowed: false, reason: "authoritative_custom_bridge" });
    await setIngestPolicy({ workspaceId, channelId, authoritativeTransport: "disabled", enabled: false });
    expect(await evaluateIngestPolicy({ workspaceId, channelId, transport: "custom_bridge" })).toMatchObject({ allowed: false, reason: "channel_disabled" });
  });

  it("supports an explicit workspace-wide bridge policy without channel allowlisting", async () => {
    const workspaceId = `T_WORKSPACE_${Date.now()}`;
    await setIngestPolicy({ workspaceId, channelId: "*", authoritativeTransport: "custom_bridge", enabled: true });
    expect(await evaluateIngestPolicy({ workspaceId, channelId: "C_ANY_CHANNEL", transport: "custom_bridge" })).toMatchObject({ allowed: true, reason: "workspace_authoritative_transport" });
    expect(await evaluateIngestPolicy({ workspaceId, channelId: "C_ANY_CHANNEL", transport: "native_slack" })).toMatchObject({ allowed: false, reason: "authoritative_custom_bridge" });
  });
});
