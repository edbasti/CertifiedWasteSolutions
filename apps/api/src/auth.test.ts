import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { demoPassword, resetAndSeed, seedIds } from "./db/seed";
import type { CwsDatabase } from "./db/client";
import { openTestDatabase } from "./db/test-client";
import { users } from "./db/schema";
import { createApp } from "./app";

let db: CwsDatabase;
let app: ReturnType<typeof createApp>;
let close: () => Promise<void>;

beforeAll(async () => {
  const opened = await openTestDatabase();
  db = opened.db;
  close = () => opened.client.close();
  await resetAndSeed(db);
  app = createApp(db);
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

async function login(email: string, password: string) {
  return app.request("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

describe("session login", () => {
  it("signs in a driver and rejects a bad password", async () => {
    const failed = await login("alex.rivera@cws.local", "wrong-password");
    expect(failed.status).toBe(401);
    expect(failed.headers.get("set-cookie")).toBeNull();

    const response = await login("alex.rivera@cws.local", demoPassword);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { role: string; name: string } };
    expect(body.user).toMatchObject({ role: "driver", name: "Alex Rivera" });

    const me = await app.request("/api/me", { headers: { cookie: cookieFrom(response) } });
    expect(me.status).toBe(200);

    const loggedOut = await app.request("/api/logout", {
      method: "POST",
      headers: { cookie: cookieFrom(response) },
    });
    expect(loggedOut.status).toBe(200);

    const after = await app.request("/api/me", { headers: { cookie: cookieFrom(response) } });
    expect(after.status).toBe(401);
  });

  it("lets an admin create a driver and reset that driver's access", async () => {
    const admin = await login("jordan@cws.local", demoPassword);
    const adminCookie = cookieFrom(admin);

    const driverLogin = await login("alex.rivera@cws.local", demoPassword);
    const driverCookie = cookieFrom(driverLogin);
    const forbidden = await app.request("/api/drivers", { headers: { cookie: driverCookie } });
    expect(forbidden.status).toBe(403);

    const created = await app.request("/api/drivers", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        name: "Test Driver",
        email: "test.driver@cws.local",
        companyName: "Test Driver",
        password: "route-day-1",
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { driver: { id: string } };

    const manager = await login("chino@cws.local", demoPassword);
    const managerDenied = await app.request("/api/drivers", {
      headers: { cookie: cookieFrom(manager) },
    });
    expect(managerDenied.status).toBe(403);

    const firstSignIn = await login("test.driver@cws.local", "route-day-1");
    expect(firstSignIn.status).toBe(200);
    const caseyCookie = cookieFrom(firstSignIn);

    const reset = await app.request(`/api/drivers/${createdBody.driver.id}/reset-access`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ password: "route-day-2" }),
    });
    expect(reset.status).toBe(200);

    const oldSession = await app.request("/api/me", { headers: { cookie: caseyCookie } });
    expect(oldSession.status).toBe(401);
    const oldPassword = await login("test.driver@cws.local", "route-day-1");
    expect(oldPassword.status).toBe(401);
    const newPassword = await login("test.driver@cws.local", "route-day-2");
    expect(newPassword.status).toBe(200);
  });

  it("blocks an inactive account", async () => {
    await db.update(users).set({ active: false }).where(eq(users.id, seedIds.sam));
    const response = await login("sam.thompson@cws.local", demoPassword);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "This account is inactive." });
    await db.update(users).set({ active: true }).where(eq(users.id, seedIds.sam));
  });
});
