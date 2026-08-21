import express from "express";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bobbyHealth } from "./bobby";

describe("Bobby credential", () => {
  let server: ReturnType<typeof createServer>; let baseUrl = "";
  beforeAll(async () => { const app = express(); app.get("/integrations/bobby/health", bobbyHealth); server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve())); const address = server.address(); if (!address || typeof address === "string") throw new Error("Unable to start Bobby test server."); baseUrl = `http://127.0.0.1:${address.port}`; });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  it("accepts the configured Bobby token and rejects an invalid bearer token", async () => {
    const valid = await fetch(`${baseUrl}/integrations/bobby/health`, { headers: { Authorization: `Bearer ${process.env.BOBBY_MCP_TOKEN}` } });
    const invalid = await fetch(`${baseUrl}/integrations/bobby/health`, { headers: { Authorization: "Bearer invalid" } });
    expect(valid.status).toBe(200); expect(await valid.json()).toMatchObject({ ok: true, service: "light-labs-bobby-support" }); expect(invalid.status).toBe(401);
  });
});
