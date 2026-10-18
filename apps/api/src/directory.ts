import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import type { ImportResult } from "@cws/shared";
import type { AppEnv } from "./app-env";
import { requireRole, requireUser } from "./auth";
import { columnIndex, parseActive, parseCsv } from "./csv";
import type { CwsDatabase } from "./db/client";
import { hashPassword } from "./db/password";
import { customers, sessions, users } from "./db/schema";

const maxImportCharacters = 1_000_000;
const maxImportRows = 500;

function textField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function booleanField(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  return typeof value === "boolean" ? value : undefined;
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toCustomer(customer: typeof customers.$inferSelect) {
  return {
    id: customer.id,
    name: customer.name,
    address: customer.address,
    active: customer.active,
  };
}

function toDriver(driver: typeof users.$inferSelect) {
  return {
    id: driver.id,
    name: driver.name,
    email: driver.email,
    companyName: driver.companyName,
    active: driver.active,
  };
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cell(cells: string[], index: number): string {
  if (index < 0) {
    return "";
  }
  return cells[index]?.trim() ?? "";
}

export function registerDirectory(app: Hono<AppEnv>, db: CwsDatabase) {
  const signedIn = requireUser(db);
  const staff = requireRole("admin", "manager");
  const admin = requireRole("admin");

  app.get("/api/customers", signedIn, staff, async (c) => {
    const locations = (await db.select().from(customers))
      .map(toCustomer)
      .sort((a, b) => a.name.localeCompare(b.name));
    return c.json({ customers: locations });
  });

  app.post("/api/customers", signedIn, staff, async (c) => {
    const body = await readJson(c);
    if (!body) {
      return c.json({ error: "Enter a location name and address." }, 400);
    }
    const name = textField(body, "name");
    const address = textField(body, "address");
    if (!name || !address) {
      return c.json({ error: "Enter a location name and address." }, 400);
    }

    const existing = await db.select().from(customers);
    if (existing.some((customer) => customer.name.toLowerCase() === name.toLowerCase())) {
      return c.json({ error: "A location with that name already exists." }, 409);
    }

    const customer = {
      id: randomUUID(),
      name,
      address,
      active: true,
      createdAt: new Date().toISOString(),
    };
    await db.insert(customers).values(customer);
    return c.json({ customer: toCustomer(customer) }, 201);
  });

  app.patch("/api/customers/:id", signedIn, staff, async (c) => {
    const body = await readJson(c);
    if (!body) {
      return c.json({ error: "Enter a location name and address." }, 400);
    }

    const [current] = await db.select().from(customers).where(eq(customers.id, c.req.param("id")));
    if (!current) {
      return c.json({ error: "Location not found." }, 404);
    }

    const name = textField(body, "name") || current.name;
    const address = textField(body, "address") || current.address;
    const active = booleanField(body, "active");
    if (!name || !address) {
      return c.json({ error: "Enter a location name and address." }, 400);
    }

    const existing = await db.select().from(customers);
    const duplicate = existing.find(
      (customer) => customer.id !== current.id && customer.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      return c.json({ error: "A location with that name already exists." }, 409);
    }

    const next = { name, address, active: active ?? current.active };
    await db.update(customers).set(next).where(eq(customers.id, current.id));
    return c.json({ customer: toCustomer({ ...current, ...next }) });
  });

  app.post("/api/customers/import", signedIn, staff, async (c) => {
    const body = await readJson(c);
    const csv = body ? textField(body, "csv") : "";
    if (!csv) {
      return c.json({ error: "Choose a CSV file to import." }, 400);
    }
    if (csv.length > maxImportCharacters) {
      return c.json({ error: "That file is too large to import." }, 400);
    }

    const records = parseCsv(csv);
    const header = records[0];
    if (!header) {
      return c.json({ error: "The first row must include name and address." }, 400);
    }
    const nameIndex = columnIndex(header.cells, ["name", "customername", "customer"]);
    const addressIndex = columnIndex(header.cells, ["address", "serviceaddress", "location"]);
    if (nameIndex === -1 || addressIndex === -1) {
      return c.json({ error: "The first row must include name and address." }, 400);
    }
    const activeIndex = columnIndex(header.cells, ["active", "status"]);
    const rows = records.slice(1);
    if (rows.length === 0) {
      return c.json({ error: "Add at least one location under the header row." }, 400);
    }
    if (rows.length > maxImportRows) {
      return c.json({ error: `Import ${maxImportRows} rows or fewer.` }, 400);
    }

    const result: ImportResult = { created: 0, updated: 0, errors: [] };
    for (const row of rows) {
      const name = cell(row.cells, nameIndex);
      const address = cell(row.cells, addressIndex);
      const active = parseActive(activeIndex === -1 ? undefined : cell(row.cells, activeIndex));
      if (!name || !address) {
        result.errors.push({ line: row.line, message: "Enter a name and address." });
        continue;
      }
      if (activeIndex !== -1 && cell(row.cells, activeIndex) && active === undefined) {
        result.errors.push({ line: row.line, message: "Use active or inactive in the active column." });
        continue;
      }

      const existing = await db.select().from(customers);
      const match = existing.find((customer) => customer.name.toLowerCase() === name.toLowerCase());
      if (match) {
        await db
          .update(customers)
          .set({ name, address, active: active ?? match.active })
          .where(eq(customers.id, match.id));
        result.updated += 1;
      } else {
        await db.insert(customers).values({
          id: randomUUID(),
          name,
          address,
          active: active ?? true,
          createdAt: new Date().toISOString(),
        });
        result.created += 1;
      }
    }

    return c.json(result);
  });

  app.patch("/api/drivers/:id", signedIn, admin, async (c) => {
    const body = await readJson(c);
    if (!body) {
      return c.json({ error: "Enter the driver's name and email." }, 400);
    }

    const [driver] = await db.select().from(users).where(eq(users.id, c.req.param("id")));
    if (!driver || driver.role !== "driver") {
      return c.json({ error: "Driver not found." }, 404);
    }

    const name = textField(body, "name") || driver.name;
    const email = (textField(body, "email") || driver.email).toLowerCase();
    const companyProvided = typeof body.companyName === "string";
    const companyName = companyProvided ? textField(body, "companyName") || null : driver.companyName;
    const active = booleanField(body, "active");
    if (!name || !email) {
      return c.json({ error: "Enter the driver's name and email." }, 400);
    }
    if (!validEmail(email)) {
      return c.json({ error: "Enter a valid email." }, 400);
    }

    const [emailOwner] = await db.select().from(users).where(eq(users.email, email));
    if (emailOwner && emailOwner.id !== driver.id) {
      return c.json({ error: "A user with that email already exists." }, 409);
    }

    const nextActive = active ?? driver.active;
    await db
      .update(users)
      .set({ name, email, companyName, active: nextActive })
      .where(eq(users.id, driver.id));
    if (active === false) {
      await db.delete(sessions).where(eq(sessions.userId, driver.id));
    }

    return c.json({
      driver: toDriver({ ...driver, name, email, companyName, active: nextActive }),
    });
  });

  app.post("/api/drivers/import", signedIn, admin, async (c) => {
    const body = await readJson(c);
    const csv = body ? textField(body, "csv") : "";
    if (!csv) {
      return c.json({ error: "Choose a CSV file to import." }, 400);
    }
    if (csv.length > maxImportCharacters) {
      return c.json({ error: "That file is too large to import." }, 400);
    }

    const records = parseCsv(csv);
    const header = records[0];
    if (!header) {
      return c.json({ error: "The first row must include name, email, and password." }, 400);
    }
    const nameIndex = columnIndex(header.cells, ["name"]);
    const emailIndex = columnIndex(header.cells, ["email"]);
    const passwordIndex = columnIndex(header.cells, ["password"]);
    if (nameIndex === -1 || emailIndex === -1 || passwordIndex === -1) {
      return c.json({ error: "The first row must include name, email, and password." }, 400);
    }
    const companyIndex = columnIndex(header.cells, ["companyname", "company"]);
    const activeIndex = columnIndex(header.cells, ["active", "status"]);
    const rows = records.slice(1);
    if (rows.length === 0) {
      return c.json({ error: "Add at least one driver under the header row." }, 400);
    }
    if (rows.length > maxImportRows) {
      return c.json({ error: `Import ${maxImportRows} rows or fewer.` }, 400);
    }

    const result: ImportResult = { created: 0, updated: 0, errors: [] };
    for (const row of rows) {
      const name = cell(row.cells, nameIndex);
      const email = cell(row.cells, emailIndex).toLowerCase();
      const password = cell(row.cells, passwordIndex);
      const companyName = companyIndex === -1 ? null : cell(row.cells, companyIndex) || null;
      const active = parseActive(activeIndex === -1 ? undefined : cell(row.cells, activeIndex));
      if (!name || !email) {
        result.errors.push({ line: row.line, message: "Enter a name and email." });
        continue;
      }
      if (!validEmail(email)) {
        result.errors.push({ line: row.line, message: "Enter a valid email." });
        continue;
      }
      if (activeIndex !== -1 && cell(row.cells, activeIndex) && active === undefined) {
        result.errors.push({ line: row.line, message: "Use active or inactive in the active column." });
        continue;
      }

      const [match] = await db.select().from(users).where(eq(users.email, email));
      if (match && match.role !== "driver") {
        result.errors.push({ line: row.line, message: "That email belongs to a manager or admin." });
        continue;
      }
      if (!match && password.length < 8) {
        result.errors.push({ line: row.line, message: "New drivers need a password of at least 8 characters." });
        continue;
      }
      if (match && password && password.length < 8) {
        result.errors.push({ line: row.line, message: "Use a password of at least 8 characters." });
        continue;
      }

      if (match) {
        await db
          .update(users)
          .set({
            name,
            companyName: companyIndex === -1 ? match.companyName : companyName,
            active: active ?? match.active,
            ...(password ? { passwordHash: await hashPassword(password) } : {}),
          })
          .where(eq(users.id, match.id));
        if (password || active === false) {
          await db.delete(sessions).where(eq(sessions.userId, match.id));
        }
        result.updated += 1;
      } else {
        await db.insert(users).values({
          id: randomUUID(),
          name,
          email,
          passwordHash: await hashPassword(password),
          role: "driver",
          companyName,
          active: active ?? true,
          createdAt: new Date().toISOString(),
        });
        result.created += 1;
      }
    }

    return c.json(result);
  });
}
