import { createHmac } from "node:crypto";

const baseUrl = process.env.MCP_SMOKE_URL ?? "https://lighttriage-gdngkmys.manus.space/mcp";
const secret = process.env.SLACK_SIGNING_SECRET;
if (!secret) throw new Error("SLACK_SIGNING_SECRET is required for the signed MCP smoke test.");

async function request(payload) {
  const raw = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${raw}`).digest("hex")}`;
  const response = await fetch(baseUrl, { method: "POST", headers: { "content-type": "application/json", "accept": "application/json, text/event-stream", "x-slack-request-timestamp": timestamp, "x-slack-signature": signature }, body: raw });
  const body = await response.json();
  if (!response.ok) throw new Error(`MCP returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const initialized = await request({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "light-labs-smoke", version: "1.0.0" } } });
const tools = await request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: { slack: { user_id: "U_AE_SARAH", team_id: "T_DEMO", enterprise_id: null } } } });
console.log(JSON.stringify({ protocolVersion: initialized.result?.protocolVersion, toolNames: tools.result?.tools?.map(tool => tool.name) ?? [] }));
