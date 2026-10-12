import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openTestDatabase } from "./test-client";
import { verifyPassword } from "./password";
import { demoPassword, resetAndSeed, seedIds } from "./seed";
import { corrections, driverLogs, invoices, logLines, stops, users } from "./schema";
import type { CwsDatabase } from "./client";

let db: CwsDatabase;
let close: () => Promise<void>;

beforeAll(async () => {
  const opened = await openTestDatabase();
  db = opened.db;
  close = () => opened.client.close();
  await resetAndSeed(db);
});

afterAll(async () => {
  await close();
});

describe("operations seed", () => {
  it("loads the demo company and Alex's route day", async () => {
    const people = await db.select().from(users);
    const jordan = people.find((person) => person.id === seedIds.jordan);

    expect(people.filter((person) => person.role === "driver")).toHaveLength(2);
    expect(people.filter((person) => person.role === "manager").map((person) => person.name)).toEqual(["Chino"]);
    expect(jordan?.role).toBe("admin");
    expect(jordan && verifyPassword(demoPassword, jordan.passwordHash)).toBe(true);

    const day = await db.select().from(stops).orderBy(stops.sequence);
    expect(day.map((stop) => stop.customerName)).toEqual([
      "Metro Foods",
      "Greenline Nursery",
      "Harbor City Market",
      "Brightway Offices",
    ]);
    expect(day.find((stop) => stop.id === seedIds.stopHarbor)).toMatchObject({
      status: "not_started",
      pickupDescription: "Mixed recycling",
    });
    expect(day.find((stop) => stop.id === seedIds.stopGreenline)?.status).toBe("en_route");
  });

  it("replaces demo data when seeded again", async () => {
    await resetAndSeed(db);
    expect(await db.select().from(users)).toHaveLength(4);
    expect(await db.select().from(stops)).toHaveLength(4);
  });

  it("stores a port log, a correction, and an invoice", async () => {
    await db.insert(driverLogs)
      .values({
        id: "test_log_port",
        driverUserId: seedIds.sam,
        routeDayId: null,
        logType: "port",
        serviceDate: "2026-09-30",
        status: "manager_review",
        driverCompanyName: "Sam Thompson",
        datePaid: null,
        paymentDateFriday: null,
        submittedAt: "2026-09-30T18:00:00.000Z",
        createdAt: "2026-09-30T15:00:00.000Z",
        updatedAt: "2026-09-30T18:00:00.000Z",
      })
    await db.insert(logLines)
      .values({
        id: "test_line_port",
        logId: "test_log_port",
        sequence: 1,
        ticketDate: "2026-09-30",
        companyName: null,
        companyNameOrBooking: "Harbor City Market / BK-9",
        multiStopLoad: true,
        ticketNumber: "DEMO-2002",
        terminalEmptyOut: "Everport",
        chassisNumber: "CH-44",
        containerNumber: "CWSU123456",
        terminalLoadIn: "TRAPAC",
        comments: "Demo port line",
        priceCents: 24000,
      })
    await db.insert(corrections)
      .values({
        id: "test_correction",
        logId: "test_log_port",
        lineId: "test_line_port",
        fieldKey: "comments",
        previousValue: null,
        newValue: "Demo port line",
        authorUserId: seedIds.chino,
        createdAt: "2026-09-30T19:00:00.000Z",
      })
    await db.insert(invoices)
      .values({
        id: "test_invoice",
        logId: "test_log_port",
        invoiceNumber: "INV-DEMO-1",
        pdfPath: null,
        createdAt: "2026-09-30T19:05:00.000Z",
        sentToAccountingAt: null,
      })
    const [line] = await db.select().from(logLines).where(eq(logLines.id, "test_line_port"));
    const [invoice] = await db.select().from(invoices).where(eq(invoices.logId, "test_log_port"));
    const [draft] = await db.select().from(driverLogs).where(eq(driverLogs.id, seedIds.log));

    expect(line?.containerNumber).toBe("CWSU123456");
    expect(invoice?.invoiceNumber).toBe("INV-DEMO-1");
    expect(draft?.status).toBe("draft");
  });
});
