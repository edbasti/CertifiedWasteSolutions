import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AssignedRoute, RouteImportResult } from "@cws/shared";
import { createApp } from "./app";
import { openTestDatabase } from "./db/test-client";
import { demoPassword, resetAndSeed, seedIds } from "./db/seed";

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

describe("route assignment", () => {
  it("lets a manager add, reorder, and remove a stop by hand", async () => {
    const manager = await login("chino@cws.local");
    const driver = await login("alex.rivera@cws.local");
    expect((await app.request("/api/routes?date=2026-10-06", { headers: { cookie: driver } })).status).toBe(403);

    const sources = await app.request("/api/route-sources", { headers: { cookie: manager } });
    const sourceBody = (await sources.json()) as { sources: { id: string; available: boolean }[] };
    expect(sourceBody.sources.find((source) => source.id === "netsuite")?.available).toBe(false);
    const netsuite = await app.request("/api/routes/netsuite", {
      method: "POST",
      headers: { cookie: manager },
    });
    expect(netsuite.status).toBe(409);

    const created = await app.request("/api/routes/stops", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({
        driverUserId: seedIds.sam,
        serviceDate: "2026-10-06",
        customerId: seedIds.metro,
        pickupDescription: "Cardboard",
      }),
    });
    expect(created.status).toBe(201);

    const second = await app.request("/api/routes/stops", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({
        driverUserId: seedIds.sam,
        serviceDate: "2026-10-06",
        customerName: "Pop-up site",
        address: "9 Temporary Ln, Bayport",
        pickupDescription: "Mixed load",
      }),
    });
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as { stop: { id: string } };

    const listed = await app.request("/api/routes?date=2026-10-06", { headers: { cookie: manager } });
    const listedBody = (await listed.json()) as { routes: AssignedRoute[] };
    const route = listedBody.routes[0];
    expect(route?.driverName).toBe("Sam Thompson");
    expect(route?.stops.map((stop) => stop.customerName)).toEqual(["Metro Foods", "Pop-up site"]);

    const reordered = await app.request(`/api/routes/${route?.id}/order`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({ stopIds: [secondBody.stop.id, route?.stops[0]?.id] }),
    });
    expect(reordered.status).toBe(200);
    const reorderedBody = (await reordered.json()) as { routes: AssignedRoute[] };
    expect(reorderedBody.routes[0]?.stops.map((stop) => stop.customerName)).toEqual(["Pop-up site", "Metro Foods"]);

    const removed = await app.request(`/api/stops/${secondBody.stop.id}`, {
      method: "DELETE",
      headers: { cookie: manager },
    });
    expect(removed.status).toBe(200);
    const after = await app.request("/api/routes?date=2026-10-06", { headers: { cookie: manager } });
    const afterBody = (await after.json()) as { routes: AssignedRoute[] };
    expect(afterBody.routes[0]?.stops.map((stop) => stop.sequence)).toEqual([1]);
  });

  it("imports a fresh CSV and refuses to replace a route already in progress", async () => {
    const manager = await login("chino@cws.local");
    const imported = await app.request("/api/routes/import", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({
        csv: "driverEmail,serviceDate,customer,pickup\nsam.thompson@cws.local,2026-10-07,Harbor City Market,Mixed recycling\n",
      }),
    });
    expect(imported.status).toBe(200);
    const importedBody = (await imported.json()) as RouteImportResult;
    expect(importedBody.createdRoutes).toBe(1);
    expect(importedBody.stops).toBe(1);

    const locked = await app.request("/api/routes/import", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({
        csv: "driverEmail,serviceDate,customer,address,pickup\nalex.rivera@cws.local,2026-09-30,Metro Foods,1 New St,Cardboard\n",
      }),
    });
    const lockedBody = (await locked.json()) as RouteImportResult;
    expect(lockedBody.errors[0]?.message).toContain("already started");

    const original = await app.request("/api/routes?date=2026-09-30", { headers: { cookie: manager } });
    const originalBody = (await original.json()) as { routes: AssignedRoute[] };
    expect(originalBody.routes[0]?.stops).toHaveLength(4);
    expect(originalBody.routes[0]?.stops[0]?.status).toBe("completed");
    const brightway = originalBody.routes[0]?.stops.find((stop) => stop.customerName === "Brightway Offices");
    expect(brightway?.notes[0]).toMatchObject({
      body: "Left the load at the loading dock.",
      authorName: "Alex Rivera",
    });
    expect(brightway?.history.map((change) => change.toStatus)).toEqual(["en_route", "completed"]);
    expect(brightway?.history[0]?.changedByName).toBe("Alex Rivera");
    expect(brightway?.photos).toEqual([]);

    const started = originalBody.routes[0]?.stops.find((stop) => stop.status === "en_route");
    const denied = await app.request(`/api/stops/${started?.id}`, {
      method: "DELETE",
      headers: { cookie: manager },
    });
    expect(denied.status).toBe(409);
  });
});
