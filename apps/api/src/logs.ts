import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Context, Hono } from "hono";
import type { DriverLog, DriverLogLine, LogType } from "@cws/shared";
import type { AppEnv } from "./app-env";
import { requireRole, requireUser } from "./auth";
import { issueInvoice } from "./invoices";
import { buildLogPdf } from "./pdf";
import type { CwsDatabase } from "./db/client";
import { corrections, driverLogs, invoices, logLines, routeDays, users } from "./db/schema";
import { validServiceDate } from "./stop-source";

const maxLines = 40;
const maxText = 200;

type LineDraft = {
  ticketDate: string;
  companyName: string;
  companyNameOrBooking: string;
  multiStopLoad: boolean;
  ticketNumber: string;
  terminalEmptyOut: string;
  chassisNumber: string;
  containerNumber: string;
  terminalLoadIn: string;
  comments: string;
  priceCents: number | null;
};

function textValue(value: string | null): string {
  return value ?? "";
}

function toLine(line: typeof logLines.$inferSelect): DriverLogLine {
  return {
    id: line.id,
    sequence: line.sequence,
    ticketDate: textValue(line.ticketDate),
    companyName: textValue(line.companyName),
    companyNameOrBooking: textValue(line.companyNameOrBooking),
    multiStopLoad: line.multiStopLoad,
    ticketNumber: textValue(line.ticketNumber),
    terminalEmptyOut: textValue(line.terminalEmptyOut),
    chassisNumber: textValue(line.chassisNumber),
    containerNumber: textValue(line.containerNumber),
    terminalLoadIn: textValue(line.terminalLoadIn),
    comments: textValue(line.comments),
    priceCents: line.priceCents,
  };
}

async function presentLog(db: CwsDatabase, log: typeof driverLogs.$inferSelect): Promise<DriverLog> {
  const lines = (await db.select().from(logLines).where(eq(logLines.logId, log.id))).sort(
    (a, b) => a.sequence - b.sequence,
  );
  const people = await db.select().from(users);
  const history = (await db.select().from(corrections).where(eq(corrections.logId, log.id))).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const nameOf = (userId: string) => people.find((person) => person.id === userId)?.name ?? "User";
  const [invoice] = await db.select().from(invoices).where(eq(invoices.logId, log.id));
  return {
    id: log.id,
    driverName: nameOf(log.driverUserId),
    logType: log.logType,
    serviceDate: log.serviceDate,
    status: log.status,
    driverCompanyName: log.driverCompanyName,
    datePaid: log.datePaid,
    paymentDateFriday: log.paymentDateFriday,
    submittedAt: log.submittedAt,
    lines: lines.map(toLine),
    corrections: history.map((entry) => ({
      id: entry.id,
      lineId: entry.lineId,
      fieldKey: entry.fieldKey,
      previousValue: entry.previousValue,
      newValue: entry.newValue,
      authorName: nameOf(entry.authorUserId),
      createdAt: entry.createdAt,
    })),
    invoice: invoice
      ? { id: invoice.id, invoiceNumber: invoice.invoiceNumber, sentToAccountingAt: invoice.sentToAccountingAt }
      : null,
  };
}

async function loadLog(db: CwsDatabase, driverUserId: string, serviceDate: string): Promise<DriverLog | null> {
  const [log] = await db
    .select()
    .from(driverLogs)
    .where(and(eq(driverLogs.driverUserId, driverUserId), eq(driverLogs.serviceDate, serviceDate)));
  return log ? presentLog(db, log) : null;
}

export async function loadLogById(db: CwsDatabase, logId: string): Promise<DriverLog | null> {
  const [log] = await db.select().from(driverLogs).where(eq(driverLogs.id, logId));
  return log ? presentLog(db, log) : null;
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

function readLine(value: unknown): LineDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const price = row.priceCents;
  if (price !== null && (typeof price !== "number" || !Number.isInteger(price) || price < 0 || price > 100_000_000)) {
    return null;
  }
  const text = (key: string) => (typeof row[key] === "string" ? row[key].trim().slice(0, maxText) : "");
  const ticketDate = text("ticketDate");
  if (ticketDate && !validServiceDate(ticketDate)) {
    return null;
  }
  if (typeof row.multiStopLoad !== "boolean") {
    return null;
  }
  return {
    ticketDate,
    companyName: text("companyName"),
    companyNameOrBooking: text("companyNameOrBooking"),
    multiStopLoad: row.multiStopLoad,
    ticketNumber: text("ticketNumber"),
    terminalEmptyOut: text("terminalEmptyOut"),
    chassisNumber: text("chassisNumber"),
    containerNumber: text("containerNumber"),
    terminalLoadIn: text("terminalLoadIn"),
    comments: text("comments"),
    priceCents: price,
  };
}

