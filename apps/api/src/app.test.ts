import { beforeAll, describe, expect, it } from "vitest";
import { appName } from "@cws/shared";
import { createApp } from "./app";
import { openTestDatabase } from "./db/test-client";

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  const { db } = await openTestDatabase();
  app = createApp(db);
});

describe("GET /health", () => {
  it("reports the service is up", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: appName,
    });
  });
});
