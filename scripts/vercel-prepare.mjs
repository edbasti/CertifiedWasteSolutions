import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// npm ci runs this script before the workspace tree is fully linked on Vercel.
// The build command runs it again after install, when vite and esbuild are on disk.
if (process.env.npm_lifecycle_event === "postinstall") {
  process.exit(0);
}

const webBuild = spawnSync("npm", ["run", "build", "-w", "@cws/web"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (webBuild.status !== 0) {
  process.exit(webBuild.status ?? 1);
}

const webDist = join(root, "apps/web/dist");
const shell = readFileSync(join(webDist, "index.html"), "utf8");

function publishStatic(target) {
  rmSync(target, { recursive: true, force: true });
  cpSync(webDist, target, { recursive: true });
}

publishStatic(join(root, "public"));
publishStatic(join(root, "apps/api/public"));

const esbuild = await import("esbuild");
const bundle = join(root, "apps/api/dist/server.js");
mkdirSync(dirname(bundle), { recursive: true });
await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["apps/api/src/vercel-app.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: bundle,
  define: {
    __CWS_SPA_HTML__: JSON.stringify(shell),
  },
  plugins: [
    {
      name: "external-packages",
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.path.startsWith(".") || args.path.startsWith("/") || args.path.startsWith("@cws/")) {
            return null;
          }
          return { path: args.path, external: true };
        });
      },
    },
  ],
});

const drizzleSource = join(root, "apps/api/drizzle");
const migrations = join(root, "apps/api/dist/drizzle");
rmSync(migrations, { recursive: true, force: true });
cpSync(drizzleSource, migrations, { recursive: true });

const nodeHandler = (importPath) => `import { handle } from "@hono/node-server/vercel";
import app from "${importPath}";

const listener = handle(app);

export default function handler(req, res) {
  return listener(req, res);
}
`;

function writeHandler(directory, importPath) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "[...route].js"), nodeHandler(importPath));
  const drizzleTarget = join(directory, "drizzle");
  rmSync(drizzleTarget, { recursive: true, force: true });
  cpSync(drizzleSource, drizzleTarget, { recursive: true });
}

writeHandler(join(root, "api"), "../apps/api/dist/server.js");
writeHandler(join(root, "apps/api/api"), "../dist/server.js");

console.log("Prepared the Vercel web build and API bundle.");
