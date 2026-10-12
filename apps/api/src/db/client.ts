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

export function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. Use the Postgres connection string from Supabase Project Settings → Database.",
    );
  }
  return url;
}

export function openDatabase(connectionString = databaseUrl()) {
  const client = postgres(connectionString, {
    max: process.env.VERCEL ? 1 : 10,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const db = drizzlePostgres(client, { schema });
  return { client, db };
}

export function migrationsFolder() {
  const starts = [dirname(fileURLToPath(import.meta.url)), process.cwd()];
  const relatives = ["drizzle", "dist/drizzle", "apps/api/drizzle", "apps/api/dist/drizzle", "../../drizzle"];
  for (const start of starts) {
    let dir = start;
    for (let depth = 0; depth < 6; depth += 1) {
      for (const relative of relatives) {
        const candidate = join(dir, relative);
        if (existsSync(join(candidate, "meta", "_journal.json"))) {
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
