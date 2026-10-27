import { after, NextResponse } from "next/server";
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

async function wake(slot: string) {
  const db = await getDb();
  if (!db) return;
  try {
    const claim = await db.collection("agent_cycle_claims").updateOne(
      { _id: slot as never },
      { $setOnInsert: { claimedAt: new Date(), source: "public-heartbeat" } },
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
  const db = await getDb();
  if (!db)
    return NextResponse.json({ ok: false }, { status: 503 });
  const now = new Date();
  const slot = vietnamSlot(now);
  const state = await db.collection("agent_state").findOne({ key: "main" });
  const lastRunKey = state?.lastRunAt
    ? vietnamSlot(new Date(state.lastRunAt as Date)).key
    : "";
  const shouldWake = slot.minute >= 17 && lastRunKey !== slot.key;
  if (shouldWake) after(() => wake(slot.key));
  return NextResponse.json(
    { ok: true, awake: lastRunKey === slot.key, wakeRequested: shouldWake },
    { headers: { "Cache-Control": "no-store" } },
  );
}
