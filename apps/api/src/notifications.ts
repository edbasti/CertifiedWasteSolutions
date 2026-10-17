import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import type { AppNotification, NotificationType } from "@cws/shared";
import type { AppEnv } from "./app-env";
import { requireUser } from "./auth";
import type { CwsDatabase } from "./db/client";
import { notifications, routeDays, stops } from "./db/schema";

const notificationTypes = new Set<NotificationType>(["route_assigned", "route_updated"]);

export async function notifyDriver(
  db: CwsDatabase,
  input: {
    userId: string;
    type: NotificationType;
    message: string;
    serviceDate: string;
    routeDayId: string;
  },
) {
  await db.insert(notifications).values({
    id: randomUUID(),
    userId: input.userId,
    type: input.type,
    payload: JSON.stringify({
      message: input.message,
      serviceDate: input.serviceDate,
      routeDayId: input.routeDayId,
    }),
    readAt: null,
    createdAt: new Date().toISOString(),
  });
}

function toNotification(row: typeof notifications.$inferSelect): AppNotification | null {
  if (!notificationTypes.has(row.type as NotificationType)) {
    return null;
  }
  let payload: { message?: unknown; serviceDate?: unknown; routeDayId?: unknown };
  try {
    payload = JSON.parse(row.payload) as typeof payload;
  } catch {
    return null;
  }
  return {
    id: row.id,
    type: row.type as NotificationType,
    message: typeof payload.message === "string" ? payload.message : "Your route changed.",
    serviceDate: typeof payload.serviceDate === "string" ? payload.serviceDate : "",
    routeDayId: typeof payload.routeDayId === "string" ? payload.routeDayId : null,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export function registerNotifications(app: Hono<AppEnv>, db: CwsDatabase) {
  const signedIn = requireUser(db);

  app.get("/api/notifications", signedIn, async (c) => {
    const user = c.get("user");
    const rows = (await db.select().from(notifications).where(eq(notifications.userId, user.id))).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    );
    const days = await db.select().from(routeDays).where(eq(routeDays.driverUserId, user.id));
    const dayStops = await db.select().from(stops);
    const completedDates = new Set(
      days
        .filter((day) => {
          const forDay = dayStops.filter((stop) => stop.routeDayId === day.id);
          return forDay.length > 0 && forDay.every((stop) => stop.status === "completed");
        })
        .map((day) => day.serviceDate),
    );
    return c.json({
      notifications: rows.flatMap((row) => {
        const notice = toNotification(row);
        if (!notice || notice.readAt || (notice.serviceDate && completedDates.has(notice.serviceDate))) {
          return [];
        }
        return [notice];
      }),
    });
  });

  app.post("/api/notifications/:id/read", signedIn, async (c) => {
    const [row] = await db.select().from(notifications).where(eq(notifications.id, c.req.param("id")));
    if (!row || row.userId !== c.get("user").id) {
      return c.json({ error: "Notification not found." }, 404);
    }
    if (!row.readAt) {
      await db.update(notifications).set({ readAt: new Date().toISOString() }).where(eq(notifications.id, row.id));
    }
    const [updated] = await db.select().from(notifications).where(eq(notifications.id, row.id));
    const notice = updated ? toNotification(updated) : null;
    if (!notice) {
      return c.json({ error: "Notification not found." }, 404);
    }
    return c.json({ notification: notice });
  });
}
