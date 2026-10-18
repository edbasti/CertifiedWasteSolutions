import { corrections, customers, driverLogs, invoices, logLines, notifications, routeDays, sessions, statusEvents, stopNotes, stopPhotos, stops, users } from "./schema";
import type { CwsDatabase } from "./client";
import { hashPassword } from "./password";

/** Shared demo password for every seeded account. */
export const demoPassword = "demo-password";

export const seedIds = {
  jordan: "seed_user_jordan",
  chino: "seed_user_chino",
  alex: "seed_user_alex",
  sam: "seed_user_sam",
  metro: "seed_customer_metro",
  greenline: "seed_customer_greenline",
  harbor: "seed_customer_harbor",
  brightway: "seed_customer_brightway",
  routeDay: "seed_route_alex",
  stopMetro: "seed_stop_metro",
  stopGreenline: "seed_stop_greenline",
  stopHarbor: "seed_stop_harbor",
  stopBrightway: "seed_stop_brightway",
  log: "seed_log_alex",
  logLine: "seed_log_line_metro",
} as const;

const createdAt = "2026-09-30T15:00:00.000Z";

export async function resetAndSeed(db: CwsDatabase) {
  const passwordHash = await hashPassword(demoPassword);

  await db.transaction(async (tx) => {
    for (const table of [
      sessions,
      invoices,
      corrections,
      logLines,
      driverLogs,
      notifications,
      stopPhotos,
      stopNotes,
      statusEvents,
      stops,
      routeDays,
      customers,
      users,
    ]) {
      await tx.delete(table);
    }

    await tx.insert(users)
      .values([
        {
          id: seedIds.jordan,
          name: "Jordan",
          email: "jordan@cws.local",
          passwordHash,
          role: "admin",
          companyName: null,
          active: true,
          createdAt,
        },
        {
          id: seedIds.chino,
          name: "Chino",
          email: "chino@cws.local",
          passwordHash,
          role: "manager",
          companyName: null,
          active: true,
          createdAt,
        },
        {
          id: seedIds.alex,
          name: "Alex Rivera",
          email: "alex.rivera@cws.local",
          passwordHash,
          role: "driver",
          companyName: "Alex Rivera",
          active: true,
          createdAt,
        },
        {
          id: seedIds.sam,
          name: "Sam Thompson",
          email: "sam.thompson@cws.local",
          passwordHash,
          role: "driver",
          companyName: "Sam Thompson",
          active: true,
          createdAt,
        },
      ])

    await tx.insert(customers)
      .values([
        {
          id: seedIds.metro,
          name: "Metro Foods",
          address: "18 Harbor Industrial Rd, Bayport",
          active: true,
          createdAt,
        },
        {
          id: seedIds.greenline,
          name: "Greenline Nursery",
          address: "2040 Westfield Ave, Bayport",
          active: true,
          createdAt,
        },
        {
          id: seedIds.harbor,
          name: "Harbor City Market",
          address: "7 Dockside Parkway, Bayport",
          active: true,
          createdAt,
        },
        {
          id: seedIds.brightway,
          name: "Brightway Offices",
          address: "95 Lincoln Street, Bayport",
          active: true,
          createdAt,
        },
      ])

    await tx.insert(routeDays)
      .values({
        id: seedIds.routeDay,
        driverUserId: seedIds.alex,
        serviceDate: "2026-09-30",
        source: "manual",
        createdAt,
      })

    await tx.insert(stops)
      .values([
        {
          id: seedIds.stopMetro,
          routeDayId: seedIds.routeDay,
          customerId: seedIds.metro,
          sequence: 1,
          customerName: "Metro Foods",
          address: "18 Harbor Industrial Rd, Bayport",
          serviceType: "remove",
          quantity: 2,
          driverNotes: "Cardboard and plastic",
          pickupDescription: "Remove · Qty 2 · Cardboard and plastic",
          status: "completed",
          createdAt,
        },
        {
          id: seedIds.stopGreenline,
          routeDayId: seedIds.routeDay,
          customerId: seedIds.greenline,
          sequence: 2,
          customerName: "Greenline Nursery",
          address: "2040 Westfield Ave, Bayport",
          serviceType: "swap",
          quantity: 1,
          driverNotes: "Green waste · gate code 1942",
          pickupDescription: "Swap · Qty 1 · Green waste · gate code 1942",
          status: "en_route",
          createdAt,
        },
        {
          id: seedIds.stopHarbor,
          routeDayId: seedIds.routeDay,
          customerId: seedIds.harbor,
          sequence: 3,
          customerName: "Harbor City Market",
          address: "7 Dockside Parkway, Bayport",
          serviceType: "dump_and_return",
          quantity: 1,
          driverNotes: "Mixed recycling",
          pickupDescription: "Dump and Return · Qty 1 · Mixed recycling",
          status: "not_started",
          createdAt,
        },
        {
          id: seedIds.stopBrightway,
          routeDayId: seedIds.routeDay,
          customerId: seedIds.brightway,
          sequence: 4,
          customerName: "Brightway Offices",
          address: "95 Lincoln Street, Bayport",
          serviceType: "delivery",
          quantity: 3,
          driverNotes: "Office paper",
          pickupDescription: "Delivery · Qty 3 · Office paper",
          status: "completed",
          createdAt,
        },
      ])

    await tx.insert(statusEvents)
      .values([
        {
          id: "seed_event_brightway_en_route",
          stopId: seedIds.stopBrightway,
          fromStatus: "not_started",
          toStatus: "en_route",
          changedAt: "2026-09-30T16:50:00.000Z",
          changedByUserId: seedIds.alex,
        },
        {
          id: "seed_event_brightway_completed",
          stopId: seedIds.stopBrightway,
          fromStatus: "en_route",
          toStatus: "completed",
          changedAt: "2026-09-30T17:14:00.000Z",
          changedByUserId: seedIds.alex,
        },
        {
          id: "seed_event_metro_en_route",
          stopId: seedIds.stopMetro,
          fromStatus: "not_started",
          toStatus: "en_route",
          changedAt: "2026-09-30T17:20:00.000Z",
          changedByUserId: seedIds.alex,
        },
        {
          id: "seed_event_metro_completed",
          stopId: seedIds.stopMetro,
          fromStatus: "en_route",
          toStatus: "completed",
          changedAt: "2026-09-30T17:42:00.000Z",
          changedByUserId: seedIds.alex,
        },
        {
          id: "seed_event_greenline_en_route",
          stopId: seedIds.stopGreenline,
          fromStatus: "not_started",
          toStatus: "en_route",
          changedAt: "2026-09-30T17:38:00.000Z",
          changedByUserId: seedIds.alex,
        },
      ])

    await tx.insert(stopNotes)
      .values({
        id: "seed_note_brightway",
        stopId: seedIds.stopBrightway,
        body: "Left the load at the loading dock.",
        authorUserId: seedIds.alex,
        createdAt: "2026-09-30T17:14:00.000Z",
      })

    await tx.insert(notifications)
      .values({
        id: "seed_notice_alex_route",
        userId: seedIds.alex,
        type: "route_assigned",
        payload: JSON.stringify({
          message: "Your stops for 2026-09-30 are ready.",
          serviceDate: "2026-09-30",
          routeDayId: seedIds.routeDay,
        }),
        readAt: null,
        createdAt,
      })

    await tx.insert(driverLogs)
      .values({
        id: seedIds.log,
        driverUserId: seedIds.alex,
        routeDayId: seedIds.routeDay,
        logType: "non_port",
        serviceDate: "2026-09-30",
        status: "draft",
        driverCompanyName: "Alex Rivera",
        datePaid: null,
        paymentDateFriday: null,
        submittedAt: null,
        createdAt,
        updatedAt: createdAt,
      })

    await tx.insert(logLines)
      .values({
        id: seedIds.logLine,
        logId: seedIds.log,
        sequence: 1,
        ticketDate: "2026-09-30",
        companyName: "Metro Foods",
        companyNameOrBooking: null,
        multiStopLoad: false,
        ticketNumber: "DEMO-1001",
        terminalEmptyOut: null,
        chassisNumber: null,
        containerNumber: null,
        terminalLoadIn: null,
        comments: null,
        priceCents: 12500,
      })
  });
}
