import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { checkRateLimit } from "@/lib/rate-limit";

const Event = z.object({
  sessionId: z.string().regex(/^[a-zA-Z0-9-]{12,64}$/),
  type: z.enum([
    "page_view",
    "chat_open",
    "store_click",
    "product_view",
    "checkout_start",
    "qr_created",
    "payment_verified",
    "download_started",
    "affiliate_click",
  ]),
  path: z.string().startsWith("/").max(180),
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
  await db.collection("engagement_events").insertOne({
    ...parsed.data,
    createdAt: new Date(),
  });
  return NextResponse.json({ ok: true });
}
