import { createServer } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bobbyAccountBindingHealth } from "./accountBinding";

describe("configured Light Labs account-binding credential", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl = "";

  beforeAll(async () => {
    const app = express();
    app.get("/integrations/bobby/account-binding/health", bobbyAccountBindingHealth);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Unable to start account-binding test server.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });

  it("rejects an invalid credential and accepts the dedicated binding credential", async () => {
    const rejected = await fetch(`${baseUrl}/integrations/bobby/account-binding/health`, { headers: { Authorization: "Bearer invalid" } });
    const accepted = await fetch(`${baseUrl}/integrations/bobby/account-binding/health`, { headers: { Authorization: `Bearer ${process.env.LIGHTLABS_BINDING_SECRET}` } });

    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("www-authenticate")).toBe('Bearer realm="light-labs-account-binding"');
    expect(await accepted.json()).toEqual({ ok: true, service: "light-labs-account-binding" });
  });
});
