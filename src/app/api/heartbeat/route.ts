import { after, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { runClaimedAgentCycle, vietnamCycleSlot } from "@/lib/agent-cycle";

export const maxDuration = 60;
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

async function wake(slot: string) {
  const db = await getDb();
  if (!db) return;
  try {
    await runClaimedAgentCycle(db, "public-heartbeat");
  } catch (error) {
    console.error(`Heartbeat ${slot} failed`, error);
  }
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
  const shouldWake = slot.minute >= 17 && lastRunKey !== slot.key;
  if (shouldWake) after(() => wake(slot.key));
  return NextResponse.json(
    { ok: true, awake: lastRunKey === slot.key, wakeRequested: shouldWake },
    { headers: { "Cache-Control": "no-store" } },
  );
}
