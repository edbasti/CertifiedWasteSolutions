import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

export type CwsDatabase = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

function loadLocalEnv() {
  const path = fileURLToPath(new URL("../../../../.env", import.meta.url));
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

function cleanDatabaseUrl(raw: string) {
  let url = raw.trim();
  // Common Vercel mistake: pasting the whole .env line into the value field.
  if (url.startsWith("DATABASE_URL=")) {
    url = url.slice("DATABASE_URL=".length).trim();
  }
  if (url.startsWith("DATABASE_POOL_URL=")) {
    url = url.slice("DATABASE_POOL_URL=".length).trim();
  }
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1);
  }
  return url;
}

export function databaseUrl() {
  // Prefer the Supabase pooler on Vercel — direct :5432 links often hang from serverless.
  const pool = cleanDatabaseUrl(process.env.DATABASE_POOL_URL ?? "");
  const primary = cleanDatabaseUrl(process.env.DATABASE_URL ?? "");
  const url = process.env.VERCEL && pool ? pool : primary || pool;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. On Vercel, set DATABASE_POOL_URL to the Supabase pooler URI (port 6543).",
    );
  }
  return url;
}

export function openDatabase(connectionString = databaseUrl()) {
  const client = postgres(connectionString, {
    // On Vercel, one connection per isolate — stacking sockets from rapid clicks causes hangs.
    max: process.env.VERCEL ? 1 : 10,
    prepare: false,
    idle_timeout: 20,
    // Fail fast instead of leaving the login page spinning.
    connect_timeout: process.env.VERCEL ? 4 : 10,
    ...(process.env.VERCEL ? { max_lifetime: 60 * 5 } : {}),
    connection: {
      statement_timeout: 8_000,
    },
  });
  const db = drizzlePostgres(client, { schema });
  return { client, db };
}

function isMigrationsFolder(candidate: string) {
  return existsSync(join(candidate, "meta", "_journal.json"));
}

export function migrationsFolder() {
  const here = dirname(fileURLToPath(import.meta.url));
  const cwd = process.cwd();
  const direct = [
    join(cwd, "apps/api/drizzle"),
    join(cwd, "api/drizzle"),
    join(cwd, "drizzle"),
    join(here, "drizzle"),
    join(here, "../drizzle"),
    join(here, "../../drizzle"),
    join(here, "../../../apps/api/drizzle"),
  ];
  for (const candidate of direct) {
    if (isMigrationsFolder(candidate)) {
      return candidate;
    }
  }

  const starts = [here, cwd];
  const relatives = [
    "drizzle",
    "api/drizzle",
    "dist/drizzle",
    "apps/api/drizzle",
    "apps/api/dist/drizzle",
    "apps/api/api/drizzle",
    "../../drizzle",
  ];
  for (const start of starts) {
    let dir = start;
    for (let depth = 0; depth < 6; depth += 1) {
      for (const relative of relatives) {
        const candidate = join(dir, relative);
        if (isMigrationsFolder(candidate)) {
          return candidate;
        }
      }
      const parent = dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }
  throw new Error("Database migrations were not found.");
}

export async function migrateDatabase(db: PostgresJsDatabase<typeof schema>, folder = migrationsFolder()) {
  await migratePostgres(db, { migrationsFolder: folder });
}
