import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import type { Hono } from "hono";
import type { DriverLog, InvoiceRecord } from "@cws/shared";
import type { AppEnv } from "./app-env";
import { requireRole, requireUser } from "./auth";
import type { CwsDatabase } from "./db/client";
import { driverLogs, invoices, logLines, users } from "./db/schema";
import { deliverInvoice, MailConfigError } from "./mail";
import { buildInvoicePdf, priceTotalCents } from "./pdf";
import { validServiceDate } from "./stop-source";

export function invoiceDirectory() {
  if (process.env.INVOICE_DIR) {
    return process.env.INVOICE_DIR;
  }
  if (process.env.VERCEL) {
    return "/tmp/cws-invoices";
  }
  return fileURLToPath(new URL("../../../data/invoices", import.meta.url));
}

export async function issueInvoice(db: CwsDatabase, log: DriverLog, paymentDate: string): Promise<InvoiceRecord> {
  const existing = await db.select().from(invoices);
  const invoiceNumber = `INV-${log.serviceDate.replaceAll("-", "")}-${String(existing.length + 1).padStart(3, "0")}`;
  const id = randomUUID();
  const filename = `${id}.pdf`;
  const bytes = await buildInvoicePdf(log, invoiceNumber);
  const directory = invoiceDirectory();
  await mkdir(directory, { recursive: true });
  const path = join(directory, filename);
  await writeFile(path, bytes);
  const now = new Date().toISOString();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(driverLogs)
        .set({
          datePaid: log.logType === "non_port" ? paymentDate : log.datePaid,
          paymentDateFriday: log.logType === "port" ? paymentDate : log.paymentDateFriday,
          status: "invoiced",
          updatedAt: now,
        })
        .where(eq(driverLogs.id, log.id));
      await tx.insert(invoices).values({
        id,
        logId: log.id,
        invoiceNumber,
        pdfPath: filename,
        createdAt: now,
        sentToAccountingAt: null,
      });
    });
  } catch (error) {
    await rm(path, { force: true });
    throw error;
  }
  return {
    id,
    logId: log.id,
    invoiceNumber,
    driverName: log.driverName,
    serviceDate: log.serviceDate,
    logType: log.logType,
    priceTotalCents: priceTotalCents(log),
    createdAt: now,
    sentToAccountingAt: null,
  };
}

export function registerInvoices(app: Hono<AppEnv>, db: CwsDatabase) {
  const signedIn = requireUser(db);
  const staff = requireRole("admin", "manager");

  app.get("/api/invoices", signedIn, staff, async (c) => {
    const driverQuery = (c.req.query("driver") ?? "").trim().toLowerCase();
    const serviceDate = c.req.query("date") ?? "";
    if (serviceDate && !validServiceDate(serviceDate)) {
      return c.json({ error: "Choose a service date." }, 400);
    }
    const rows = await db.select().from(invoices);
    const logs = await db.select().from(driverLogs);
    const lines = await db.select().from(logLines);
    const people = await db.select().from(users);
    const invoicesForSearch: InvoiceRecord[] = rows
      .flatMap((invoice) => {
        const log = logs.find((item) => item.id === invoice.logId);
        if (!log) {
          return [];
        }
        const driverName = people.find((person) => person.id === log.driverUserId)?.name ?? "Driver";
        if (driverQuery && !driverName.toLowerCase().includes(driverQuery)) {
          return [];
        }
        if (serviceDate && log.serviceDate !== serviceDate) {
          return [];
        }
        return [
          {
            id: invoice.id,
            logId: log.id,
            invoiceNumber: invoice.invoiceNumber,
            driverName,
            serviceDate: log.serviceDate,
            logType: log.logType,
            priceTotalCents: lines
              .filter((line) => line.logId === log.id)
              .reduce((total, line) => total + (line.priceCents ?? 0), 0),
            createdAt: invoice.createdAt,
            sentToAccountingAt: invoice.sentToAccountingAt,
          },
        ];
      })
      .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || a.driverName.localeCompare(b.driverName));
    return c.json({ invoices: invoicesForSearch });
  });

  app.get("/api/invoices/:id/pdf", signedIn, staff, async (c) => {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, c.req.param("id")));
    if (!invoice?.pdfPath) {
      return c.json({ error: "Invoice not found." }, 404);
    }
    const bytes = await readFile(join(invoiceDirectory(), basename(invoice.pdfPath)));
    return c.body(bytes, 200, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    });
  });

  app.post("/api/invoices/:id/send", signedIn, staff, async (c) => {
    const record = await invoiceById(db, c.req.param("id"));
    if (!record) {
      return c.json({ error: "Invoice not found." }, 404);
    }
    if (record.sentToAccountingAt) {
      return c.json({ error: "This invoice was already sent to accounting." }, 409);
    }
    const [stored] = await db.select().from(invoices).where(eq(invoices.id, record.id));
    if (!stored?.pdfPath) {
      return c.json({ error: "Invoice not found." }, 404);
    }
    const pdf = await readFile(join(invoiceDirectory(), basename(stored.pdfPath)));
    let emailed = false;
    try {
      emailed = await deliverInvoice({
        subject: `Invoice ${record.invoiceNumber}`,
        text: `Invoice ${record.invoiceNumber} for ${record.driverName} on ${record.serviceDate} is attached.`,
        filename: `${record.invoiceNumber}.pdf`,
        pdf,
      });
    } catch (error) {
      if (error instanceof MailConfigError) {
        return c.json({ error: "Accounting email is not fully configured." }, 500);
      }
      return c.json({ error: "The invoice email did not send. It is still available to download." }, 502);
    }
    const sentAt = new Date().toISOString();
    const updated = await db
      .update(invoices)
      .set({ sentToAccountingAt: sentAt })
      .where(and(eq(invoices.id, record.id), isNull(invoices.sentToAccountingAt)))
      .returning();
    const stamped = updated[0]?.sentToAccountingAt;
    if (!stamped) {
      return c.json({ error: "This invoice was already sent to accounting." }, 409);
    }
    return c.json({ invoice: { ...record, sentToAccountingAt: stamped }, emailed });
  });
}

async function invoiceById(db: CwsDatabase, invoiceId: string): Promise<InvoiceRecord | null> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice) {
    return null;
  }
  const [log] = await db.select().from(driverLogs).where(eq(driverLogs.id, invoice.logId));
  if (!log) {
    return null;
  }
  const [driver] = await db.select().from(users).where(eq(users.id, log.driverUserId));
  const lines = await db.select().from(logLines).where(eq(logLines.logId, log.id));
  return {
    id: invoice.id,
    logId: log.id,
    invoiceNumber: invoice.invoiceNumber,
    driverName: driver?.name ?? "Driver",
    serviceDate: log.serviceDate,
    logType: log.logType,
    priceTotalCents: lines.reduce((total, line) => total + (line.priceCents ?? 0), 0),
    createdAt: invoice.createdAt,
    sentToAccountingAt: invoice.sentToAccountingAt,
  };
}
