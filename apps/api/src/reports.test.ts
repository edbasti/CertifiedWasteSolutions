import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CompletedStopReport } from "@cws/shared";
import { createApp } from "./app";
import { openTestDatabase } from "./db/test-client";
import { demoPassword, resetAndSeed } from "./db/seed";

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

describe("completed stop reports", () => {
  it("lists completed stops for a driver, customer, and date range, with timing and a CSV", async () => {
    expect((await app.request("/api/reports/stops")).status).toBe(401);

    const driver = await login("alex.rivera@cws.local");
    expect((await app.request("/api/reports/stops", { headers: { cookie: driver } })).status).toBe(403);

    const manager = await login("chino@cws.local");
    const report = await app.request("/api/reports/stops?from=2026-09-30&to=2026-09-30", { headers: { cookie: manager } });
    expect(report.status).toBe(200);
    const body = (await report.json()) as CompletedStopReport;
    expect(body.stops.map((stop) => stop.customerName)).toEqual(["Metro Foods", "Brightway Offices"]);
    expect(body.stops.every((stop) => stop.driverName === "Alex Rivera" && stop.serviceDate === "2026-09-30")).toBe(true);
    expect(body.stops.find((stop) => stop.customerName === "Brightway Offices")?.notes[0]?.body).toBe(
      "Left the load at the loading dock.",
    );
    expect(body.stops.every((stop) => stop.photos.length === 0)).toBe(true);
    expect(body.averages).toEqual([{ fromStatus: "en_route", toStatus: "completed", averageMinutes: 23, samples: 2 }]);

    const byDriver = await app.request("/api/reports/stops?driver=sam", { headers: { cookie: manager } });
    expect(((await byDriver.json()) as CompletedStopReport).stops).toEqual([]);

    const byCustomer = await app.request("/api/reports/stops?customer=bright", { headers: { cookie: manager } });
    const brightway = (await byCustomer.json()) as CompletedStopReport;
    expect(brightway.stops.map((stop) => stop.customerName)).toEqual(["Brightway Offices"]);
    expect(brightway.averages).toEqual([{ fromStatus: "en_route", toStatus: "completed", averageMinutes: 24, samples: 1 }]);

    const later = await app.request("/api/reports/stops?from=2026-10-01", { headers: { cookie: manager } });
    expect(((await later.json()) as CompletedStopReport).stops).toEqual([]);

    expect((await app.request("/api/reports/stops?from=2026-02-31", { headers: { cookie: manager } })).status).toBe(400);
    expect((await app.request("/api/reports/stops?from=2026-10-02&to=2026-10-01", { headers: { cookie: manager } })).status).toBe(
      400,
    );

    const csv = await app.request("/api/reports/stops.csv?from=2026-09-30&to=2026-09-30", { headers: { cookie: manager } });
    expect(csv.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(csv.headers.get("content-disposition")).toBe('attachment; filename="completed-stops.csv"');
    const text = await csv.text();
    expect(text).toContain("Metro Foods");
    expect(text).toContain("Brightway Offices");
    expect(text).toContain("Left the load at the loading dock.");
    expect(text).toContain('"18 Harbor Industrial Rd, Bayport"');
    expect(text).not.toContain("Harbor City Market");
    expect(text).not.toContain("Greenline Nursery");
    expect(text).toContain("\n2026-09-30,Alex Rivera,Metro Foods");
  });
});
