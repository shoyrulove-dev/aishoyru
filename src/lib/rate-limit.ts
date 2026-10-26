import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import type { NextRequest } from "next/server";

type RateLimitDocument = {
  _id: string;
  count: number;
  scope: string;
  identity: string;
  createdAt: Date;
  expiresAt: Date;
};

export async function checkRateLimit(
  db: Db,
  request: NextRequest,
  scope: string,
  limit: number,
  windowMs: number,
) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const salt = process.env.CRON_SECRET || process.env.ADMIN_API_KEY || "shoyru";
  const identity = createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 24);
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const id = `${scope}:${identity}:${bucket}`;
  const expiresAt = new Date((bucket + 2) * windowMs);
  const collection = db.collection<RateLimitDocument>("rate_limits");
  await collection.updateOne(
    { _id: id },
    { $inc: { count: 1 }, $setOnInsert: { scope, identity, createdAt: new Date(), expiresAt } },
    { upsert: true },
  );
  const record = await collection.findOne(
    { _id: id },
    { projection: { count: 1 } },
  );
  return {
    allowed: Number(record?.count || 0) <= limit,
    retryAfter: Math.max(1, Math.ceil(((bucket + 1) * windowMs - now) / 1000)),
  };
}
