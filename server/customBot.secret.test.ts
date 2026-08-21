import express from "express";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customBotHealth } from "./customBot";

describe("custom bot integration secret", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl = "";

  beforeAll(async () => {
    const app = express();
    app.get("/integrations/slack-bot/health", customBotHealth);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Unable to start custom-bot secret test server.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  it("accepts the supplied custom-bot secret and rejects an invalid credential", async () => {
    const accepted = await fetch(`${baseUrl}/integrations/slack-bot/health`, { headers: { Authorization: `Bearer ${process.env.LIGHT_LABS_BOT_INGEST_SECRET}` } });
    const rejected = await fetch(`${baseUrl}/integrations/slack-bot/health`, { headers: { Authorization: "Bearer invalid-custom-bot-credential" } });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ ok: true });
    expect(rejected.status).toBe(401);
  });
});

