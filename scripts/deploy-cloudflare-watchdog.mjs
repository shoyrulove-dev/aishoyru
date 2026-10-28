import fs from "node:fs";
import { spawnSync } from "node:child_process";

for (const filename of [".env.local", ".env.production.local", ".env.ai.local"]) {
  if (!fs.existsSync(filename)) continue;
  for (const raw of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const index = raw.indexOf("=");
    if (index < 1 || raw.startsWith("#")) continue;
    const key = raw.slice(0, index).trim();
    const value = raw.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const token = process.env.CLOUDFLARE_WORKERS_API_TOKEN;
if (!token) throw new Error("Thiếu CLOUDFLARE_WORKERS_API_TOKEN.");
if (!process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error("Thiếu CLOUDFLARE_ACCOUNT_ID.");

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  command,
  ["wrangler", "deploy", "--config", "cloudflare-watchdog/wrangler.toml"],
  {
    stdio: "inherit",
    env: { ...process.env, CLOUDFLARE_API_TOKEN: token },
  },
);
if (result.status !== 0) process.exit(result.status || 1);
