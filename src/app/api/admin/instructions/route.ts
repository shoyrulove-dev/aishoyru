import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";

const Body = z.object({ text: z.string().trim().min(3).max(2000) });
const allowed = (request: NextRequest) =>
  Boolean(process.env.ADMIN_API_KEY) &&
  request.headers.get("authorization") === `Bearer ${process.env.ADMIN_API_KEY}`;

export async function POST(request: NextRequest) {
  if (!allowed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Nội dung không hợp lệ." }, { status: 400 });
  const db = await getDb();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  await db.collection("owner_instructions").insertOne({
    text: parsed.data.text,
    status: "active",
    createdAt: new Date(),
    source: "admin",
  });
  return NextResponse.json({ ok: true });
}
