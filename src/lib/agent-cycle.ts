import type { Db } from "mongodb";
import { runAgentCycle } from "./agent";
import { recordOperationalAlert } from "./growth-engine";
import {
  claimCycleJob,
  completeCycleJob,
  createDailyBackup,
  ensureOperationalIndexes,
  failCycleJob,
  recordOperationalSnapshot,
  recoverStaleOperations,
} from "./operations";

const HOUR = 60 * 60 * 1000;
const CYCLE_DEADLINE_MS = 210_000;

async function runWithDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Chu kỳ vượt quá ${Math.round(timeoutMs / 1000)} giây`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  await ensureOperationalIndexes(db);
  await recoverStaleOperations(db, now);
  const claimed = await claimCycleJob(db, slot, source, Boolean(options.force));
  if (!claimed.job)
    return {
      ok: true,
      skipped: true,
      reason: "Lượt giờ này đã được nhận hoặc đang chờ thử lại",
      slot,
    };
  const claimId = claimed.id;

  await db.collection("agent_cycle_claims").updateOne(
    { _id: claimId as never },
    {
      $set: {
        slot,
        source,
        status: "running",
        claimedAt: now,
        expiresAt: new Date(now.getTime() + 12 * 60 * 1000),
      },
      $unset: { failedAt: "", error: "" },
    },
    { upsert: true },
  );

  try {
    const result = await runWithDeadline(runAgentCycle(), CYCLE_DEADLINE_MS);
    await Promise.all([
      db.collection("agent_cycle_claims").updateOne(
        { _id: claimId as never },
        { $set: { status: "completed", completedAt: new Date() } },
      ),
      completeCycleJob(db, claimId, {
        ok: true,
        provider: result.provider,
        model: result.model,
      }),
    ]);
    await Promise.allSettled([
      recordOperationalSnapshot(db),
      createDailyBackup(db),
    ]);
    return { ...result, slot, source };
  } catch (error) {
    const failure = await failCycleJob(db, claimId, error);
    await db.collection("agent_cycle_claims").updateOne(
      { _id: claimId as never },
      {
        $set: {
          status: failure.terminal ? "dead-letter" : "failed",
          failedAt: new Date(),
          error: failure.message,
        },
      },
    );
    await recordOperationalAlert(db, {
      key: "agent-cycle-repeated-failure",
      title: "Shoyru bị lỗi tự chạy nhiều lần",
      reason: `${failure.message} (lần thử ${failure.attempts}/3)`,
      needed:
        "Mở Admin → Sức khỏe AI và cung cấp đúng khóa hoặc quyền được nêu trong lỗi gần nhất",
    });
    throw error;
  }
}
