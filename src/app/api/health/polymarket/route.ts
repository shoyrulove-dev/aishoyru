import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getPolymarketResearch } from "@/lib/polymarket";

export const maxDuration = 60;

export async function GET() {
  const db = await getDb();
  if (!db)
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  try {
    const result = await getPolymarketResearch(db);
    const ageMinutes = Math.max(
      0,
      Math.round((Date.now() - new Date(result.generatedAt).getTime()) / 60_000),
    );
    return NextResponse.json(
      {
        ok: result.tradesScanned > 0 && result.marketsObserved > 0,
        mode: result.mode,
        liveTradingEnabled: result.liveTradingEnabled,
        ageMinutes,
        tradesScanned: result.tradesScanned,
        walletsObserved: result.walletsObserved,
        marketsObserved: result.marketsObserved,
        signalsProduced: result.signals.length,
        paperTrading: result.paperTrading
          ? {
              mode: result.paperTrading.mode,
              paperDays: result.paperTrading.paperDays,
              openPositions: result.paperTrading.openPositions,
              closedTrades: result.paperTrading.closedTrades,
              capitalEligible: result.paperTrading.capitalReadiness.eligible,
              missingRequirements: result.paperTrading.capitalReadiness.missing,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 160) : "Polymarket unavailable",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
