import { after, NextResponse } from "next/server";
import { getPublicState } from "@/lib/data";
import { getDb } from "@/lib/mongodb";
import { runAgentCycle } from "@/lib/agent";

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

function ranInCurrentVietnamHour(lastRunAt: string | null, now: Date) {
  if (!lastRunAt) return false;
  return vietnamSlot(new Date(lastRunAt)).key === vietnamSlot(now).key;
}

async function wakeShoyruOnce(slot: string) {
  const db = await getDb();
  if (!db) return;
  try {
    const claim = await db.collection("agent_cycle_claims").updateOne(
      { _id: slot as never },
      { $setOnInsert: { claimedAt: new Date(), source: "visitor-watchdog" } },
      { upsert: true },
    );
    if (!claim.upsertedCount) return;
    await runAgentCycle();
    await db.collection("agent_cycle_claims").updateOne(
      { _id: slot as never },
      { $set: { completedAt: new Date(), status: "completed" } },
    );
  } catch (error) {
    await db.collection("agent_cycle_claims").updateOne(
      { _id: slot as never },
      {
        $set: {
          failedAt: new Date(),
          status: "failed",
          error: error instanceof Error ? error.message.slice(0, 300) : "Unknown error",
        },
      },
    );
  }
}

export async function GET() {
  const state = await getPublicState();
  const now = new Date();
  const slot = vietnamSlot(now);
  if (slot.minute >= 17 && !ranInCurrentVietnamHour(state.lastRunAt, now)) {
    after(() => wakeShoyruOnce(slot.key));
  }
  return NextResponse.json(state, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600",
    },
  });
}
