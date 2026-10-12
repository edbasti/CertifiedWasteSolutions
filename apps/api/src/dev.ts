import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { migrateDatabase, openDatabase } from "./db/client";

const port = Number(process.env.PORT ?? 8787);
const { db } = openDatabase();
await migrateDatabase(db);

serve({ fetch: createApp(db).fetch, port }, () => {
  console.log(`API listening on http://localhost:${port}`);
});
