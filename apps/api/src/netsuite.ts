import { eq } from "drizzle-orm";
import type { Context, Hono } from "hono";
import type {
  DispatchImportPreview,
  DispatchImportRow,
  NetSuiteConnection,
  NetSuiteCredentialSlot,
  NetSuiteSearchColumn,
  RouteImportResult,
} from "@cws/shared";
import type { AppEnv } from "./app-env";
import { requireRole, requireUser } from "./auth";
import type { CwsDatabase } from "./db/client";
import {
  dispatchReportHeaders,
  dispatchRowsToCsv,
  formatDispatchAddress,
  matchDriversToDispatch,
  normalizeDriverKey,
  parseDispatchMatrix,
} from "./dispatch-report";
import { routeDays, stops, users } from "./db/schema";
import { applyPlan } from "./route-apply";
import type { StopPlan } from "./stop-source";
import { validServiceDate } from "./stop-source";
import { matrixFromSpreadsheet, workbookFromDispatchRows } from "./spreadsheet";

const credentialFields: { key: string; label: string; env: string }[] = [
  { key: "accountId", label: "Account ID", env: "NETSUITE_ACCOUNT_ID" },
  { key: "consumerKey", label: "Consumer key", env: "NETSUITE_CONSUMER_KEY" },
  { key: "consumerSecret", label: "Consumer secret", env: "NETSUITE_CONSUMER_SECRET" },
  { key: "tokenId", label: "Token ID", env: "NETSUITE_TOKEN_ID" },
  { key: "tokenSecret", label: "Token secret", env: "NETSUITE_TOKEN_SECRET" },
];

const savedSearchColumns: NetSuiteSearchColumn[] = [
  { field: "driver", label: "Driver", column: "Driver", required: true },
  { field: "serviceDate", label: "Date", column: "Date", required: true },
  { field: "customer", label: "Customer", column: "Customer", required: true },
  { field: "address", label: "Address", column: "Address", required: false },
  { field: "city", label: "City", column: "City", required: false },
  { field: "commodity", label: "Commodity", column: "Commodity", required: false },
  { field: "action", label: "Action", column: "Action", required: false },
  { field: "stop", label: "Stop", column: "Stop", required: false },
];

export function netSuiteConnection(): NetSuiteConnection {
  const credentials: NetSuiteCredentialSlot[] = credentialFields.map((field) => ({
    key: field.key,
    label: field.label,
    configured: Boolean(process.env[field.env]?.trim()),
  }));
  return {
    connected: true,
    mode: "dispatch_file",
    message: "Import or export a NetSuite Dispatch Truck Report (.xlsx or .csv), then assign drivers.",
    credentials,
    savedSearch: {
      id: process.env.NETSUITE_SAVED_SEARCH_ID?.trim() ?? "",
      columns: savedSearchColumns,
    },
    dispatchColumns: [...dispatchReportHeaders],
  };
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

async function activeDrivers(db: CwsDatabase) {
  return (await db.select().from(users).where(eq(users.role, "driver")))
    .filter((driver) => driver.active)
    .map((driver) => ({ id: driver.id, name: driver.name, email: driver.email }));
}

function plansFromDispatch(
  rows: DispatchImportRow[],
  assignments: Record<string, string>,
  drivers: { id: string; name: string; email: string }[],
): { plans: StopPlan[]; errors: { line: number; message: string }[] } {
  const byId = new Map(drivers.map((driver) => [driver.id, driver]));
  const errors: { line: number; message: string }[] = [];
  const groups = new Map<string, { email: string; serviceDate: string; stops: StopPlan["stops"] }>();

  for (const row of rows) {
    const assignedId = assignments[row.driverName] ?? assignments[normalizeDriverKey(row.driverName)];
    const matched = matchDriversToDispatch([row], drivers)[0];
    const driverId = assignedId || matched?.driverId;
    const driver = driverId ? byId.get(driverId) : undefined;
    if (!driver) {
      errors.push({
        line: row.line,
        message: `Assign a portal driver for “${row.driverName}”.`,
      });
      continue;
    }
    const key = `${driver.email}|${row.serviceDate}`;
    const group = groups.get(key) ?? { email: driver.email, serviceDate: row.serviceDate, stops: [] };
    group.stops.push({
      line: row.line,
      sequence: row.sequence,
      customerName: row.customerName,
      address: formatDispatchAddress(row.address, row.city),
      pickupDescription: row.pickupDescription,
    });
    groups.set(key, group);
  }

  const plans: StopPlan[] = [...groups.values()].map((group) => ({
    driverEmail: group.email,
    serviceDate: group.serviceDate,
    stops: group.stops
      .sort((a, b) => a.sequence - b.sequence || a.line - b.line)
      .map((stop, index) => ({ ...stop, sequence: stop.sequence || index + 1 })),
  }));

  return { plans, errors };
}

async function exportDispatchRows(db: CwsDatabase, from: string, to: string): Promise<Record<string, string>[]> {
  const days = (await db.select().from(routeDays)).filter(
    (day) => day.serviceDate >= from && day.serviceDate <= to,
  );
  const people = await db.select().from(users);
  const allStops = await db.select().from(stops);
  const nameOf = (userId: string) => people.find((person) => person.id === userId)?.name ?? "Driver";

  const rows: Record<string, string>[] = [];
  for (const day of days.sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.id.localeCompare(b.id))) {
    const dayStops = allStops
      .filter((stop) => stop.routeDayId === day.id)
      .sort((a, b) => a.sequence - b.sequence);
    for (const stop of dayStops) {
      const [street, ...cityParts] = stop.address.split(",").map((part) => part.trim());
      const city = cityParts.join(", ");
      const pickupParts = stop.pickupDescription.split(" · ").map((part) => part.trim());
      rows.push({
        Driver: nameOf(day.driverUserId),
        "In/Out": "",
        "N° Dispatch": "",
        Run: "1",
        Stop: String(stop.sequence),
        Date: day.serviceDate,
        Customer: stop.customerName,
        Address: street || stop.address,
        City: city,
        Destination: "",
        Commodity: pickupParts[1] || pickupParts[0] || stop.pickupDescription,
        "Container Type": "",
        "Container Qty": "",
        Action: pickupParts[0] && pickupParts.length > 1 ? pickupParts[0] : "",
        "Dispatch notes": pickupParts.slice(2).join(" · "),
        "Dispatch type": "",
        Priority: "",
        "Dispatched By": "",
      });
    }
  }
  return rows;
}

