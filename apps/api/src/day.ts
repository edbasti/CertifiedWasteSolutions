import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import type { Context, Hono } from "hono";
import type { DriverDay, DriverStop, StopStatus } from "@cws/shared";
import type { AppEnv } from "./app-env";
import { requireUser } from "./auth";
import type { CwsDatabase } from "./db/client";
import { routeDays, statusEvents, stopNotes, stopPhotos, stops } from "./db/schema";
import { validServiceDate } from "./stop-source";

const maxPhotoBytes = 6_000_000;
const nextStatus: Record<StopStatus, StopStatus | null> = {
  not_started: "en_route",
  en_route: "completed",
  completed: null,
};

const previousStatus: Record<StopStatus, StopStatus | null> = {
  not_started: null,
  en_route: "not_started",
  completed: "en_route",
};

export function photoDirectory() {
  if (process.env.PHOTO_DIR) {
    return process.env.PHOTO_DIR;
  }
  if (process.env.VERCEL) {
    return "/tmp/cws-photos";
  }
  return fileURLToPath(new URL("../../../data/photos", import.meta.url));
}

function imageType(bytes: Uint8Array): { extension: string; contentType: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { extension: "png", contentType: "image/png" };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }
  return null;
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

async function ownedStop(db: CwsDatabase, driverUserId: string, stopId: string) {
  const [stop] = await db.select().from(stops).where(eq(stops.id, stopId));
  if (!stop) {
    return null;
  }
  const [route] = await db.select().from(routeDays).where(eq(routeDays.id, stop.routeDayId));
  if (!route || route.driverUserId !== driverUserId) {
    return null;
  }
  return { stop, route };
}

export async function loadDriverDay(db: CwsDatabase, driverUserId: string, serviceDate: string): Promise<DriverDay> {
  const [route] = await db
    .select()
    .from(routeDays)
    .where(and(eq(routeDays.driverUserId, driverUserId), eq(routeDays.serviceDate, serviceDate)));
  if (!route) {
    return { date: serviceDate, routeId: null, stops: [] };
  }

  const dayStops = (await db.select().from(stops).where(eq(stops.routeDayId, route.id))).sort(
    (a, b) => a.sequence - b.sequence,
  );
  const notes = await db.select().from(stopNotes);
  const photos = await db.select().from(stopPhotos);
  const history = await db.select().from(statusEvents);
  const stopsForDay: DriverStop[] = dayStops.map((stop) => ({
    id: stop.id,
    sequence: stop.sequence,
    customerName: stop.customerName,
    address: stop.address,
    pickupDescription: stop.pickupDescription,
    status: stop.status,
    notes: notes
      .filter((note) => note.stopId === stop.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((note) => ({ id: note.id, body: note.body, createdAt: note.createdAt })),
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
      })),
  }));

  return { date: serviceDate, routeId: route.id, stops: stopsForDay };
}

