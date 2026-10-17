import type { Context, Hono } from "hono";
import type { CompletedStop, CompletedStopReport, StatusDurationAverage, StopStatus } from "@cws/shared";
import { isServiceType, stopStatuses } from "@cws/shared";
import type { AppEnv } from "./app-env";
import { requireRole, requireUser } from "./auth";
import type { CwsDatabase } from "./db/client";
import { routeDays, statusEvents, stopNotes, stopPhotos, stops, users } from "./db/schema";
import { validServiceDate } from "./stop-source";

type Filters = {
  driver: string;
  customer: string;
  from: string;
  to: string;
};

export function registerReports(app: Hono<AppEnv>, db: CwsDatabase) {
  const signedIn = requireUser(db);
  const staff = requireRole("admin", "manager");

  app.get("/api/reports/stops", signedIn, staff, async (c) => {
    const filters = readFilters(c);
    if ("error" in filters) {
      return c.json({ error: filters.error }, 400);
    }
    return c.json(await completedStopReport(db, filters));
  });

  app.get("/api/reports/stops.csv", signedIn, staff, async (c) => {
    const filters = readFilters(c);
    if ("error" in filters) {
      return c.json({ error: filters.error }, 400);
    }
    const report = await completedStopReport(db, filters);
    return c.body(reportCsv(report), 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="completed-stops.csv"',
    });
  });
}

function readFilters(c: Context): Filters | { error: string } {
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  if ((from && !validServiceDate(from)) || (to && !validServiceDate(to))) {
    return { error: "Choose a service date." };
  }
  if (from && to && from > to) {
    return { error: "Choose a start date on or before the end date." };
  }
  return {
    driver: (c.req.query("driver") ?? "").trim().toLowerCase(),
    customer: (c.req.query("customer") ?? "").trim().toLowerCase(),
    from,
    to,
  };
}

async function completedStopReport(db: CwsDatabase, filters: Filters): Promise<CompletedStopReport> {
  const days = await db.select().from(routeDays);
  const people = await db.select().from(users);
  const dayStops = await db.select().from(stops);
  const notes = await db.select().from(stopNotes);
  const photos = await db.select().from(stopPhotos);
  const history = await db.select().from(statusEvents);
  const nameOf = (userId: string) => people.find((person) => person.id === userId)?.name ?? "User";

  const rows = dayStops.flatMap((stop) => {
    if (stop.status !== "completed") {
      return [];
    }
    const day = days.find((item) => item.id === stop.routeDayId);
    if (!day) {
      return [];
    }
    if (filters.from && day.serviceDate < filters.from) {
      return [];
    }
    if (filters.to && day.serviceDate > filters.to) {
      return [];
    }
    const driverName = nameOf(day.driverUserId);
    if (filters.driver && !driverName.toLowerCase().includes(filters.driver)) {
      return [];
    }
    if (filters.customer && !stop.customerName.toLowerCase().includes(filters.customer)) {
      return [];
    }
    const row: CompletedStop = {
      id: stop.id,
      sequence: stop.sequence,
      serviceDate: day.serviceDate,
      driverName,
      customerName: stop.customerName,
      address: stop.address,
      serviceType: isServiceType(stop.serviceType) ? stop.serviceType : "remove",
      quantity: stop.quantity,
      driverNotes: stop.driverNotes,
      pickupDescription: stop.pickupDescription,
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
    };
    return [row];
  });

  rows.sort(
    (a, b) => b.serviceDate.localeCompare(a.serviceDate) || a.driverName.localeCompare(b.driverName) || a.sequence - b.sequence,
  );
  return { stops: rows, averages: durationAverages(rows) };
}

function durationAverages(rows: CompletedStop[]): StatusDurationAverage[] {
  const groups = new Map<string, { fromStatus: StopStatus; toStatus: StopStatus; minutes: number[] }>();
  for (const stop of rows) {
    for (const gap of statusGaps(stop)) {
      const key = `${gap.fromStatus}|${gap.toStatus}`;
      const group = groups.get(key) ?? { fromStatus: gap.fromStatus, toStatus: gap.toStatus, minutes: [] };
      group.minutes.push(gap.minutes);
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .map((group) => ({
      fromStatus: group.fromStatus,
      toStatus: group.toStatus,
      averageMinutes: Math.round((group.minutes.reduce((total, minutes) => total + minutes, 0) / group.minutes.length) * 10) / 10,
      samples: group.minutes.length,
    }))
    .sort(
      (a, b) =>
        stopStatuses.indexOf(a.fromStatus) - stopStatuses.indexOf(b.fromStatus) ||
        stopStatuses.indexOf(a.toStatus) - stopStatuses.indexOf(b.toStatus),
    );
}

function statusGaps(stop: CompletedStop): { fromStatus: StopStatus; toStatus: StopStatus; minutes: number }[] {
  const gaps = [];
  for (let index = 1; index < stop.history.length; index += 1) {
    const previous = stop.history[index - 1];
    const current = stop.history[index];
    if (!previous || !current) {
      continue;
    }
    const minutes = (Date.parse(current.changedAt) - Date.parse(previous.changedAt)) / 60_000;
    if (!Number.isFinite(minutes) || minutes < 0) {
      continue;
    }
    gaps.push({ fromStatus: previous.toStatus, toStatus: current.toStatus, minutes });
  }
  return gaps;
}

function reportCsv(report: CompletedStopReport): string {
  const header = [
    "Service date",
    "Driver",
    "Customer",
    "Address",
    "Pickup",
    "Notes",
    "Photos",
    "En route",
    "Completed",
    "Minutes en route to completed",
  ];
  const lines = report.stops.map((stop) => {
    const enRoute = stop.history.find((change) => change.toStatus === "en_route")?.changedAt ?? "";
    const completed = stop.history.find((change) => change.toStatus === "completed")?.changedAt ?? "";
    const minutes = statusGaps(stop).find((gap) => gap.fromStatus === "en_route" && gap.toStatus === "completed");
    return [
      stop.serviceDate,
      stop.driverName,
      stop.customerName,
      stop.address,
      stop.pickupDescription,
      stop.notes
        .map((note) => note.body.replaceAll("\n", " "))
        .join(" | "),
      stop.photos.length,
      enRoute,
      completed,
      minutes ? String(Math.round(minutes.minutes * 10) / 10) : "",
    ].map(csvCell);
  });
  return `\uFEFF${[header.map(csvCell), ...lines].map((line) => line.join(",")).join("\n")}\n`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
