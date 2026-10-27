import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  const db = await getDb();
  const month = new Date().toISOString().slice(0, 7);
  const usage = db
    ? await db.collection("api_usage").findOne({ provider: "brave-search", month })
    : null;
  return NextResponse.json(
    {
      provider: "brave-search",
      configured: Boolean(process.env.BRAVE_SEARCH_API_KEY),
      month,
      used: Number(usage?.used || 0),
      limit: Math.min(1000, Number(process.env.BRAVE_SEARCH_MONTHLY_LIMIT || 1000)),
      lastStatus: String(usage?.lastStatus || (usage?.used ? "called" : "not-used")),
      lastSuccessAt: usage?.lastSuccessAt || null,
      lastFailureAt: usage?.lastFailureAt || null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
