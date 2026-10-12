import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrationsFolder } from "./db/client";
import { createServerApp } from "./server-app";

describe("migrationsFolder", () => {
  it("finds the drizzle journal", () => {
    expect(existsSync(join(migrationsFolder(), "meta", "_journal.json"))).toBe(true);
  });
});

function restoreDatabaseUrl(previous: string | undefined) {
  if (previous === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previous;
  }
}

describe("createServerApp", () => {
  const shell = "<!doctype html><title>Certified Waste Solutions</title>";

  it("returns the web app for a page without opening the database", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const response = await createServerApp(shell).request("/login");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      await expect(response.text()).resolves.toContain("Certified Waste Solutions");
    } finally {
      restoreDatabaseUrl(previous);
    }
  });

  it("returns a JSON error for the API when the database is not configured", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const response = await createServerApp(shell).request("/api/me");
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining("DATABASE_URL"),
      });
    } finally {
      restoreDatabaseUrl(previous);
    }
  });
});
