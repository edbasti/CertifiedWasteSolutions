import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NetSuiteConnection } from "@cws/shared";
import { createApp } from "./app";
import { openTestDatabase } from "./db/test-client";
import { demoPassword, resetAndSeed } from "./db/seed";
import { netSuiteConnection } from "./netsuite";

let app: ReturnType<typeof createApp>;
let close: () => Promise<void>;

beforeAll(async () => {
  const opened = await openTestDatabase();
  close = () => opened.client.close();
  await resetAndSeed(opened.db);
  app = createApp(opened.db);
});

afterAll(async () => {
  await close();
});

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Expected a session cookie");
  }
  return setCookie.split(";")[0] ?? "";
}

async function login(email: string) {
  const response = await app.request("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: demoPassword }),
  });
  return cookieFrom(response);
}

describe("NetSuite connection point", () => {
  it("shows admins that stops stay on CSV and hides credential values", async () => {
    expect((await app.request("/api/netsuite")).status).toBe(401);
    const driver = await login("alex.rivera@cws.local");
    const manager = await login("chino@cws.local");
    expect((await app.request("/api/netsuite", { headers: { cookie: driver } })).status).toBe(403);
    expect((await app.request("/api/netsuite", { headers: { cookie: manager } })).status).toBe(403);

    const admin = await login("jordan@cws.local");
    const secret = "netsuite-secret-value";
    process.env.NETSUITE_CONSUMER_SECRET = secret;
    process.env.NETSUITE_SAVED_SEARCH_ID = "customsearch_daily_stops";
    try {
      const response = await app.request("/api/netsuite", { headers: { cookie: admin } });
      expect(response.status).toBe(200);
      const body = (await response.json()) as NetSuiteConnection;
      expect(body).toMatchObject({
        connected: false,
        mode: "csv",
        message: "CSV only, NetSuite not connected.",
        savedSearch: { id: "customsearch_daily_stops" },
      });
      expect(body.savedSearch.columns.map((column) => column.column)).toEqual([
        "driverEmail",
        "serviceDate",
        "customer",
        "pickup",
        "address",
        "sequence",
      ]);
      expect(body.credentials.find((slot) => slot.key === "consumerSecret")).toEqual({
        key: "consumerSecret",
        label: "Consumer secret",
        configured: true,
      });
      expect(body.credentials.find((slot) => slot.key === "accountId")?.configured).toBe(false);
      expect(JSON.stringify(body)).not.toContain(secret);
      expect(netSuiteConnection().connected).toBe(false);
    } finally {
      delete process.env.NETSUITE_CONSUMER_SECRET;
      delete process.env.NETSUITE_SAVED_SEARCH_ID;
    }
  });
});
