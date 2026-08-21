import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

describe("configured Slack signing secret", () => {
  it("is accepted by the running signed ingest endpoint", async () => {
    const secret = process.env.SLACK_SIGNING_SECRET;
    expect(secret).toBeTruthy();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = JSON.stringify({ source: "slack", channel: `secret-test-${Date.now()}`, slack_user_id: "U_SECRET_TEST", text: "Signed health check", ts: `${Date.now()}.000001` });
    const signature = `v0=${createHmac("sha256", secret!).update(`v0:${timestamp}:${payload}`).digest("hex")}`;
    const invalidResponse = await fetch("http://127.0.0.1:3000/ingest", { method: "POST", headers: { "content-type": "application/json", "x-slack-request-timestamp": timestamp, "x-slack-signature": "v0=invalid" }, body: payload });
    expect(invalidResponse.status).toBe(401);
    const response = await fetch("http://127.0.0.1:3000/ingest", { method: "POST", headers: { "content-type": "application/json", "x-slack-request-timestamp": timestamp, "x-slack-signature": signature }, body: payload });
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });
});
