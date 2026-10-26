import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";

const Reply = z.object({
  sessionId: z.string().regex(/^[a-zA-Z0-9-]{12,64}$/),
  text: z.string().trim().min(1).max(600),
});
const allowed = (request: NextRequest) =>
  Boolean(process.env.ADMIN_API_KEY) &&
  request.headers.get("authorization") ===
    `Bearer ${process.env.ADMIN_API_KEY}`;

export async function POST(request: NextRequest) {
  if (!allowed(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Reply.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Nội dung không hợp lệ." },
      { status: 400 },
    );
  const db = await getDb();
  if (!db)
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  await Promise.all([
    db
      .collection("visitor_messages")
      .insertOne({
        ...parsed.data,
        name: "Chủ hang",
        role: "shoyru",
        read: true,
        source: "admin",
        createdAt: new Date(),
      }),
    db
      .collection("visitor_messages")
      .updateMany(
        { sessionId: parsed.data.sessionId, role: "visitor" },
        { $set: { read: true } },
      ),
  ]);
  return NextResponse.json({ ok: true });
}
