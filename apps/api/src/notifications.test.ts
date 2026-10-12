import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppNotification } from "@cws/shared";
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

async function notices(cookie: string) {
  const response = await app.request("/api/notifications", { headers: { cookie } });
  expect(response.status).toBe(200);
  return ((await response.json()) as { notifications: AppNotification[] }).notifications;
}

describe("route notifications", () => {
  it("tells only that driver when staff assign, reorder, or remove stops", async () => {
    expect((await app.request("/api/notifications")).status).toBe(401);

    const manager = await login("chino@cws.local");
    const alex = await login("alex.rivera@cws.local");
    const sam = await login("sam.thompson@cws.local");

    const seeded = await notices(alex);
    expect(seeded[0]).toMatchObject({
      type: "route_assigned",
      message: "Your stops for 2026-09-30 are ready.",
      serviceDate: "2026-09-30",
      routeDayId: seedIds.routeDay,
      readAt: null,
    });
    expect(await notices(sam)).toEqual([]);
    expect(await notices(manager)).toEqual([]);

    const hidden = await app.request(`/api/notifications/${seeded[0]?.id}/read`, {
      method: "POST",
      headers: { cookie: sam },
    });
    expect(hidden.status).toBe(404);

    const listed = await app.request("/api/routes?date=2026-09-30", { headers: { cookie: manager } });
    const route = ((await listed.json()) as { routes: { id: string; stops: { id: string }[] }[] }).routes[0];
    const stopIds = route?.stops.map((stop) => stop.id) ?? [];
    const sameOrder = await app.request(`/api/routes/${route?.id}/order`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({ stopIds }),
    });
    expect(sameOrder.status).toBe(200);
    expect(await notices(alex)).toHaveLength(1);

    const reordered = await app.request(`/api/routes/${route?.id}/order`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({ stopIds: [...stopIds].reverse() }),
    });
    expect(reordered.status).toBe(200);
    const updated = await notices(alex);
    expect(updated[0]).toMatchObject({
      type: "route_updated",
      message: "Your stop order for 2026-09-30 changed.",
      serviceDate: "2026-09-30",
    });

    const read = await app.request(`/api/notifications/${updated[0]?.id}/read`, {
      method: "POST",
      headers: { cookie: alex },
    });
    expect(read.status).toBe(200);
    const readBody = (await read.json()) as { notification: AppNotification };
    expect(readBody.notification.readAt).toEqual(expect.any(String));

    const created = await app.request("/api/routes/stops", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({
        driverUserId: seedIds.sam,
        serviceDate: "2026-10-08",
        customerId: seedIds.metro,
        pickupDescription: "Cardboard",
      }),
    });
    expect(created.status).toBe(201);
    const assigned = await notices(sam);
    expect(assigned[0]).toMatchObject({
      type: "route_assigned",
      message: "Your stops for 2026-10-08 are ready.",
      serviceDate: "2026-10-08",
    });

    const day = await app.request("/api/day?date=2026-10-08", { headers: { cookie: sam } });
    const dayBody = (await day.json()) as { stops: { id: string }[] };
    const ownOrder = await app.request("/api/day/order", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sam },
      body: JSON.stringify({ date: "2026-10-08", stopIds: dayBody.stops.map((stop) => stop.id) }),
    });
    expect(ownOrder.status).toBe(200);
    expect(await notices(sam)).toHaveLength(1);

    const removed = await app.request(`/api/stops/${dayBody.stops[0]?.id}`, {
      method: "DELETE",
      headers: { cookie: manager },
    });
    expect(removed.status).toBe(200);
    expect((await notices(sam))[0]).toMatchObject({
      type: "route_updated",
      message: "Metro Foods was removed from 2026-10-08.",
    });
    expect(await notices(alex)).toHaveLength(2);
  });
});
