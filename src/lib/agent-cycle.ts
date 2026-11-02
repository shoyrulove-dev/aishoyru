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
  queueMissingRecentCycles,
} from "./operations";

const HOUR = 60 * 60 * 1000;
const CYCLE_DEADLINE_MS = 210_000;

function slotTime(slot: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})$/.exec(slot);
  if (!match) return new Date();
  return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:20:00+07:00`);
}

async function ensureCycleJournal(db: Db, slot: string) {
  const at = slotTime(slot);
  const start = new Date(at);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + HOUR);
  const existing = await db.collection("conversations").findOne({
    public: true,
    source: { $in: ["agent", "routine", "cycle-guard"] },
    createdAt: { $gte: start, $lt: end },
  });
  if (existing) {
    await db.collection("conversations").updateOne(
      { _id: existing._id },
      { $set: { cycleSlot: slot } },
    );
    return { inserted: false };
  }
  const time = at.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  await db.collection("conversations").updateOne(
    { cycleSlot: slot },
    {
      $setOnInsert: {
        cycleSlot: slot,
        speaker: "shoyru",
        text: `Shoyru đã hoàn thành lượt ${time}. Công việc đã được ghi lại trong hang.`,
        public: true,
        source: "cycle-guard",
        createdAt: at,
      },
    },
    { upsert: true },
  );
  return { inserted: true };
}

async function reviewRecentProductivity(db: Db) {
  const rows = await db.collection("agent_evaluations")
    .find({})
    .sort({ createdAt: -1 })
    .limit(3)
    .project({ score: 1, actionType: 1, createdAt: 1 })
    .toArray();
  if (rows.length < 3) return;
  const now = new Date();
  if (rows.some((row) => Number(row.score || 0) >= 50)) {
    await db.collection("operational_alerts").updateMany(
      { key: "three-low-value-cycles", status: "open" },
      { $set: { status: "resolved", resolvedAt: now, updatedAt: now } },
    );
    return;
  }
  await db.collection("operational_alerts").updateOne(
    { key: "three-low-value-cycles", status: "open" },
    {
      $set: {
        title: "Ba lượt liên tiếp chưa tạo đầu ra đủ mạnh",
        detail: "Shoyru sẽ đổi hướng công việc ở lượt kế tiếp thay vì tiếp tục đọc nguồn tương tự.",
        recentActions: rows.map((row) => row.actionType),
        updatedAt: now,
      },
      $setOnInsert: { key: "three-low-value-cycles", status: "open", createdAt: now },
    },
    { upsert: true },
  );
}

async function backfillRecentJournals(db: Db) {
  const jobs = await db.collection("agent_jobs")
    .find({ status: "completed", slot: { $type: "string" } })
    .sort({ completedAt: -1 })
    .limit(48)
    .project({ slot: 1 })
    .toArray();
  const slots = [...new Set(jobs.map((job) => String(job.slot || "")).filter(Boolean))];
  const results = await Promise.allSettled(slots.map((slot) => ensureCycleJournal(db, slot)));
  return results.filter((result) => result.status === "fulfilled" && result.value.inserted).length;
}

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
  await queueMissingRecentCycles(db, now);
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
      ensureCycleJournal(db, slot),
    ]);
    await Promise.allSettled([
      recordOperationalSnapshot(db),
      createDailyBackup(db),
      reviewRecentProductivity(db),
      backfillRecentJournals(db),
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
