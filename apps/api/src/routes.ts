import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Context, Hono } from "hono";
import type { AssignedRoute, AssignedStop, RouteImportResult, RouteSource, StopStatus } from "@cws/shared";
import type { AppEnv } from "./app-env";
import { requireRole, requireUser } from "./auth";
import type { CwsDatabase } from "./db/client";
import { customers, routeDays, statusEvents, stopNotes, stopPhotos, stops, users } from "./db/schema";
import { notifyDriver } from "./notifications";
import { csvStopSource, netsuiteStopSource, stopSources, StopSourceError, validServiceDate, type StopPlan } from "./stop-source";

const maxImportCharacters = 1_000_000;

function textField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

async function readJson(c: Context): Promise<Record<string, unknown> | null> {
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

function toStop(
  stop: typeof stops.$inferSelect,
  detail?: Pick<AssignedStop, "notes" | "photos" | "history">,
): AssignedStop {
  return {
    id: stop.id,
    sequence: stop.sequence,
    customerId: stop.customerId,
    customerName: stop.customerName,
    address: stop.address,
    pickupDescription: stop.pickupDescription,
    status: stop.status,
    notes: detail?.notes ?? [],
    photos: detail?.photos ?? [],
    history: detail?.history ?? [],
  };
}

async function routesForDate(db: CwsDatabase, serviceDate: string): Promise<AssignedRoute[]> {
  const days = await db.select().from(routeDays).where(eq(routeDays.serviceDate, serviceDate));
  const people = await db.select().from(users);
  const dayStops = await db.select().from(stops);
  const notes = await db.select().from(stopNotes);
  const photos = await db.select().from(stopPhotos);
  const history = await db.select().from(statusEvents);
  const nameOf = (userId: string) => people.find((person) => person.id === userId)?.name ?? "User";

  return days
    .map((day) => ({
      id: day.id,
      driverUserId: day.driverUserId,
      driverName: nameOf(day.driverUserId),
      serviceDate: day.serviceDate,
      source: day.source,
      stops: dayStops
        .filter((stop) => stop.routeDayId === day.id)
        .sort((a, b) => a.sequence - b.sequence)
        .map((stop) =>
          toStop(stop, {
            notes: notes
              .filter((note) => note.stopId === stop.id)
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
              .map((note) => ({
                id: note.id,
                body: note.body,
                createdAt: note.createdAt,
                authorName: nameOf(note.authorUserId),
              })),
            photos: photos
              .filter((photo) => photo.stopId === stop.id)
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
              .map((photo) => ({ id: photo.id, createdAt: photo.createdAt })),
            history: history
              .filter((event) => event.stopId === stop.id)
              .sort((a, b) => a.changedAt.localeCompare(b.changedAt))
              .map((event) => ({
                id: event.id,
                fromStatus: event.fromStatus,
                toStatus: event.toStatus,
                changedAt: event.changedAt,
                changedByName: nameOf(event.changedByUserId),
              })),
          }),
        ),
    }))
    .sort((a, b) => a.driverName.localeCompare(b.driverName));
}

async function renumber(db: CwsDatabase, routeDayId: string) {
  const current = (await db.select().from(stops).where(eq(stops.routeDayId, routeDayId))).sort(
    (a, b) => a.sequence - b.sequence,
  );
  for (const stop of current) {
    await db.update(stops).set({ sequence: -stop.sequence - 1 }).where(eq(stops.id, stop.id));
  }
  for (const [index, stop] of current.entries()) {
    await db.update(stops).set({ sequence: index + 1 }).where(eq(stops.id, stop.id));
  }
}

async function applyPlan(
  db: CwsDatabase,
  plan: StopPlan,
  authorUserId: string,
  result: RouteImportResult,
) {
  const [driver] = await db.select().from(users).where(eq(users.email, plan.driverEmail));
  const firstLine = plan.stops[0]?.line ?? 1;
  if (!driver || driver.role !== "driver") {
    result.errors.push({ line: firstLine, message: "No driver uses that email." });
    return;
  }
  if (!driver.active) {
    result.errors.push({ line: firstLine, message: `${driver.name} is inactive.` });
    return;
  }

  const directory = await db.select().from(customers);
  const resolved: {
    line: number;
    sequence: number;
    customerId: string | null;
    customerName: string;
    address: string;
    pickupDescription: string;
  }[] = [];
  for (const stop of plan.stops) {
    const location = directory.find((customer) => customer.name.toLowerCase() === stop.customerName.toLowerCase());
    if (location && !location.active) {
      result.errors.push({ line: stop.line, message: `${location.name} is inactive.` });
      continue;
    }
    const address = stop.address || location?.address || "";
    if (!address) {
      result.errors.push({
        line: stop.line,
        message: "Enter an address, or use a location name from the directory.",
      });
      continue;
    }
    resolved.push({
      line: stop.line,
      sequence: stop.sequence,
      customerId: location?.id ?? null,
      customerName: location?.name ?? stop.customerName,
      address,
      pickupDescription: stop.pickupDescription,
    });
  }
  if (resolved.length !== plan.stops.length) {
    return;
  }

  const [existing] = await db
    .select()
    .from(routeDays)
    .where(and(eq(routeDays.driverUserId, driver.id), eq(routeDays.serviceDate, plan.serviceDate)));
  if (existing) {
    const current = await db.select().from(stops).where(eq(stops.routeDayId, existing.id));
    if (current.some((stop) => stop.status !== "not_started")) {
      result.errors.push({
        line: firstLine,
        message: `${driver.name} already started stops on ${plan.serviceDate}.`,
      });
      return;
    }
  }

  const now = new Date().toISOString();
  const routeId = existing?.id ?? randomUUID();
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.delete(stops).where(eq(stops.routeDayId, existing.id));
      await tx.update(routeDays).set({ source: "csv" }).where(eq(routeDays.id, existing.id));
    } else {
      await tx.insert(routeDays).values({
        id: routeId,
        driverUserId: driver.id,
        serviceDate: plan.serviceDate,
        source: "csv",
        createdAt: now,
      });
    }
    for (const stop of resolved) {
      const stopId = randomUUID();
      await tx.insert(stops).values({
        id: stopId,
        routeDayId: routeId,
        customerId: stop.customerId,
        sequence: stop.sequence,
        customerName: stop.customerName,
        address: stop.address,
        pickupDescription: stop.pickupDescription,
        status: "not_started",
        createdAt: now,
      });
      await tx.insert(statusEvents).values({
        id: randomUUID(),
        stopId,
        fromStatus: null,
        toStatus: "not_started",
        changedAt: now,
        changedByUserId: authorUserId,
      });
    }
  });

  if (existing) {
    result.replacedRoutes += 1;
  } else {
    result.createdRoutes += 1;
  }
  result.stops += resolved.length;
  await notifyDriver(db, {
    userId: driver.id,
    type: existing ? "route_updated" : "route_assigned",
    message: existing
      ? `Your stops for ${plan.serviceDate} were replaced.`
      : `Your stops for ${plan.serviceDate} are ready.`,
    serviceDate: plan.serviceDate,
    routeDayId: routeId,
  });
}