function storedLine(line: LineDraft, logType: LogType) {
  const port = logType === "port";
  return {
    ticketDate: line.ticketDate || null,
    companyName: port ? null : line.companyName || null,
    companyNameOrBooking: port ? line.companyNameOrBooking || null : null,
    multiStopLoad: line.multiStopLoad,
    ticketNumber: line.ticketNumber || null,
    terminalEmptyOut: port ? line.terminalEmptyOut || null : null,
    chassisNumber: port ? line.chassisNumber || null : null,
    containerNumber: port ? line.containerNumber || null : null,
    terminalLoadIn: port ? line.terminalLoadIn || null : null,
    comments: port ? line.comments || null : null,
    priceCents: line.priceCents,
  };
}

function submitError(logType: LogType, companyName: string, lines: LineDraft[]): string | null {
  if (!companyName) {
    return "Enter the driver or company name.";
  }
  if (lines.length === 0) {
    return "Add at least one line before submitting.";
  }
  for (const [index, line] of lines.entries()) {
    const label = `Line ${index + 1}`;
    if (!validServiceDate(line.ticketDate)) {
      return `${label} needs the ticket date.`;
    }
    if (!line.ticketNumber) {
      return `${label} needs a ticket number.`;
    }
    if (line.priceCents === null) {
      return `${label} needs a price.`;
    }
    if (logType === "non_port" && !line.companyName) {
      return `${label} needs a company name.`;
    }
    if (logType === "port" && !line.companyNameOrBooking) {
      return `${label} needs a company name or booking number.`;
    }
  }
  return null;
}

