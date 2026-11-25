import { NextRequest, NextResponse } from "next/server";
import { hasCronSecret } from "@/lib/cron-auth";
import { getDb } from "@/lib/mongodb";
import { getPolymarketResearch } from "@/lib/polymarket";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!hasCronSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  try {
    const result = await getPolymarketResearch(db, true);
    return NextResponse.json({
      ok: true,
      generatedAt: result.generatedAt,
      tradesScanned: result.tradesScanned,
      marketsObserved: result.marketsObserved,
      paperTrading: result.paperTrading,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Quant scan failed" }, { status: 502 });
  }
}
