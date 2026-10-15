import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { RouteImportResult, RouteSource } from "@cws/shared";
import type { CwsDatabase } from "./db/client";
import { customers, routeDays, statusEvents, stops, users } from "./db/schema";
import { notifyDriver } from "./notifications";
import type { StopPlan } from "./stop-source";

export async function applyPlan(
  db: CwsDatabase,
  plan: StopPlan,
  authorUserId: string,
  result: RouteImportResult,
  source: RouteSource = "csv",
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
      await tx.update(routeDays).set({ source }).where(eq(routeDays.id, existing.id));
    } else {
      await tx.insert(routeDays).values({
        id: routeId,
        driverUserId: driver.id,
        serviceDate: plan.serviceDate,
        source,
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
