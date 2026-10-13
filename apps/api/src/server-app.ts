import { Hono } from "hono";
import { createApp } from "./app";
import { migrateDatabase, openDatabase } from "./db/client";

function isApiPath(path: string) {
  return path === "/health" || path === "/api" || path.startsWith("/api/");
}

function isPageRequest(path: string, method: string) {
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }
  if (isApiPath(path)) {
    return false;
  }
  const last = path.split("/").pop() ?? "";
  return !last.includes(".");
}

export function createServerApp(shell = "") {
  const gate = new Hono();
  let ready: Promise<ReturnType<typeof createApp>> | undefined;

  function backend() {
    ready ??= (async () => {
      const { db } = openDatabase();
      await migrateDatabase(db);
      return createApp(db);
    })();
    return ready;
  }

  gate.all("*", async (c) => {
    if (shell && isPageRequest(c.req.path, c.req.method)) {
      return c.html(shell);
    }
    if (!isApiPath(c.req.path)) {
      return c.notFound();
    }
    try {
      const app = await backend();
      return app.fetch(c.req.raw);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "The API failed to start.";
      const safe =
        message.includes("DATABASE_URL") || message.includes("migrations")
          ? message
          : "The API failed to start.";
      return c.json({ error: safe }, 500);
    }
  });

  return gate;
}