export function registerRoutes(app: Hono<AppEnv>, db: CwsDatabase) {
  const signedIn = requireUser(db);
  const staff = requireRole("admin", "manager");

  app.get("/api/route-sources", signedIn, staff, (c) => c.json({ sources: stopSources }));

  app.get("/api/routes/drivers", signedIn, staff, async (c) => {
    const drivers = (await db.select().from(users).where(eq(users.role, "driver")))
      .filter((driver) => driver.active)
      .map((driver) => ({ id: driver.id, name: driver.name, email: driver.email }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return c.json({ drivers });
  });

  app.get("/api/routes", signedIn, staff, async (c) => {
    const serviceDate = c.req.query("date") ?? "";
    if (!validServiceDate(serviceDate)) {
      return c.json({ error: "Choose a service date." }, 400);
    }
    return c.json({ date: serviceDate, routes: await routesForDate(db, serviceDate) });
  });

  app.post("/api/routes/import", signedIn, staff, async (c) => {
    const body = await readJson(c);
    const csv = body ? textField(body, "csv") : "";
    if (!csv) {
      return c.json({ error: "Choose a CSV file to import." }, 400);
    }
    if (csv.length > maxImportCharacters) {
      return c.json({ error: "That file is too large to import." }, 400);
    }
    try {
      const planned = csvStopSource.plan(csv);
      const result: RouteImportResult = {
        createdRoutes: 0,
        replacedRoutes: 0,
        stops: 0,
        errors: planned.errors,
      };
      if (planned.plans.length === 0 && planned.errors.length === 0) {
        return c.json({ error: "Add at least one stop under the header row." }, 400);
      }
      for (const plan of planned.plans) {
        await applyPlan(db, plan, c.get("user").id, result);
      }
      return c.json(result);
    } catch (error) {
      if (error instanceof StopSourceError) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  });

  app.post("/api/routes/netsuite", signedIn, staff, (c) => {
    try {
      netsuiteStopSource.plan("");
    } catch (error) {
      if (error instanceof StopSourceError) {
        return c.json({ error: error.message }, 409);
      }
      throw error;
    }
    return c.json({ error: "NetSuite is not connected." }, 409);
  });

  app.post("/api/routes/stops", signedIn, staff, async (c) => {
    const body = await readJson(c);
    if (!body) {
      return c.json({ error: "Choose a driver, date, and pickup." }, 400);
    }
    const driverUserId = textField(body, "driverUserId");
    const serviceDate = textField(body, "serviceDate");
    const customerId = textField(body, "customerId");
    const pickupDescription = textField(body, "pickupDescription");
    let customerName = textField(body, "customerName");
    let address = textField(body, "address");
    if (!driverUserId || !validServiceDate(serviceDate) || !pickupDescription) {
      return c.json({ error: "Choose a driver, date, and pickup." }, 400);
    }

    const [driver] = await db.select().from(users).where(eq(users.id, driverUserId));
    if (!driver || driver.role !== "driver" || !driver.active) {
      return c.json({ error: "Choose an active driver." }, 400);
    }

    let linkedCustomerId: string | null = null;
    if (customerId) {
      const [location] = await db.select().from(customers).where(eq(customers.id, customerId));
      if (!location || !location.active) {
        return c.json({ error: "Choose an active location." }, 400);
      }
      linkedCustomerId = location.id;
      customerName = location.name;
      address = address || location.address;
    }
    if (!customerName || !address) {
      return c.json({ error: "Enter a customer name and address." }, 400);
    }

    const now = new Date().toISOString();
    const [existing] = await db
      .select()
      .from(routeDays)
      .where(and(eq(routeDays.driverUserId, driver.id), eq(routeDays.serviceDate, serviceDate)));
    const routeId = existing?.id ?? randomUUID();
    const current = existing ? await db.select().from(stops).where(eq(stops.routeDayId, existing.id)) : [];
    const sequence = current.reduce((max, stop) => Math.max(max, stop.sequence), 0) + 1;
    const stopId = randomUUID();

    await db.transaction(async (tx) => {
      if (!existing) {
        await tx.insert(routeDays).values({
          id: routeId,
          driverUserId: driver.id,
          serviceDate,
          source: "manual" satisfies RouteSource,
          createdAt: now,
        });
      }
      await tx.insert(stops).values({
        id: stopId,
        routeDayId: routeId,
        customerId: linkedCustomerId,
        sequence,
        customerName,
        address,
        pickupDescription,
        status: "not_started" satisfies StopStatus,
        createdAt: now,
      });
      await tx.insert(statusEvents).values({
        id: randomUUID(),
        stopId,
        fromStatus: null,
        toStatus: "not_started",
        changedAt: now,
        changedByUserId: c.get("user").id,
      });
    });

    await notifyDriver(db, {
      userId: driver.id,
      type: existing ? "route_updated" : "route_assigned",
      message: existing
        ? `${customerName} was added to ${serviceDate}.`
        : `Your stops for ${serviceDate} are ready.`,
      serviceDate,
      routeDayId: routeId,
    });

    const [created] = await db.select().from(stops).where(eq(stops.id, stopId));
    return c.json({ stop: created ? toStop(created) : null }, 201);
  });

  app.post("/api/routes/:id/order", signedIn, staff, async (c) => {
    const body = await readJson(c);
    const stopIds = Array.isArray(body?.stopIds) ? body.stopIds.filter((id): id is string => typeof id === "string") : [];
    const [route] = await db.select().from(routeDays).where(eq(routeDays.id, c.req.param("id")));
    if (!route) {
      return c.json({ error: "Route not found." }, 404);
    }
    const current = (await db.select().from(stops).where(eq(stops.routeDayId, route.id))).sort(
      (a, b) => a.sequence - b.sequence,
    );
    const currentIds = new Set(current.map((stop) => stop.id));
    if (stopIds.length !== current.length || stopIds.some((id) => !currentIds.has(id))) {
      return c.json({ error: "Include every stop on the route." }, 400);
    }
    const orderChanged = current.some((stop, index) => stop.id !== stopIds[index]);
    for (const [index, stop] of current.entries()) {
      await db.update(stops).set({ sequence: -(index + 1) }).where(eq(stops.id, stop.id));
    }
    for (const [index, stopId] of stopIds.entries()) {
      await db.update(stops).set({ sequence: index + 1 }).where(eq(stops.id, stopId));
    }
    if (orderChanged) {
      await notifyDriver(db, {
        userId: route.driverUserId,
        type: "route_updated",
        message: `Your stop order for ${route.serviceDate} changed.`,
        serviceDate: route.serviceDate,
        routeDayId: route.id,
      });
    }
    return c.json({ routes: await routesForDate(db, route.serviceDate) });
  });

  app.delete("/api/stops/:id", signedIn, staff, async (c) => {
    const [stop] = await db.select().from(stops).where(eq(stops.id, c.req.param("id")));
    if (!stop) {
      return c.json({ error: "Stop not found." }, 404);
    }
    if (stop.status !== "not_started") {
      return c.json({ error: "This stop has already started." }, 409);
    }
    const [route] = await db.select().from(routeDays).where(eq(routeDays.id, stop.routeDayId));
    await db.delete(stops).where(eq(stops.id, stop.id));
    await renumber(db, stop.routeDayId);
    if (route) {
      await notifyDriver(db, {
        userId: route.driverUserId,
        type: "route_updated",
        message: `${stop.customerName} was removed from ${route.serviceDate}.`,
        serviceDate: route.serviceDate,
        routeDayId: route.id,
      });
    }
    return c.json({ ok: true });
  });
}
