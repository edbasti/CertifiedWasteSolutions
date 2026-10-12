import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CustomerAccount, ImportResult } from "@cws/shared";
import { createApp } from "./app";
import { openTestDatabase } from "./db/test-client";
import { demoPassword } from "./db/seed";
import { resetAndSeed } from "./db/seed";

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

describe("customer directory", () => {
  it("lets a manager add, edit, deactivate, and import locations", async () => {
    const manager = await login("chino@cws.local");
    const driver = await login("alex.rivera@cws.local");
    const denied = await app.request("/api/customers", { headers: { cookie: driver } });
    expect(denied.status).toBe(403);

    const listed = await app.request("/api/customers", { headers: { cookie: manager } });
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as { customers: CustomerAccount[] };
    expect(listedBody.customers.map((customer) => customer.name)).toEqual([
      "Brightway Offices",
      "Greenline Nursery",
      "Harbor City Market",
      "Metro Foods",
    ]);

    const created = await app.request("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({ name: "Pier Warehouse", address: "1 Pier St, Bayport" }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { customer: CustomerAccount };

    const duplicate = await app.request("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({ name: "pier warehouse", address: "Somewhere else" }),
    });
    expect(duplicate.status).toBe(409);

    const updated = await app.request(`/api/customers/${createdBody.customer.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({ name: "Pier Warehouse", address: "2 Pier St, Bayport", active: false }),
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      customer: { address: "2 Pier St, Bayport", active: false },
    });

    const imported = await app.request("/api/customers/import", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({
        csv: 'name,address,active\nNorth Yard,"4 Dock Rd, Bayport",yes\nMetro Foods,"18 Harbor Industrial Rd, Bayport dock"\n,Missing address\n',
      }),
    });
    expect(imported.status).toBe(200);
    const importedBody = (await imported.json()) as ImportResult;
    expect(importedBody.created).toBe(1);
    expect(importedBody.updated).toBe(1);
    expect(importedBody.errors).toEqual([{ line: 4, message: "Enter a name and address." }]);
  });
});

describe("driver directory", () => {
  it("lets an admin edit, deactivate, and import drivers", async () => {
    const admin = await login("jordan@cws.local");
    const manager = await login("chino@cws.local");
    const managerDenied = await app.request("/api/drivers/import", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({ csv: "name,email,password\nTest Driver,test.driver@cws.local,route-day-1\n" }),
    });
    expect(managerDenied.status).toBe(403);

    const imported = await app.request("/api/drivers/import", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: admin },
      body: JSON.stringify({
        csv: "name,email,companyName,password\nTest Driver,bulk.driver@cws.local,Test Driver,route-day-1\n,missing@cws.local,route-day-1\n",
      }),
    });
    expect(imported.status).toBe(200);
    const importedBody = (await imported.json()) as ImportResult;
    expect(importedBody).toMatchObject({ created: 1, updated: 0 });
    expect(importedBody.errors).toHaveLength(1);

    const signedIn = await app.request("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "bulk.driver@cws.local", password: "route-day-1" }),
    });
    expect(signedIn.status).toBe(200);
    const drivers = await app.request("/api/drivers", { headers: { cookie: admin } });
    const driversBody = (await drivers.json()) as { drivers: { id: string; email: string }[] };
    const created = driversBody.drivers.find((driver) => driver.email === "bulk.driver@cws.local");
    expect(created).toBeTruthy();

    const deactivated = await app.request(`/api/drivers/${created?.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: admin },
      body: JSON.stringify({ active: false }),
    });
    expect(deactivated.status).toBe(200);
    const session = await app.request("/api/me", { headers: { cookie: cookieFrom(signedIn) } });
    expect(session.status).toBe(401);
    const blocked = await app.request("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "bulk.driver@cws.local", password: "route-day-1" }),
    });
    expect(blocked.status).toBe(401);
  });
});
