import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { checkRateLimit } from "@/lib/rate-limit";

const Event = z.object({
  sessionId: z.string().regex(/^[a-zA-Z0-9-]{12,64}$/),
  type: z.enum([
    "page_view",
    "presence",
    "chat_open",
    "store_click",
    "product_view",
    "checkout_start",
    "qr_created",
    "payment_verified",
    "download_started",
    "affiliate_click",
    "share_click",
    "free_download",
  ]),
  path: z.string().startsWith("/").max(180),
  referrer: z.string().url().max(500).optional(),
  utmSource: z.string().max(80).optional(),
  utmMedium: z.string().max(80).optional(),
  utmCampaign: z.string().max(120).optional(),
});

export async function POST(request: NextRequest) {
  const parsed = Event.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Dữ liệu không hợp lệ." },
      { status: 400 },
    );
  const db = await getDb();
  if (!db)
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  const rate = await checkRateLimit(db, request, "engagement", 120, 60 * 1000);
  if (!rate.allowed)
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  if (parsed.data.type === "presence") {
    await db.collection("visitor_presence").updateOne(
      { sessionId: parsed.data.sessionId },
      {
        $set: {
          path: parsed.data.path,
          lastSeenAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
  } else {
    await db.collection("engagement_events").insertOne({
      ...parsed.data,
      createdAt: new Date(),
    });
  }
  return NextResponse.json({ ok: true });
}
