import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { runClaimedAgentCycle, vietnamCycleSlot } from "@/lib/agent-cycle";

export const maxDuration = 300;
export const preferredRegion = "sin1";

function vietnamSlot(now: Date) {
  const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return {
    minute: shifted.getUTCMinutes(),
    key: [
      shifted.getUTCFullYear(),
      String(shifted.getUTCMonth() + 1).padStart(2, "0"),
      String(shifted.getUTCDate()).padStart(2, "0"),
      String(shifted.getUTCHours()).padStart(2, "0"),
    ].join("-"),
  };
}

export async function GET() {
  const db = await getDb();
  if (!db)
    return NextResponse.json({ ok: false }, { status: 503 });
  const now = new Date();
  const slot = vietnamSlot(now);
  const state = await db.collection("agent_state").findOne({ key: "main" });
  const lastRunKey = state?.lastRunAt
    ? vietnamCycleSlot(new Date(state.lastRunAt as Date))
    : "";
  const lastRunAt = state?.lastRunAt ? new Date(state.lastRunAt as Date).getTime() : 0;
  const delayed = !lastRunAt || Date.now() - lastRunAt > 75 * 60 * 1000;
  const shouldWake = delayed || (slot.minute >= 17 && lastRunKey !== slot.key);
  if (!shouldWake)
    return NextResponse.json(
      { ok: true, awake: lastRunKey === slot.key, wakeRequested: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const result = await runClaimedAgentCycle(db, "public-heartbeat");
    return NextResponse.json(
      {
        ok: true,
        awake: true,
        wakeRequested: true,
        skipped: Boolean(result.skipped),
        slot: result.slot,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(`Heartbeat ${slot.key} failed`, error);
    return NextResponse.json(
      {
        ok: false,
        awake: false,
        wakeRequested: true,
        error: error instanceof Error ? error.message.slice(0, 240) : "Không thể đánh thức Shoyru",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
