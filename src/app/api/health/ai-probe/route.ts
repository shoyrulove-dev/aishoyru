import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { runCoreProviderProbe } from "@/lib/provider-probe";

export const maxDuration = 60;

export async function GET() {
  const db = await getDb();
  if (!db) return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  const cached = await db.collection("ai_probe_reports").findOne({ key: "core-v4" });
  const fresh = cached?.checkedAt instanceof Date && Date.now() - cached.checkedAt.getTime() < 30 * 60 * 1000;
  const report = fresh ? cached : await runCoreProviderProbe(db);
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
