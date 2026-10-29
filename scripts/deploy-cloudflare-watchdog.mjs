import fs from "node:fs";
import { spawnSync } from "node:child_process";

for (const filename of [
  ".env.cloudflare.local",
  ".env.ai.local",
  ".env.local",
  ".env.production.local",
]) {
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

const environment = { ...process.env, CLOUDFLARE_API_TOKEN: token };

for (const args of [
  ["wrangler", "deploy", "--config", "cloudflare-watchdog/wrangler.toml"],
  ["wrangler", "triggers", "deploy", "--config", "cloudflare-watchdog/wrangler.toml"],
]) {
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npx";
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", "npx.cmd", ...args]
    : args;
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    env: environment,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
