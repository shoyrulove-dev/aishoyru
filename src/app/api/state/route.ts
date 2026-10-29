import { after, NextResponse } from "next/server";
import { getPublicState } from "@/lib/data";
import { getDb } from "@/lib/mongodb";
import { runClaimedAgentCycle } from "@/lib/agent-cycle";

export const maxDuration = 300;

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
    await runClaimedAgentCycle(db, "public-heartbeat");
  } catch (error) {
    console.error(`Visitor watchdog ${slot} failed`, error);
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
      "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
    },
  });
}
