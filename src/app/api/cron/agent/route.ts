import { NextRequest, NextResponse } from "next/server";
import { runClaimedAgentCycle } from "@/lib/agent-cycle";
import { getDb } from "@/lib/mongodb";
import { hasCronSecret } from "@/lib/cron-auth";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!hasCronSecret(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const state = await db.collection("agent_state").findOne({ key: "main" });
  const lastRun = state?.lastRunAt
    ? new Date(state.lastRunAt as Date).getTime()
    : 0;
  if (
    lastRun &&
    Date.now() - lastRun < 40 * 60 * 1000 &&
    req.nextUrl.searchParams.get("force") !== "1"
  )
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Lượt gần nhất chưa quá 40 phút",
      lastRunAt: state?.lastRunAt,
    });
  try {
    return NextResponse.json(
      await runClaimedAgentCycle(db, "cloudflare-cron", {
        force: req.nextUrl.searchParams.get("force") === "1",
      }),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Agent failed" },
      { status: 500 },
    );
  }
}
