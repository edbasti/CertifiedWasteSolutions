import type { Hono } from "hono";
import type { NetSuiteConnection, NetSuiteCredentialSlot, NetSuiteSearchColumn } from "@cws/shared";
import type { AppEnv } from "./app-env";
import { requireRole, requireUser } from "./auth";
import type { CwsDatabase } from "./db/client";

const credentialFields: { key: string; label: string; env: string }[] = [
  { key: "accountId", label: "Account ID", env: "NETSUITE_ACCOUNT_ID" },
  { key: "consumerKey", label: "Consumer key", env: "NETSUITE_CONSUMER_KEY" },
  { key: "consumerSecret", label: "Consumer secret", env: "NETSUITE_CONSUMER_SECRET" },
  { key: "tokenId", label: "Token ID", env: "NETSUITE_TOKEN_ID" },
  { key: "tokenSecret", label: "Token secret", env: "NETSUITE_TOKEN_SECRET" },
];

const savedSearchColumns: NetSuiteSearchColumn[] = [
  { field: "driverEmail", label: "Driver email", column: "driverEmail", required: true },
  { field: "serviceDate", label: "Service date", column: "serviceDate", required: true },
  { field: "customer", label: "Customer", column: "customer", required: true },
  { field: "pickup", label: "Pickup", column: "pickup", required: true },
  { field: "address", label: "Address", column: "address", required: false },
  { field: "sequence", label: "Sequence", column: "sequence", required: false },
];

export function netSuiteConnection(): NetSuiteConnection {
  const credentials: NetSuiteCredentialSlot[] = credentialFields.map((field) => ({
    key: field.key,
    label: field.label,
    configured: Boolean(process.env[field.env]?.trim()),
  }));
  return {
    connected: false,
    mode: "csv",
    message: "CSV only, NetSuite not connected.",
    credentials,
    savedSearch: {
      id: process.env.NETSUITE_SAVED_SEARCH_ID?.trim() ?? "",
      columns: savedSearchColumns,
    },
  };
}

export function registerNetSuite(app: Hono<AppEnv>, db: CwsDatabase) {
  const signedIn = requireUser(db);
  const admin = requireRole("admin");

  app.get("/api/netsuite", signedIn, admin, (c) => c.json(netSuiteConnection()));
}
