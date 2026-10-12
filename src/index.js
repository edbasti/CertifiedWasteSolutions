import { Hono } from "hono";
import app from "../apps/api/dist/server.js";

if (typeof app?.fetch !== "function") {
  throw new Error(`The API bundle did not export a Hono app (${Hono.name}).`);
}

export default app;
