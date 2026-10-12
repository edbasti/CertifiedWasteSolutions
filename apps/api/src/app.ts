import { Hono } from "hono";
import { appName } from "@cws/shared";
import { registerAuth } from "./auth";
import { registerDirectory } from "./directory";
import { registerDay } from "./day";
import { registerInvoices } from "./invoices";
import { registerLogs } from "./logs";
import { registerNetSuite } from "./netsuite";
import { registerNotifications } from "./notifications";
import { registerReports } from "./reports";
import { registerRoutes } from "./routes";
import type { AppEnv } from "./app-env";
import type { CwsDatabase } from "./db/client";

export function createApp(db: CwsDatabase) {
  const app = new Hono<AppEnv>();

  app.get("/health", (c) => c.json({ ok: true, service: appName }));
  registerAuth(app, db);
  registerDirectory(app, db);
  registerRoutes(app, db);
  registerDay(app, db);
  registerNotifications(app, db);
  registerLogs(app, db);
  registerInvoices(app, db);
  registerReports(app, db);
  registerNetSuite(app, db);

  return app;
}