export function registerDay(app: Hono<AppEnv>, db: CwsDatabase) {
  const signedIn = requireUser(db);

  app.get("/api/day", signedIn, async (c) => {
    const user = c.get("user");
    if (user.role !== "driver") {
      return c.json({ error: "Drivers open the route day." }, 403);
    }
    const serviceDate = c.req.query("date") ?? "";
    if (!validServiceDate(serviceDate)) {
      return c.json({ error: "Choose a service date." }, 400);
    }
    return c.json(await loadDriverDay(db, user.id, serviceDate));
  });

  app.post("/api/day/order", signedIn, async (c) => {
    const user = c.get("user");
    if (user.role !== "driver") {
      return c.json({ error: "Drivers open the route day." }, 403);
    }
    const body = await readJson(c);
    const serviceDate = typeof body?.date === "string" ? body.date : "";
    const stopIds = Array.isArray(body?.stopIds) ? body.stopIds.filter((id): id is string => typeof id === "string") : [];
    if (!validServiceDate(serviceDate)) {
      return c.json({ error: "Choose a service date." }, 400);
    }
    const day = await loadDriverDay(db, user.id, serviceDate);
    if (!day.routeId) {
      return c.json({ error: "No stops are assigned for this date." }, 404);
    }
    const currentIds = new Set(day.stops.map((stop) => stop.id));
    if (stopIds.length !== day.stops.length || stopIds.some((id) => !currentIds.has(id))) {
      return c.json({ error: "Include every stop on the route." }, 400);
    }
    for (const [index, stop] of day.stops.entries()) {
      await db.update(stops).set({ sequence: -(index + 1) }).where(eq(stops.id, stop.id));
    }
    for (const [index, stopId] of stopIds.entries()) {
      await db.update(stops).set({ sequence: index + 1 }).where(eq(stops.id, stopId));
    }
    return c.json(await loadDriverDay(db, user.id, serviceDate));
  });

  app.post("/api/stops/:id/status", signedIn, async (c) => {
    const user = c.get("user");
    if (user.role !== "driver") {
      return c.json({ error: "Drivers open the route day." }, 403);
    }
    const owned = await ownedStop(db, user.id, c.req.param("id"));
    if (!owned) {
      return c.json({ error: "Stop not found." }, 404);
    }
    const body = await readJson(c);
    const requested = body?.status;
    const forward = nextStatus[owned.stop.status];
    const back = previousStatus[owned.stop.status];
    const status = requested === forward || requested === back ? (requested as StopStatus) : null;
    if (!status) {
      if (!forward && !back) {
        return c.json({ error: "This stop cannot change status." }, 409);
      }
      return c.json({ error: "Update the stop one step at a time." }, 409);
    }
    const now = new Date().toISOString();
    await db.update(stops).set({ status }).where(eq(stops.id, owned.stop.id));
    await db.insert(statusEvents).values({
      id: randomUUID(),
      stopId: owned.stop.id,
      fromStatus: owned.stop.status,
      toStatus: status,
      changedAt: now,
      changedByUserId: user.id,
    });
    return c.json(await loadDriverDay(db, user.id, owned.route.serviceDate));
  });

  app.post("/api/stops/:id/notes", signedIn, async (c) => {
    const user = c.get("user");
    if (user.role !== "driver") {
      return c.json({ error: "Drivers open the route day." }, 403);
    }
    const owned = await ownedStop(db, user.id, c.req.param("id"));
    if (!owned) {
      return c.json({ error: "Stop not found." }, 404);
    }
    const body = await readJson(c);
    const note = typeof body?.body === "string" ? body.body.trim() : "";
    if (!note) {
      return c.json({ error: "Write a note before saving." }, 400);
    }
    if (note.length > 2000) {
      return c.json({ error: "Keep the note under 2000 characters." }, 400);
    }
    await db.insert(stopNotes).values({
      id: randomUUID(),
      stopId: owned.stop.id,
      body: note,
      authorUserId: user.id,
      createdAt: new Date().toISOString(),
    });
    return c.json(await loadDriverDay(db, user.id, owned.route.serviceDate));
  });

  app.post("/api/stops/:id/photos", signedIn, async (c) => {
    const user = c.get("user");
    if (user.role !== "driver") {
      return c.json({ error: "Drivers open the route day." }, 403);
    }
    const owned = await ownedStop(db, user.id, c.req.param("id"));
    if (!owned) {
      return c.json({ error: "Stop not found." }, 404);
    }
    const form = await c.req.parseBody({ all: true });
    const uploaded = form.photos;
    const files = (Array.isArray(uploaded) ? uploaded : uploaded ? [uploaded] : []).filter(
      (file): file is File => file instanceof File,
    );
    if (files.length === 0) {
      return c.json({ error: "Choose a photo." }, 400);
    }
    if (files.length > 8) {
      return c.json({ error: "Upload 8 photos or fewer at a time." }, 400);
    }

    const accepted: { bytes: Uint8Array; extension: string }[] = [];
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const kind = imageType(bytes);
      if (!kind || bytes.byteLength > maxPhotoBytes) {
        return c.json({ error: "Use a JPEG, PNG, or WebP photo under 6 MB." }, 400);
      }
      accepted.push({ bytes, extension: kind.extension });
    }

    const directory = photoDirectory();
    await mkdir(directory, { recursive: true });
    const now = new Date().toISOString();
    for (const photo of accepted) {
      const id = randomUUID();
      const filename = `${id}.${photo.extension}`;
      await writeFile(join(directory, filename), photo.bytes);
      await db.insert(stopPhotos).values({
        id,
        stopId: owned.stop.id,
        storagePath: filename,
        authorUserId: user.id,
        createdAt: now,
      });
    }
    return c.json(await loadDriverDay(db, user.id, owned.route.serviceDate));
  });

  app.get("/api/photos/:id", signedIn, async (c) => {
    const user = c.get("user");
    const [photo] = await db.select().from(stopPhotos).where(eq(stopPhotos.id, c.req.param("id")));
    if (!photo) {
      return c.json({ error: "Photo not found." }, 404);
    }
    const owned = await ownedStop(db, photo.authorUserId, photo.stopId);
    const canView = user.role === "admin" || user.role === "manager" || user.id === owned?.route.driverUserId;
    if (!owned || !canView) {
      return c.json({ error: "Photo not found." }, 404);
    }
    const filename = basename(photo.storagePath);
    const bytes = await readFile(join(photoDirectory(), filename));
    const kind = imageType(bytes);
    return c.body(bytes, 200, { "content-type": kind?.contentType ?? "application/octet-stream" });
  });
}
