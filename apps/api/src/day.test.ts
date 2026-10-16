import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DriverDay } from "@cws/shared";
import { createApp } from "./app";
import { openTestDatabase } from "./db/test-client";
import { demoPassword, resetAndSeed } from "./db/seed";

let app: ReturnType<typeof createApp>;
let close: () => Promise<void>;
let photoDir = "";

const png = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
));

beforeAll(async () => {
  photoDir = await mkdtemp(join(tmpdir(), "cws-photos-"));
  process.env.PHOTO_DIR = photoDir;
  const opened = await openTestDatabase();
  close = () => opened.client.close();
  await resetAndSeed(opened.db);
  app = createApp(opened.db);
});

afterAll(async () => {
  await close();
  delete process.env.PHOTO_DIR;
  await rm(photoDir, { recursive: true, force: true });
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

describe("driver day", () => {
  it("lets the driver start, note, photograph, complete, and renumber a stop", async () => {
    const alex = await login("alex.rivera@cws.local");
    const manager = await login("chino@cws.local");
    expect((await app.request("/api/day?date=2026-09-30", { headers: { cookie: manager } })).status).toBe(403);

    const day = await app.request("/api/day?date=2026-09-30", { headers: { cookie: alex } });
    expect(day.status).toBe(200);
    const body = (await day.json()) as DriverDay;
    expect(body.stops.map((stop) => stop.customerName)).toEqual([
      "Metro Foods",
      "Greenline Nursery",
      "Harbor City Market",
      "Brightway Offices",
    ]);
    const harbor = body.stops.find((stop) => stop.customerName === "Harbor City Market");
    expect(harbor?.status).toBe("not_started");
    expect(harbor?.pickupDescription).toBe("Mixed recycling");

    const started = await app.request(`/api/stops/${harbor?.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: alex },
      body: JSON.stringify({ status: "en_route" }),
    });
    expect(started.status).toBe(200);
    const startedBody = (await started.json()) as DriverDay;
    const startedHarbor = startedBody.stops.find((stop) => stop.id === harbor?.id);
    expect(startedHarbor?.status).toBe("en_route");
    expect(startedHarbor?.history.at(-1)?.toStatus).toBe("en_route");

    const undone = await app.request(`/api/stops/${harbor?.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: alex },
      body: JSON.stringify({ status: "not_started" }),
    });
    expect(undone.status).toBe(200);
    const undoneBody = (await undone.json()) as DriverDay;
    expect(undoneBody.stops.find((stop) => stop.id === harbor?.id)?.status).toBe("not_started");

    const restarted = await app.request(`/api/stops/${harbor?.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: alex },
      body: JSON.stringify({ status: "en_route" }),
    });
    expect(restarted.status).toBe(200);

    const noted = await app.request(`/api/stops/${harbor?.id}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: alex },
      body: JSON.stringify({ body: "Gate code is 1942." }),
    });
    const notedBody = (await noted.json()) as DriverDay;
    expect(notedBody.stops.find((stop) => stop.id === harbor?.id)?.notes[0]?.body).toBe("Gate code is 1942.");

    const form = new FormData();
    form.append("photos", new File([png], "dock.png", { type: "image/png" }));
    form.append("photos", new File([png], "load.png", { type: "image/png" }));
    const uploaded = await app.request(`/api/stops/${harbor?.id}/photos`, {
      method: "POST",
      headers: { cookie: alex },
      body: form,
    });
    expect(uploaded.status).toBe(200);
    const uploadedBody = (await uploaded.json()) as DriverDay;
    const photos = uploadedBody.stops.find((stop) => stop.id === harbor?.id)?.photos ?? [];
    expect(photos).toHaveLength(2);

    const photo = await app.request(`/api/photos/${photos[0]?.id}`, { headers: { cookie: alex } });
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/png");
    const otherDriver = await login("sam.thompson@cws.local");
    expect((await app.request(`/api/photos/${photos[0]?.id}`, { headers: { cookie: otherDriver } })).status).toBe(404);

    const completed = await app.request(`/api/stops/${harbor?.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: alex },
      body: JSON.stringify({ status: "completed" }),
    });
    const completedBody = (await completed.json()) as DriverDay;
    expect(completedBody.stops.find((stop) => stop.id === harbor?.id)?.status).toBe("completed");

    const reversed = [...completedBody.stops].reverse().map((stop) => stop.id);
    const reordered = await app.request("/api/day/order", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: alex },
      body: JSON.stringify({ date: "2026-09-30", stopIds: reversed }),
    });
    const reorderedBody = (await reordered.json()) as DriverDay;
    expect(reorderedBody.stops.map((stop) => stop.customerName)).toEqual([
      "Brightway Offices",
      "Harbor City Market",
      "Greenline Nursery",
      "Metro Foods",
    ]);
  });
});
