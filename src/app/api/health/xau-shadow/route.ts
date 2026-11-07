import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getXauShadowLab, xauShadowPolicy } from "@/lib/xau-shadow";

export async function GET() {
  const db = await getDb();
  if (!db) return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  const lab = await getXauShadowLab(db);
  return NextResponse.json({ ok: true, ...lab, policy: xauShadowPolicy }, {
    headers: { "Cache-Control": "no-store" },
  });
}