export function registerNetSuite(app: Hono<AppEnv>, db: CwsDatabase) {
  const signedIn = requireUser(db);
  const staff = requireRole("admin", "manager");
  const admin = requireRole("admin");

  app.get("/api/netsuite", signedIn, staff, (c) => c.json(netSuiteConnection()));

  app.post("/api/netsuite/dispatch/preview", signedIn, staff, async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      return c.json({ error: "Choose an Excel or CSV Dispatch Truck Report to import." }, 400);
    }
    try {
      const bytes = await file.arrayBuffer();
      const matrix = await matrixFromSpreadsheet(bytes, file.name || "dispatch.xlsx");
      const parsed = parseDispatchMatrix(matrix);
      const drivers = await activeDrivers(db);
      const preview: DispatchImportPreview = {
        rows: parsed.rows,
        errors: parsed.errors,
        drivers: matchDriversToDispatch(parsed.rows, drivers),
      };
      if (preview.rows.length === 0 && preview.errors.length === 0) {
        return c.json({ error: "Add at least one dispatch row under the header." }, 400);
      }
      return c.json(preview);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Could not read that file." }, 400);
    }
  });

  app.post("/api/netsuite/dispatch/import", signedIn, staff, async (c) => {
    const body = await readJson(c);
    if (!body || !Array.isArray(body.rows)) {
      return c.json({ error: "Preview the dispatch file, assign drivers, then import." }, 400);
    }
    const rows = body.rows as DispatchImportRow[];
    const assignments =
      body.assignments && typeof body.assignments === "object" && !Array.isArray(body.assignments)
        ? (body.assignments as Record<string, string>)
        : {};
    const drivers = await activeDrivers(db);
    const planned = plansFromDispatch(rows, assignments, drivers);
    const result: RouteImportResult = {
      createdRoutes: 0,
      replacedRoutes: 0,
      stops: 0,
      errors: [...planned.errors],
    };
    if (planned.plans.length === 0) {
      return c.json(
        result.errors.length > 0 ? result : { error: "Assign at least one driver before importing." },
        result.errors.length > 0 ? 200 : 400,
      );
    }
    for (const plan of planned.plans) {
      await applyPlan(db, plan, c.get("user").id, result, "netsuite");
    }
    return c.json(result);
  });

  app.get("/api/netsuite/dispatch/export", signedIn, staff, async (c) => {
    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? from;
    const format = (c.req.query("format") ?? "xlsx").toLowerCase();
    if (!validServiceDate(from) || !validServiceDate(to) || from > to) {
      return c.json({ error: "Choose a valid from/to service date." }, 400);
    }
    const rows = await exportDispatchRows(db, from, to);
    if (format === "csv") {
      const csv = dispatchRowsToCsv(rows);
      return c.body(csv, 200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="dispatch_truck_report_${from}_to_${to}.csv"`,
      });
    }
    const workbook = await workbookFromDispatchRows(rows);
    return c.body(new Uint8Array(workbook), 200, {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="dispatch_truck_report_${from}_to_${to}.xlsx"`,
    });
  });

  // Kept for older clients / tests that probed live NetSuite pull.
  app.post("/api/routes/netsuite", signedIn, staff, (c) =>
    c.json(
      {
        error: "Import a Dispatch Truck Report from the NetSuite page instead of pulling live NetSuite data.",
      },
      409,
    ),
  );

  // Admin-only credential probe remains available under the same connection payload.
  app.get("/api/netsuite/admin", signedIn, admin, (c) => c.json(netSuiteConnection()));
}
