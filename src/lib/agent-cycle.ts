import type { Db } from "mongodb";
import { runAgentCycle } from "./agent";
import { recordOperationalAlert } from "./growth-engine";

const HOUR = 60 * 60 * 1000;

export function vietnamCycleSlot(now = new Date()) {
  const shifted = new Date(now.getTime() + 7 * HOUR);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
    String(shifted.getUTCHours()).padStart(2, "0"),
  ].join("-");
}

export async function runClaimedAgentCycle(
  db: Db,
  source: "github-cron" | "public-heartbeat",
  options: { force?: boolean } = {},
) {
  const now = new Date();
  const slot = vietnamCycleSlot(now);
  const claimId = options.force
    ? `${slot}-force-${crypto.randomUUID()}`
    : slot;
  try {
    await db.collection("agent_cycle_claims").insertOne({
      _id: claimId as never,
      slot,
      source,
      status: "running",
      claimedAt: now,
      expiresAt: new Date(now.getTime() + 12 * 60 * 1000),
    });
  } catch (error) {
    if (!options.force && (error as { code?: number }).code === 11000) {
      const retry = await db.collection("agent_cycle_claims").findOneAndUpdate(
        {
          _id: claimId as never,
          $or: [
            { status: "failed" },
            { status: "running", expiresAt: { $lte: now } },
          ],
        },
        {
          $set: {
            source,
            status: "running",
            claimedAt: now,
            expiresAt: new Date(now.getTime() + 12 * 60 * 1000),
          },
          $unset: { failedAt: "", error: "" },
        },
        { returnDocument: "after" },
      );
      if (!retry)
        return { ok: true, skipped: true, reason: "Lượt giờ này đã được nhận", slot };
    } else {
      throw error;
    }
  }

  try {
    const result = await runAgentCycle();
    await db.collection("agent_cycle_claims").updateOne(
      { _id: claimId as never },
      { $set: { status: "completed", completedAt: new Date() } },
    );
    return { ...result, slot, source };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Unknown error";
    await db.collection("agent_cycle_claims").updateOne(
      { _id: claimId as never },
      {
        $set: {
          status: "failed",
          failedAt: new Date(),
          error: message,
        },
      },
    );
    await recordOperationalAlert(db, {
      key: "agent-cycle-repeated-failure",
      title: "Shoyru bị lỗi tự chạy nhiều lần",
      reason: message,
      needed: "Kiểm tra lỗi mới nhất trong GitHub Actions hoặc Sức khỏe AI",
    });
    throw error;
  }
}
