import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DispatchImportPreview, NetSuiteConnection, RouteImportResult } from "@cws/shared";
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

const sampleCsv = `Driver,In/Out,N° Dispatch,Run,Stop,Date,Customer,Address,City,Commodity,Action,Dispatch notes
Alex Rivera,IN,000200,1,1,2026-10-10,Metro Foods,18 Harbor Industrial Rd,Bayport,Cardboard,Dump & Return,Gate code 12
`;

describe("NetSuite dispatch import", () => {
  it("lets managers preview and import a dispatch file into driver routes", async () => {
    expect((await app.request("/api/netsuite")).status).toBe(401);
    const driver = await login("alex.rivera@cws.local");
    expect((await app.request("/api/netsuite", { headers: { cookie: driver } })).status).toBe(403);

    const manager = await login("chino@cws.local");
    const connection = await app.request("/api/netsuite", { headers: { cookie: manager } });
    expect(connection.status).toBe(200);
    const body = (await connection.json()) as NetSuiteConnection;
    expect(body).toMatchObject({
      connected: true,
      mode: "dispatch_file",
    });
    expect(body.dispatchColumns).toContain("Driver");
    expect(JSON.stringify(body)).not.toContain("netsuite-secret-value");

    const form = new FormData();
    form.set("file", new File([sampleCsv], "dispatch.csv", { type: "text/csv" }));
    const previewResponse = await app.request("/api/netsuite/dispatch/preview", {
      method: "POST",
      headers: { cookie: manager },
      body: form,
    });
    expect(previewResponse.status).toBe(200);
    const preview = (await previewResponse.json()) as DispatchImportPreview;
    expect(preview.rows).toHaveLength(1);
    expect(preview.drivers[0]).toMatchObject({
      driverName: "Alex Rivera",
      matchedBy: "name",
    });

    const imported = await app.request("/api/netsuite/dispatch/import", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({
        rows: preview.rows,
        assignments: { "Alex Rivera": preview.drivers[0]?.driverId },
      }),
    });
    expect(imported.status).toBe(200);
    const result = (await imported.json()) as RouteImportResult;
    expect(result.stops).toBe(1);
    expect(result.createdRoutes + result.replacedRoutes).toBeGreaterThan(0);

    const exported = await app.request("/api/netsuite/dispatch/export?from=2026-10-10&to=2026-10-10&format=csv", {
      headers: { cookie: manager },
    });
    expect(exported.status).toBe(200);
    const csv = await exported.text();
    expect(csv).toContain("Driver");
    expect(csv).toContain("Metro Foods");

    const livePull = await app.request("/api/routes/netsuite", {
      method: "POST",
      headers: { cookie: manager },
    });
    expect(livePull.status).toBe(409);

    expect(netSuiteConnection().connected).toBe(true);
  });
});
