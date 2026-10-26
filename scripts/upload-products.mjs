import fs from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";

for (const filename of [".env.local", ".env.production.local"]) {
  if (!fs.existsSync(filename)) continue;
  for (const raw of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const index = raw.indexOf("=");
    if (index < 1 || raw.startsWith("#")) continue;
    const key = raw.slice(0, index).trim();
    const value = raw.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const filename = process.argv[2];
if (!filename || !fs.existsSync(filename)) throw new Error("Cần đường dẫn tệp sản phẩm.");
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Thiếu BLOB_READ_WRITE_TOKEN.");

const pathname = `products/${path.basename(filename)}`;
const result = await put(pathname, fs.readFileSync(filename), {
  access: "private",
  addRandomSuffix: false,
  allowOverwrite: true,
  token: process.env.BLOB_READ_WRITE_TOKEN,
  contentType: "application/zip",
});
console.log(JSON.stringify({ ok: true, pathname: result.pathname }));