export function registerLogs(app: Hono<AppEnv>, db: CwsDatabase) {
  const signedIn = requireUser(db);
  const staff = requireRole("admin", "manager");

  app.get("/api/logs", signedIn, async (c) => {
    const user = c.get("user");
    if (user.role !== "driver") {
      return c.json({ error: "Drivers fill the log." }, 403);
    }
    const serviceDate = c.req.query("date") ?? "";
    if (!validServiceDate(serviceDate)) {
      return c.json({ error: "Choose a service date." }, 400);
    }
    return c.json({ log: await loadLog(db, user.id, serviceDate) });
  });

  app.put("/api/logs", signedIn, async (c) => {
    const user = c.get("user");
    if (user.role !== "driver") {
      return c.json({ error: "Drivers fill the log." }, 403);
    }
    const body = await readJson(c);
    const serviceDate = typeof body?.serviceDate === "string" ? body.serviceDate : "";
    const requestedType = body?.logType;
    const driverCompanyName = typeof body?.driverCompanyName === "string" ? body.driverCompanyName.trim().slice(0, maxText) : "";
    if (
      !validServiceDate(serviceDate) ||
      (requestedType !== "port" && requestedType !== "non_port") ||
      !Array.isArray(body?.lines)
    ) {
      return c.json({ error: "Choose a log type and service date." }, 400);
    }
    const logType: LogType = requestedType;
    if (body.lines.length > maxLines) {
      return c.json({ error: "A log can hold 40 lines." }, 400);
    }
    const lines: LineDraft[] = [];
    for (const row of body.lines) {
      const line = readLine(row);
      if (!line) {
        return c.json({ error: "Check the line items and prices." }, 400);
      }
      lines.push(line);
    }

    const existing = await loadLog(db, user.id, serviceDate);
    if (existing && existing.status !== "draft") {
      return c.json({ error: "This log is locked." }, 409);
    }

    const now = new Date().toISOString();
    const [route] = await db
      .select()
      .from(routeDays)
      .where(and(eq(routeDays.driverUserId, user.id), eq(routeDays.serviceDate, serviceDate)));
    const logId = existing?.id ?? randomUUID();

    await db.transaction(async (tx) => {
      if (existing) {
        await tx
          .update(driverLogs)
          .set({
            logType,
            driverCompanyName,
            routeDayId: route?.id ?? null,
            updatedAt: now,
          })
          .where(eq(driverLogs.id, logId));
        await tx.delete(logLines).where(eq(logLines.logId, logId));
      } else {
        await tx.insert(driverLogs).values({
          id: logId,
          driverUserId: user.id,
          routeDayId: route?.id ?? null,
          logType,
          serviceDate,
          status: "draft",
          driverCompanyName,
          datePaid: null,
          paymentDateFriday: null,
          submittedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      for (const [index, line] of lines.entries()) {
        await tx.insert(logLines).values({
          id: randomUUID(),
          logId,
          sequence: index + 1,
          ...storedLine(line, logType),
        });
      }
    });

    return c.json({ log: await loadLog(db, user.id, serviceDate) });
  });

  app.post("/api/logs/:id/submit", signedIn, async (c) => {
    const user = c.get("user");
    if (user.role !== "driver") {
      return c.json({ error: "Drivers fill the log." }, 403);
    }
    const [row] = await db.select().from(driverLogs).where(eq(driverLogs.id, c.req.param("id")));
    if (!row || row.driverUserId !== user.id) {
      return c.json({ error: "Log not found." }, 404);
    }
    if (row.status !== "draft") {
      return c.json({ error: "This log is already submitted." }, 409);
    }
    const log = await loadLog(db, user.id, row.serviceDate);
    if (!log) {
      return c.json({ error: "Log not found." }, 404);
    }
    const problem = submitError(
      log.logType,
      log.driverCompanyName.trim(),
      log.lines.map((line) => ({ ...line, priceCents: line.priceCents })),
    );
    if (problem) {
      return c.json({ error: problem }, 400);
    }
    const now = new Date().toISOString();
    await db
      .update(driverLogs)
      .set({ status: "submitted", submittedAt: now, updatedAt: now })
      .where(eq(driverLogs.id, row.id));
    return c.json({ log: await loadLog(db, user.id, row.serviceDate) });
  });

  app.get("/api/logs/review", signedIn, staff, async (c) => {
    const rows = await db.select().from(driverLogs);
    const people = await db.select().from(users);
    const nameOf = (userId: string) => people.find((person) => person.id === userId)?.name ?? "Driver";
    const logs = rows
      .filter((log) => log.status !== "draft")
      .map((log) => ({
        id: log.id,
        driverName: nameOf(log.driverUserId),
        serviceDate: log.serviceDate,
        logType: log.logType,
        status: log.status,
        driverCompanyName: log.driverCompanyName,
      }))
      .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || a.driverName.localeCompare(b.driverName));
    return c.json({ logs });
  });

  app.get("/api/logs/:id/pdf", signedIn, staff, async (c) => {
    const log = await loadLogById(db, c.req.param("id"));
    if (!log || log.status === "draft") {
      return c.json({ error: "Log not found." }, 404);
    }
    const bytes = await buildLogPdf(log);
    return c.body(Buffer.from(bytes), 200, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="log-${log.serviceDate}.pdf"`,
    });
  });

  app.get("/api/logs/:id", signedIn, async (c) => {
    const user = c.get("user");
    const log = await loadLogById(db, c.req.param("id"));
    if (!log) {
      return c.json({ error: "Log not found." }, 404);
    }
    const [row] = await db.select().from(driverLogs).where(eq(driverLogs.id, log.id));
    if (user.role === "driver" && row?.driverUserId !== user.id) {
      return c.json({ error: "Log not found." }, 404);
    }
    if (user.role === "driver") {
      return c.json({ log });
    }
    if (user.role !== "admin" && user.role !== "manager") {
      return c.json({ error: "Log not found." }, 404);
    }
    return c.json({ log });
  });

  app.post("/api/logs/:id/complete", signedIn, staff, async (c) => {
    const body = await readJson(c);
    const paymentDate = typeof body?.paymentDate === "string" ? body.paymentDate : "";
    if (!validServiceDate(paymentDate)) {
      return c.json({ error: "Enter the payment date." }, 400);
    }
    const [row] = await db.select().from(driverLogs).where(eq(driverLogs.id, c.req.param("id")));
    if (!row) {
      return c.json({ error: "Log not found." }, 404);
    }
    if (row.status === "draft") {
      return c.json({ error: "The driver has not submitted this log." }, 409);
    }
    if (row.status !== "submitted") {
      return c.json({ error: "This log is already complete." }, 409);
    }
    const current = await loadLogById(db, row.id);
    if (!current) {
      return c.json({ error: "Log not found." }, 404);
    }
    const invoice = await issueInvoice(db, current, paymentDate);
    return c.json({ log: await loadLogById(db, row.id), invoice });
  });

  app.post("/api/logs/:id/corrections", signedIn, staff, async (c) => {
    const body = await readJson(c);
    const [row] = await db.select().from(driverLogs).where(eq(driverLogs.id, c.req.param("id")));
    if (!row) {
      return c.json({ error: "Log not found." }, 404);
    }
    if (row.status === "draft" || row.status === "submitted") {
      return c.json({ error: "Complete the payment date before correcting the log." }, 409);
    }
    const current = await loadLogById(db, row.id);
    if (!current || !body) {
      return c.json({ error: "Log not found." }, 404);
    }
    const companyName =
      typeof body.driverCompanyName === "string" ? body.driverCompanyName.trim().slice(0, maxText) : current.driverCompanyName;
    const paymentDate = typeof body.paymentDate === "string" ? body.paymentDate : "";
    if (paymentDate && !validServiceDate(paymentDate)) {
      return c.json({ error: "Enter a real payment date." }, 400);
    }
    if (!Array.isArray(body.lines)) {
      return c.json({ error: "Include every line on the log." }, 400);
    }
    const incoming = new Map<string, LineDraft>();
    for (const item of body.lines) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return c.json({ error: "Check the line items and prices." }, 400);
      }
      const id = typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id : "";
      const line = readLine(item);
      if (!id || !line) {
        return c.json({ error: "Check the line items and prices." }, 400);
      }
      incoming.set(id, line);
    }
    if (current.lines.some((line) => !incoming.has(line.id)) || incoming.size !== current.lines.length) {
      return c.json({ error: "Include every line on the log." }, 400);
    }

    const now = new Date().toISOString();
    const changes: {
      lineId: string | null;
      fieldKey: string;
      previousValue: string | null;
      newValue: string | null;
    }[] = [];
    const track = (lineId: string | null, fieldKey: string, previousValue: string | null, newValue: string | null) => {
      if ((previousValue ?? "") === (newValue ?? "")) {
        return;
      }
      changes.push({ lineId, fieldKey, previousValue, newValue });
    };

    track(null, "driverCompanyName", current.driverCompanyName, companyName);
    const paymentKey = current.logType === "port" ? "paymentDateFriday" : "datePaid";
    const paymentCurrent = current.logType === "port" ? current.paymentDateFriday : current.datePaid;
    if (paymentDate) {
      track(null, paymentKey, paymentCurrent, paymentDate);
    }

    for (const line of current.lines) {
      const next = incoming.get(line.id);
      if (!next) {
        continue;
      }
      const before = storedLine(
        {
          ticketDate: line.ticketDate,
          companyName: line.companyName,
          companyNameOrBooking: line.companyNameOrBooking,
          multiStopLoad: line.multiStopLoad,
          ticketNumber: line.ticketNumber,
          terminalEmptyOut: line.terminalEmptyOut,
          chassisNumber: line.chassisNumber,
          containerNumber: line.containerNumber,
          terminalLoadIn: line.terminalLoadIn,
          comments: line.comments,
          priceCents: line.priceCents,
        },
        current.logType,
      );
      const after = storedLine(next, current.logType);
      for (const key of Object.keys(after) as (keyof typeof after)[]) {
        const previous = before[key];
        const value = after[key];
        track(line.id, key === "priceCents" ? "price" : key, previous === null || previous === undefined ? null : String(previous), value === null || value === undefined ? null : String(value));
      }
    }

    if (changes.length === 0) {
      return c.json({ error: "Nothing changed." }, 400);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(driverLogs)
        .set({
          driverCompanyName: companyName,
          datePaid: paymentKey === "datePaid" && paymentDate ? paymentDate : row.datePaid,
          paymentDateFriday: paymentKey === "paymentDateFriday" && paymentDate ? paymentDate : row.paymentDateFriday,
          status: row.status === "invoiced" ? "invoiced" : "corrected",
          updatedAt: now,
        })
        .where(eq(driverLogs.id, row.id));
      for (const line of current.lines) {
        const next = incoming.get(line.id);
        if (!next) {
          continue;
        }
        await tx.update(logLines).set(storedLine(next, current.logType)).where(eq(logLines.id, line.id));
      }
      for (const change of changes) {
        await tx.insert(corrections).values({
          id: randomUUID(),
          logId: row.id,
          lineId: change.lineId,
          fieldKey: change.fieldKey,
          previousValue: change.previousValue,
          newValue: change.newValue,
          authorUserId: c.get("user").id,
          createdAt: now,
        });
      }
    });

    return c.json({ log: await loadLogById(db, row.id) });
  });
}
