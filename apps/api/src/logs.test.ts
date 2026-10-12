import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DriverLog, InvoiceRecord } from "@cws/shared";
import { createApp } from "./app";
import { installInvoiceDelivery } from "./mail";
import { invoiceDocumentLines, logDocumentLines } from "./pdf";
import { openTestDatabase } from "./db/test-client";
import { demoPassword, resetAndSeed, seedIds } from "./db/seed";

let app: ReturnType<typeof createApp>;
let close: () => Promise<void>;
let invoiceDir = "";

beforeAll(async () => {
  invoiceDir = await mkdtemp(join(tmpdir(), "cws-invoices-"));
  process.env.INVOICE_DIR = invoiceDir;
  const opened = await openTestDatabase();
  close = () => opened.client.close();
  await resetAndSeed(opened.db);
  app = createApp(opened.db);
});

afterAll(async () => {
  await close();
  delete process.env.INVOICE_DIR;
  await rm(invoiceDir, { recursive: true, force: true });
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

describe("driver logs", () => {
  it("lets a driver save a draft, choose the log type, and lock it on submit", async () => {
    expect((await app.request("/api/logs?date=2026-09-30")).status).toBe(401);

    const manager = await login("chino@cws.local");
    const alex = await login("alex.rivera@cws.local");
    const sam = await login("sam.thompson@cws.local");
    expect((await app.request("/api/logs?date=2026-09-30", { headers: { cookie: manager } })).status).toBe(403);

    const seeded = await app.request("/api/logs?date=2026-09-30", { headers: { cookie: alex } });
    const seededBody = (await seeded.json()) as { log: DriverLog };
    expect(seededBody.log).toMatchObject({
      id: seedIds.log,
      logType: "non_port",
      status: "draft",
      driverCompanyName: "Alex Rivera",
      datePaid: null,
      paymentDateFriday: null,
    });
    expect(seededBody.log.lines[0]).toMatchObject({
      ticketNumber: "DEMO-1001",
      companyName: "Metro Foods",
      priceCents: 12500,
    });
    const hidden = await app.request("/api/logs?date=2026-09-30", { headers: { cookie: sam } });
    expect(((await hidden.json()) as { log: DriverLog | null }).log).toBeNull();

    const switched = await app.request("/api/logs", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: alex },
      body: JSON.stringify({
        serviceDate: "2026-09-30",
        logType: "port",
        driverCompanyName: "Alex Rivera",
        datePaid: "2026-10-03",
        lines: [
          {
            ticketDate: "2026-09-30",
            companyName: "Should be cleared",
            companyNameOrBooking: "Harbor booking 14",
            multiStopLoad: true,
            ticketNumber: "PORT-9",
            terminalEmptyOut: "Trapac",
            chassisNumber: "CH-1",
            containerNumber: "CMAU1234567",
            terminalLoadIn: "Everport",
            comments: "Scale lane 2",
            priceCents: 25000,
          },
        ],
      }),
    });
    expect(switched.status).toBe(200);
    const portLog = ((await switched.json()) as { log: DriverLog }).log;
    expect(portLog.logType).toBe("port");
    expect(portLog.datePaid).toBeNull();
    expect(portLog.lines[0]).toMatchObject({
      companyName: "",
      companyNameOrBooking: "Harbor booking 14",
      ticketNumber: "PORT-9",
      priceCents: 25000,
    });

    const incomplete = await app.request(`/api/logs/${portLog.id}/submit`, {
      method: "POST",
      headers: { cookie: alex },
    });
    expect(incomplete.status).toBe(200);

    const locked = await app.request("/api/logs", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: alex },
      body: JSON.stringify({
        serviceDate: "2026-09-30",
        logType: "non_port",
        driverCompanyName: "Changed after submit",
        lines: [],
      }),
    });
    expect(locked.status).toBe(409);

    const created = await app.request("/api/logs", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: sam },
      body: JSON.stringify({
        serviceDate: "2026-10-08",
        logType: "non_port",
        driverCompanyName: "Sam Thompson",
        lines: [
          {
            ticketDate: "2026-10-08",
            companyName: "",
            companyNameOrBooking: "",
            multiStopLoad: false,
            ticketNumber: "",
            terminalEmptyOut: "",
            chassisNumber: "",
            containerNumber: "",
            terminalLoadIn: "",
            comments: "",
            priceCents: null,
          },
        ],
      }),
    });
    expect(created.status).toBe(200);
    const draft = ((await created.json()) as { log: DriverLog }).log;
    expect(draft.status).toBe("draft");
    const rejected = await app.request(`/api/logs/${draft.id}/submit`, {
      method: "POST",
      headers: { cookie: sam },
    });
    expect(rejected.status).toBe(400);
    const stillDraft = await app.request("/api/logs?date=2026-10-08", { headers: { cookie: sam } });
    expect(((await stillDraft.json()) as { log: DriverLog }).log.status).toBe("draft");
  });

  it("lets a manager complete the payment date and record a later correction", async () => {
    const manager = await login("chino@cws.local");
    const alex = await login("alex.rivera@cws.local");
    const saved = await app.request("/api/logs", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: alex },
      body: JSON.stringify({
        serviceDate: "2026-10-09",
        logType: "non_port",
        driverCompanyName: "Alex Rivera",
        lines: [
          {
            ticketDate: "2026-10-09",
            companyName: "Metro Foods",
            companyNameOrBooking: "",
            multiStopLoad: false,
            ticketNumber: "DEMO-2002",
            terminalEmptyOut: "",
            chassisNumber: "",
            containerNumber: "",
            terminalLoadIn: "",
            comments: "",
            priceCents: 12500,
          },
        ],
      }),
    });
    const draft = ((await saved.json()) as { log: DriverLog }).log;
    const submitted = await app.request(`/api/logs/${draft.id}/submit`, { method: "POST", headers: { cookie: alex } });
    expect(submitted.status).toBe(200);

    const early = await app.request(`/api/logs/${draft.id}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: alex },
      body: JSON.stringify({ paymentDate: "2026-10-10" }),
    });
    expect(early.status).toBe(403);

    const queue = await app.request("/api/logs/review", { headers: { cookie: manager } });
    const queueBody = (await queue.json()) as { logs: { id: string; status: string }[] };
    expect(queueBody.logs.some((log) => log.id === draft.id && log.status === "submitted")).toBe(true);

    const missingDate = await app.request(`/api/logs/${draft.id}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({ paymentDate: "" }),
    });
    expect(missingDate.status).toBe(400);

    const completed = await app.request(`/api/logs/${draft.id}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({ paymentDate: "2026-10-10" }),
    });
    expect(completed.status).toBe(200);
    const completedBody = (await completed.json()) as { log: DriverLog; invoice: InvoiceRecord };
    const finished = completedBody.log;
    expect(finished).toMatchObject({ status: "invoiced", datePaid: "2026-10-10", paymentDateFriday: null });
    expect(finished.invoice?.invoiceNumber).toBe("INV-20261009-001");
    expect(finished.corrections).toEqual([]);
    expect(completedBody.invoice).toMatchObject({
      invoiceNumber: "INV-20261009-001",
      driverName: "Alex Rivera",
      serviceDate: "2026-10-09",
      priceTotalCents: 12500,
      sentToAccountingAt: null,
    });

    const denied = await app.request(`/api/invoices/${completedBody.invoice.id}/pdf`, { headers: { cookie: alex } });
    expect(denied.status).toBe(403);
    const invoicePdf = await app.request(`/api/invoices/${completedBody.invoice.id}/pdf`, { headers: { cookie: manager } });
    expect(invoicePdf.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await invoicePdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    const invoiceCopy = invoiceDocumentLines(finished, completedBody.invoice.invoiceNumber).join("\n");
    expect(invoiceCopy).toContain("Alex Rivera");
    expect(invoiceCopy).toContain("Metro Foods");
    expect(invoiceCopy).not.toContain("2026-10-10");

    const logPdf = await app.request(`/api/logs/${draft.id}/pdf`, { headers: { cookie: manager } });
    expect(logPdf.status).toBe(200);
    expect(Buffer.from(await logPdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    expect(logDocumentLines(finished).join("\n")).toContain("2026-10-10");

    const found = await app.request("/api/invoices?driver=alex&date=2026-10-09", { headers: { cookie: manager } });
    const foundBody = (await found.json()) as { invoices: InvoiceRecord[] };
    expect(foundBody.invoices.map((invoice) => invoice.invoiceNumber)).toEqual(["INV-20261009-001"]);
    const missed = await app.request("/api/invoices?driver=sam&date=2026-10-09", { headers: { cookie: manager } });
    expect(((await missed.json()) as { invoices: InvoiceRecord[] }).invoices).toEqual([]);

    process.env.SMTP_HOST = "smtp.example.test";
    try {
      const incomplete = await app.request(`/api/invoices/${completedBody.invoice.id}/send`, {
        method: "POST",
        headers: { cookie: manager },
      });
      expect(incomplete.status).toBe(500);
    } finally {
      delete process.env.SMTP_HOST;
    }
    const stillWaiting = await app.request(`/api/logs/${draft.id}`, { headers: { cookie: manager } });
    expect(((await stillWaiting.json()) as { log: DriverLog }).log.invoice?.sentToAccountingAt).toBeNull();

    const driverSend = await app.request(`/api/invoices/${completedBody.invoice.id}/send`, {
      method: "POST",
      headers: { cookie: alex },
    });
    expect(driverSend.status).toBe(403);

    const marked = await app.request(`/api/invoices/${completedBody.invoice.id}/send`, {
      method: "POST",
      headers: { cookie: manager },
    });
    expect(marked.status).toBe(200);
    const markedBody = (await marked.json()) as { invoice: InvoiceRecord; emailed: boolean };
    expect(markedBody.emailed).toBe(false);
    expect(markedBody.invoice.sentToAccountingAt).toEqual(expect.any(String));
    const again = await app.request(`/api/invoices/${completedBody.invoice.id}/send`, {
      method: "POST",
      headers: { cookie: manager },
    });
    expect(again.status).toBe(409);

    const unchanged = await app.request(`/api/logs/${draft.id}/corrections`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({
        driverCompanyName: finished.driverCompanyName,
        paymentDate: "2026-10-10",
        lines: finished.lines,
      }),
    });
    expect(unchanged.status).toBe(400);

    const corrected = await app.request(`/api/logs/${draft.id}/corrections`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({
        driverCompanyName: finished.driverCompanyName,
        paymentDate: "2026-10-10",
        lines: finished.lines.map((line) => ({ ...line, priceCents: 13000 })),
      }),
    });
    expect(corrected.status).toBe(200);
    const changed = ((await corrected.json()) as { log: DriverLog }).log;
    expect(changed.status).toBe("invoiced");
    expect(changed.lines[0]?.priceCents).toBe(13000);
    expect(changed.corrections[0]).toMatchObject({
      fieldKey: "price",
      previousValue: "12500",
      newValue: "13000",
      authorName: "Chino",
      lineId: finished.lines[0]?.id,
    });

    const driverView = await app.request("/api/logs?date=2026-10-09", { headers: { cookie: alex } });
    const driverLog = ((await driverView.json()) as { log: DriverLog }).log;
    expect(driverLog.datePaid).toBe("2026-10-10");
    expect(driverLog.lines[0]?.priceCents).toBe(13000);
    expect(driverLog.corrections[0]?.previousValue).toBe("12500");
  });

  it("keeps the invoice unsent when email fails, then sends the PDF when delivery works", async () => {
    const manager = await login("chino@cws.local");
    const alex = await login("alex.rivera@cws.local");
    const saved = await app.request("/api/logs", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: alex },
      body: JSON.stringify({
        serviceDate: "2026-10-11",
        logType: "non_port",
        driverCompanyName: "Alex Rivera",
        lines: [
          {
            ticketDate: "2026-10-11",
            companyName: "Metro Foods",
            companyNameOrBooking: "",
            multiStopLoad: false,
            ticketNumber: "DEMO-2003",
            terminalEmptyOut: "",
            chassisNumber: "",
            containerNumber: "",
            terminalLoadIn: "",
            comments: "",
            priceCents: 8000,
          },
        ],
      }),
    });
    const draft = ((await saved.json()) as { log: DriverLog }).log;
    expect((await app.request(`/api/logs/${draft.id}/submit`, { method: "POST", headers: { cookie: alex } })).status).toBe(200);
    const completed = await app.request(`/api/logs/${draft.id}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: manager },
      body: JSON.stringify({ paymentDate: "2026-10-17" }),
    });
    const invoice = ((await completed.json()) as { invoice: InvoiceRecord }).invoice;
    const calls: { subject: string; filename: string; pdf: Buffer }[] = [];
    installInvoiceDelivery(async () => {
      throw new Error("smtp down");
    });
    try {
      const failed = await app.request(`/api/invoices/${invoice.id}/send`, { method: "POST", headers: { cookie: manager } });
      expect(failed.status).toBe(502);
      const waiting = await app.request("/api/invoices?driver=alex&date=2026-10-11", { headers: { cookie: manager } });
      expect(((await waiting.json()) as { invoices: InvoiceRecord[] }).invoices[0]?.sentToAccountingAt).toBeNull();

      installInvoiceDelivery(async (mail) => {
        calls.push({ subject: mail.subject, filename: mail.filename, pdf: mail.pdf });
        return true;
      });
      const sent = await app.request(`/api/invoices/${invoice.id}/send`, { method: "POST", headers: { cookie: manager } });
      expect(sent.status).toBe(200);
      const sentBody = (await sent.json()) as { invoice: InvoiceRecord; emailed: boolean };
      expect(sentBody.emailed).toBe(true);
      expect(sentBody.invoice.sentToAccountingAt).toEqual(expect.any(String));
      expect(calls[0]?.subject).toBe(`Invoice ${invoice.invoiceNumber}`);
      expect(calls[0]?.filename).toBe(`${invoice.invoiceNumber}.pdf`);
      expect(calls[0]?.pdf.subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      installInvoiceDelivery(null);
    }
  });
});
