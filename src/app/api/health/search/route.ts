import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  const db = await getDb();
  const month = new Date().toISOString().slice(0, 7);
  let usage = db
    ? await db.collection("api_usage").findOne({ provider: "brave-search", month })
    : null;
  if (
    db &&
    process.env.BRAVE_SEARCH_API_KEY &&
    usage &&
    !["success", "failed"].includes(String(usage.lastStatus || "")) &&
    !usage.probeClaimedAt
  ) {
    const claim = await db.collection("api_usage").updateOne(
      {
        provider: "brave-search",
        month,
        probeClaimedAt: { $exists: false },
      },
      { $set: { probeClaimedAt: new Date() }, $inc: { used: 1 } },
    );
    if (claim.modifiedCount) {
      try {
        const url = new URL("https://api.search.brave.com/res/v1/web/search");
        url.searchParams.set("q", "Shoyru AI");
        url.searchParams.set("count", "1");
        const response = await fetch(url, {
          headers: { "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY },
          signal: AbortSignal.timeout(8000),
        });
        await db.collection("api_usage").updateOne(
          { provider: "brave-search", month },
          {
            $set: response.ok
              ? { lastStatus: "success", lastError: "", lastSuccessAt: new Date() }
              : { lastStatus: "failed", lastError: `HTTP ${response.status}`, lastFailureAt: new Date() },
          },
        );
      } catch (error) {
        await db.collection("api_usage").updateOne(
          { provider: "brave-search", month },
          {
            $set: {
              lastStatus: "failed",
              lastError: error instanceof Error ? error.message.slice(0, 120) : "Probe failed",
              lastFailureAt: new Date(),
            },
          },
        );
      }
      usage = await db.collection("api_usage").findOne({ provider: "brave-search", month });
    }
  }
  return NextResponse.json(
    {
      provider: "brave-search",
      configured: Boolean(process.env.BRAVE_SEARCH_API_KEY),
      month,
      used: Number(usage?.used || 0),
      limit: Math.min(1000, Number(process.env.BRAVE_SEARCH_MONTHLY_LIMIT || 1000)),
      lastStatus: String(usage?.lastStatus || (usage?.used ? "called" : "not-used")),
      lastError: usage?.lastError || "",
      lastSuccessAt: usage?.lastSuccessAt || null,
      lastFailureAt: usage?.lastFailureAt || null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
