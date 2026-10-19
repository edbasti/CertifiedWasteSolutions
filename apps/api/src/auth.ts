import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Context, Hono, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { PublicUser, UserRole } from "@cws/shared";
import type { CwsDatabase } from "./db/client";
import { dummyPasswordHash, hashPassword, passwordNeedsRehash, verifyPassword } from "./db/password";
import { sessions, users } from "./db/schema";
import type { AppEnv } from "./app-env";

const sessionCookie = "cws_session";
const sessionMs = 7 * 24 * 60 * 60 * 1000;
const loginBudgetMs = 12_000;

function toPublicUser(user: typeof users.$inferSelect): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyName: user.companyName,
  };
}

async function readBody(c: Context): Promise<Record<string, unknown> | null> {
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

function field(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cookieSecure() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    path: "/",
    secure: cookieSecure(),
    maxAge: sessionMs / 1000,
  };
}

function clearSessionCookie(c: Context) {
  // Must match the attributes used when the cookie was set, or browsers keep it.
  deleteCookie(c, sessionCookie, {
    path: "/",
    secure: cookieSecure(),
    sameSite: "Lax",
  });
}

export function requireUser(db: CwsDatabase): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = getCookie(c, sessionCookie);
    if (!token) {
      return c.json({ error: "Sign in required." }, 401);
    }

    const [session] = await db.select().from(sessions).where(eq(sessions.id, token));
    const now = new Date().toISOString();
    if (!session || session.expiresAt <= now) {
      if (session) {
        await db.delete(sessions).where(eq(sessions.id, token));
      }
      return c.json({ error: "Sign in required." }, 401);
    }

    const [user] = await db.select().from(users).where(eq(users.id, session.userId));
    if (!user || !user.active) {
      return c.json({ error: "Sign in required." }, 401);
    }

    c.set("user", toPublicUser(user));
    await next();
  };
}

export function requireRole(...roles: UserRole[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!roles.includes(user.role)) {
      return c.json({ error: "You do not have access to that." }, 403);
    }
    await next();
  };
}

async function startSession(c: Context, db: CwsDatabase, userId: string) {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  await db.insert(sessions).values({
    id: token,
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + sessionMs).toISOString(),
  });
  setCookie(c, sessionCookie, token, cookieOptions());
}

export function registerAuth(app: Hono<AppEnv>, db: CwsDatabase) {
  const signedIn = requireUser(db);

  app.post("/api/login", async (c) => {
    const body = await readBody(c);
    if (!body) {
      return c.json({ error: "Enter an email and password." }, 400);
    }

    const email = field(body, "email").toLowerCase();
    const password = field(body, "password");
    if (!email || !password) {
      return c.json({ error: "Enter an email and password." }, 400);
    }

    const deadline = Date.now() + loginBudgetMs;
    try {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (Date.now() > deadline) {
        return c.json({ error: "Sign-in is slow right now. Wait a few seconds and try once." }, 503);
      }
      const passwordOk = await verifyPassword(password, user?.passwordHash ?? dummyPasswordHash);
      if (Date.now() > deadline) {
        return c.json({ error: "Sign-in is slow right now. Wait a few seconds and try once." }, 503);
      }
      if (!user || !passwordOk) {
        return c.json({ error: "Email or password is incorrect." }, 401);
      }
      if (!user.active) {
        return c.json({ error: "This account is inactive." }, 401);
      }
      if (passwordNeedsRehash(user.passwordHash)) {
        await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id));
      }
      await startSession(c, db, user.id);
      return c.json({ user: toPublicUser(user) });
    } catch (error) {
      console.error("login failed", error);
      return c.json({ error: "Could not reach the database. Try again in a moment." }, 503);
    }
  });

  app.post("/api/logout", async (c) => {
    const token = getCookie(c, sessionCookie);
    // Clear the cookie first so the client is signed out even if DB delete is slow.
    clearSessionCookie(c);
    if (token) {
      try {
        await Promise.race([
          db.delete(sessions).where(eq(sessions.id, token)),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("logout db timeout")), 2_000);
          }),
        ]);
      } catch {
        // Orphaned session rows expire; do not delay the response.
      }
    }
    return c.json({ ok: true });
  });

  app.get("/api/me", signedIn, (c) => c.json({ user: c.get("user") }));

  app.get("/api/drivers", signedIn, requireRole("admin"), async (c) => {
    const drivers = (await db.select().from(users).where(eq(users.role, "driver")))
      .map((driver) => ({
        id: driver.id,
        name: driver.name,
        email: driver.email,
        companyName: driver.companyName,
        active: driver.active,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return c.json({ drivers });
  });

  app.post("/api/drivers", signedIn, requireRole("admin"), async (c) => {
    const body = await readBody(c);
    if (!body) {
      return c.json({ error: "Enter the driver's name, email, and password." }, 400);
    }

    const name = field(body, "name");
    const email = field(body, "email").toLowerCase();
    const password = field(body, "password");
    const companyName = field(body, "companyName");

    if (!name || !email || !password) {
      return c.json({ error: "Enter the driver's name, email, and password." }, 400);
    }
    if (!validEmail(email)) {
      return c.json({ error: "Enter a valid email." }, 400);
    }
    if (password.length < 8) {
      return c.json({ error: "Use a password of at least 8 characters." }, 400);
    }
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) {
      return c.json({ error: "A user with that email already exists." }, 409);
    }

    const driver = {
      id: randomUUID(),
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "driver" as const,
      companyName: companyName || null,
      active: true,
      createdAt: new Date().toISOString(),
    };
    await db.insert(users).values(driver);

    return c.json(
      {
        driver: {
          id: driver.id,
          name: driver.name,
          email: driver.email,
          companyName: driver.companyName,
          active: driver.active,
        },
      },
      201,
    );
  });

  app.post("/api/drivers/:id/reset-access", signedIn, requireRole("admin"), async (c) => {
    const body = await readBody(c);
    const password = body ? field(body, "password") : "";
    if (password.length < 8) {
      return c.json({ error: "Use a password of at least 8 characters." }, 400);
    }

    const [driver] = await db.select().from(users).where(eq(users.id, c.req.param("id")));
    if (!driver || driver.role !== "driver") {
      return c.json({ error: "Driver not found." }, 404);
    }

    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, driver.id));
    await db.delete(sessions).where(eq(sessions.userId, driver.id));
    return c.json({ ok: true });
  });
}
