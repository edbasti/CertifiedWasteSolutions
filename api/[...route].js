import { handle } from "@hono/node-server/vercel";
import app from "../apps/api/dist/server.js";

const listener = handle(app);

export default function handler(req, res) {
  return listener(req, res);
}
