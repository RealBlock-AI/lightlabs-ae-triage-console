import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ensureDemoData } from "./triage";

const signedHeaders = (payload: string) => { const timestamp = Math.floor(Date.now() / 1000).toString(); return { "content-type": "application/json", "x-slack-request-timestamp": timestamp, "x-slack-signature": `v0=${createHmac("sha256", process.env.SLACK_SIGNING_SECRET!).update(`v0:${timestamp}:${payload}`).digest("hex")}` }; };

describe("signed Slack Identity Auth MCP endpoint", () => {
  it("allows a signed Slackbot discovery request to list only the constrained Light Labs tools before per-user identity is supplied", async () => {
    await ensureDemoData();
    const payload = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    const response = await fetch("http://127.0.0.1:3000/mcp", { method: "POST", headers: signedHeaders(payload), body: payload });
    const body = await response.json() as { result?: { tools?: Array<{ name: string }> } };
    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-protocol-version")).toBe("2025-06-18");
    expect(body.result?.tools?.map(tool => tool.name)).toEqual(expect.arrayContaining(["triage.retrieve_knowledge", "triage.get_knowledge_section", "triage.search_queue", "triage.get_interaction"]));
  });

  it("rejects a signed data-bearing tool call from a Slack identity not mapped to an internal team member", async () => {
    const payload = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "triage.search_queue", arguments: {}, _meta: { slack: { user_id: "U_UNKNOWN", team_id: "T_DEMO" } } } });
    const response = await fetch("http://127.0.0.1:3000/mcp", { method: "POST", headers: signedHeaders(payload), body: payload });
    expect(response.status).toBe(403);
  });
});
