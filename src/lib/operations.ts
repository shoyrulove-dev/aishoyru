import type { Db, Document } from "mongodb";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const MAX_ATTEMPTS = 3;
const JOB_LEASE = 5 * MINUTE;

export type CycleSource = "github-cron" | "public-heartbeat";

export async function ensureOperationalIndexes(db: Db) {
  await Promise.all([
    db.collection("agent_jobs").createIndex({ status: 1, nextAttemptAt: 1 }),
    db.collection("agent_jobs").createIndex({ leaseUntil: 1 }),
    db.collection("agent_jobs").createIndex({ updatedAt: -1 }),
    db.collection("system_backups").createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    ),
    db.collection("system_backups").createIndex({ createdAt: -1 }),
    db.collection("operational_snapshots").createIndex({ createdAt: -1 }),
    db.collection("agent_jobs").createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    ),
    db.collection("operational_snapshots").createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    ),
  ]).catch(() => undefined);
}

export async function recoverStaleOperations(db: Db, now = new Date()) {
  const staleJobs = await db.collection("agent_jobs").updateMany(
    { status: "running", leaseUntil: { $lte: now }, attempts: { $lt: MAX_ATTEMPTS } },
    {
      $set: {
        status: "retry",
        nextAttemptAt: now,
        lastError: "Lượt trước hết hạn giữ việc; watchdog đã đưa vào hàng chờ lại.",
        updatedAt: now,
      },
      $unset: { leaseUntil: "", worker: "" },
    },
  );
  const deadJobs = await db.collection("agent_jobs").updateMany(
    { status: "running", leaseUntil: { $lte: now }, attempts: { $gte: MAX_ATTEMPTS } },
    {
      $set: {
        status: "dead-letter",
        failedAt: now,
        lastError: "Công việc hết lease sau ba lần thử.",
        updatedAt: now,
      },
      $unset: { leaseUntil: "", worker: "" },
    },
  );
  await db.collection("agent_cycle_claims").updateMany(
    { status: "running", expiresAt: { $lte: now } },
    {
      $set: {
        status: "expired",
        failedAt: now,
        error: "Lease hết hạn; công việc đã được hàng đợi tiếp quản.",
      },
    },
  );
  const deadLetters = await db
    .collection("agent_jobs")
    .find({ status: "dead-letter", slot: { $type: "string" } })
    .project({ slot: 1 })
    .limit(100)
    .toArray();
  const deadSlots = [...new Set(deadLetters.map((job) => String(job.slot || "")).filter(Boolean))];
  const recoveredSlots = deadSlots.length
    ? await db.collection("agent_jobs").distinct("slot", {
        slot: { $in: deadSlots },
        status: "completed",
      })
    : [];
  const reconciled = recoveredSlots.length
    ? await db.collection("agent_jobs").updateMany(
        { status: "dead-letter", slot: { $in: recoveredSlots } },
        {
          $set: {
            status: "superseded",
            resolvedAt: now,
            updatedAt: now,
          },
        },
      )
    : { modifiedCount: 0 };
  return {
    recovered: staleJobs.modifiedCount,
    deadLettered: deadJobs.modifiedCount,
    reconciled: reconciled.modifiedCount,
  };
}

export async function queueMissingRecentCycles(db: Db, now = new Date()) {
  const queued: string[] = [];
  for (let offset = 2; offset >= 1; offset -= 1) {
    const value = new Date(now.getTime() - offset * 60 * MINUTE);
    const shifted = new Date(value.getTime() + 7 * 60 * MINUTE);
    const slot = [
      shifted.getUTCFullYear(),
      String(shifted.getUTCMonth() + 1).padStart(2, "0"),
      String(shifted.getUTCDate()).padStart(2, "0"),
      String(shifted.getUTCHours()).padStart(2, "0"),
    ].join("-");
    const exists = await db.collection("agent_jobs").findOne({ slot });
    if (exists) continue;
    await db.collection("agent_jobs").updateOne(
      { _id: `${slot}-backfill` as never },
      { $setOnInsert: { type: "agent-cycle", slot, status: "queued", attempts: 0, requestedBy: "watchdog-backfill", createdAt: now, updatedAt: now, nextAttemptAt: now, expiresAt: new Date(now.getTime() + 30 * DAY) } },
      { upsert: true },
    );
    queued.push(slot);
  }
  return queued;
}

export async function claimCycleJob(db: Db, slot: string, source: CycleSource, force = false) {
  const now = new Date();
  let id = force ? `${slot}-force-${crypto.randomUUID()}` : slot;
  if (!force) {
    const current = await db.collection("agent_jobs").findOne(
      { _id: id as never },
      { projection: { status: 1 } },
    );
    if (current?.status === "dead-letter") {
      id = `${slot}-recovery`;
      const recovery = await db.collection("agent_jobs").findOne(
        { _id: id as never },
        { projection: { status: 1, attempts: 1 } },
      );
      if (
        recovery?.status === "dead-letter" ||
        (recovery?.status === "retry" && Number(recovery.attempts || 0) >= 2)
      )
        id = `${slot}-recovery-2`;
    }
  }
  await db.collection("agent_jobs").updateOne(
    { _id: id as never },
    {
      $setOnInsert: {
        type: "agent-cycle",
        slot,
        status: "queued",
        attempts: 0,
        createdAt: now,
        nextAttemptAt: now,
        expiresAt: new Date(now.getTime() + 30 * DAY),
      },
      $set: { requestedBy: source, updatedAt: now },
    },
    { upsert: true },
  );
  const filter = force
    ? {
        _id: id as never,
        status: { $in: ["queued", "retry"] },
        nextAttemptAt: { $lte: now },
        attempts: { $lt: MAX_ATTEMPTS },
      }
    : {
        type: "agent-cycle",
        status: { $in: ["queued", "retry"] },
        nextAttemptAt: { $lte: now },
        attempts: { $lt: MAX_ATTEMPTS },
      };
  const job = await db.collection("agent_jobs").findOneAndUpdate(
    filter,
    {
      $set: {
        status: "running",
        worker: source,
        startedAt: now,
        leaseUntil: new Date(now.getTime() + JOB_LEASE),
        updatedAt: now,
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: "after", sort: { nextAttemptAt: 1, createdAt: 1 } },
  );
  return { id: job ? String(job._id) : id, job };
}

export async function completeCycleJob(db: Db, id: string, result?: Document) {
  const now = new Date();
  await db.collection("agent_jobs").updateOne(
    { _id: id as never, status: "running" },
    {
      $set: {
        status: "completed",
        completedAt: now,
        result: result || { ok: true },
        updatedAt: now,
      },
      $unset: { leaseUntil: "", worker: "", lastError: "" },
    },
  );
}

export async function failCycleJob(db: Db, id: string, error: unknown) {
  const now = new Date();
  const current = await db.collection("agent_jobs").findOne({ _id: id as never });
  const attempts = Number(current?.attempts || 1);
  const terminal = attempts >= MAX_ATTEMPTS;
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 400);
  await db.collection("agent_jobs").updateOne(
    { _id: id as never },
    {
      $set: {
        status: terminal ? "dead-letter" : "retry",
        lastError: message,
        failedAt: now,
        nextAttemptAt: new Date(now.getTime() + Math.min(30, 2 ** attempts * 3) * MINUTE),
        updatedAt: now,
      },
      $unset: { leaseUntil: "", worker: "" },
    },
  );
  return { terminal, attempts, message };
}

export async function recordOperationalSnapshot(db: Db) {
  const now = new Date();
  const since24h = new Date(now.getTime() - DAY);
  const vietnamNow = new Date(now.getTime() + 7 * 60 * MINUTE);
  const monthStart = new Date(
    Date.UTC(vietnamNow.getUTCFullYear(), vietnamNow.getUTCMonth(), 1) -
      7 * 60 * MINUTE,
  );
  const [state, jobs, providers, money, leads, engagement] = await Promise.all([
    db.collection("agent_state").findOne({ key: "main" }),
    db.collection("agent_jobs").aggregate([
      { $match: { updatedAt: { $gte: since24h } } },
      { $group: { _id: "$status", total: { $sum: 1 } } },
    ]).toArray(),
    db.collection("ai_provider_health").find({}).project({ provider: 1, model: 1, status: 1, lastLatencyMs: 1, consecutiveFailures: 1, updatedAt: 1 }).toArray(),
    db.collection("transactions").aggregate([
      { $match: { verified: true, createdAt: { $gte: monthStart } } },
      { $group: { _id: "$kind", total: { $sum: "$amount" } } },
    ]).toArray(),
    db.collection("lead_crm").aggregate([
      { $group: { _id: "$status", total: { $sum: 1 } } },
    ]).toArray(),
    db.collection("engagement_events").aggregate([
      { $match: { createdAt: { $gte: since24h } } },
      { $group: { _id: "$type", total: { $sum: 1 } } },
    ]).toArray(),
  ]);
  const value = (rows: Document[], key: string) => Number(rows.find((row) => row._id === key)?.total || 0);
  const verifiedIncome = value(money, "income");
  const verifiedExpense = value(money, "expense");
  const remainingFunds = Math.max(0, 500000 + verifiedIncome - verifiedExpense);
  const snapshot = {
    createdAt: now,
    expiresAt: new Date(now.getTime() + 90 * DAY),
    lastRunAt: state?.lastRunAt || null,
    status: state?.status || "unknown",
    jobs: Object.fromEntries(jobs.map((row) => [String(row._id), Number(row.total || 0)])),
    providers,
    survival: {
      fundedBudget: 500000,
      verifiedIncome,
      verifiedExpense,
      remainingFunds,
      runwayDays: Math.floor(remainingFunds / (500000 / 30)),
    },
    funnel: {
      sourced: leads.reduce((sum, row) => sum + Number(row.total || 0), 0),
      qualified: value(leads, "qualified") + value(leads, "contacted") + value(leads, "replied") + value(leads, "converted"),
      contacted: value(leads, "contacted") + value(leads, "replied") + value(leads, "converted"),
      replied: value(leads, "replied") + value(leads, "converted"),
      converted: value(leads, "converted"),
      productViews24h: value(engagement, "product_view"),
      payments24h: value(engagement, "payment_verified"),
    },
  };
  await db.collection("operational_snapshots").insertOne(snapshot);
  return snapshot;
}

export async function createDailyBackup(db: Db) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const existing = await db.collection("system_backups").findOne({ day });
  if (existing) return { created: false, day };
  const [state, plans, campaigns, leads, lessons, instructions, trials, assets, financialTruth] = await Promise.all([
    db.collection("agent_state").find({}).limit(20).toArray(),
    db.collection("agent_plans").find({}).sort({ updatedAt: -1 }).limit(20).toArray(),
    db.collection("growth_campaigns").find({}).sort({ updatedAt: -1 }).limit(20).toArray(),
    db.collection("lead_crm").find({}).sort({ updatedAt: -1 }).limit(500).toArray(),
    db.collection("agent_lessons").find({}).sort({ updatedAt: -1 }).limit(200).toArray(),
    db.collection("owner_instructions").find({}).sort({ createdAt: -1 }).limit(100).toArray(),
    db.collection("survival_trials").find({}).sort({ updatedAt: -1 }).limit(30).toArray(),
    db.collection("asset_library").find({}).sort({ updatedAt: -1 }).limit(200).toArray(),
    db.collection("financial_truth").find({}).limit(10).toArray(),
  ]);
  await db.collection("system_backups").insertOne({
    day,
    version: 1,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * DAY),
    collections: { agent_state: state, agent_plans: plans, growth_campaigns: campaigns, lead_crm: leads, agent_lessons: lessons, owner_instructions: instructions, survival_trials: trials, asset_library: assets, financial_truth: financialTruth },
    counts: { state: state.length, plans: plans.length, campaigns: campaigns.length, leads: leads.length, lessons: lessons.length, instructions: instructions.length, trials: trials.length, assets: assets.length, financialTruth: financialTruth.length },
  });
  return { created: true, day };
}

export async function getOperationalHealth(db: Db) {
  const now = new Date();
  const [state, latestJobs, latestBackup, latestSnapshot, deadLetters] = await Promise.all([
    db.collection("agent_state").findOne({ key: "main" }),
    db.collection("agent_jobs").find({}).sort({ updatedAt: -1 }).limit(72).toArray(),
    db.collection("system_backups").findOne({}, { sort: { createdAt: -1 }, projection: { collections: 0 } }),
    db.collection("operational_snapshots").findOne({}, { sort: { createdAt: -1 } }),
    db.collection("agent_jobs").countDocuments({ status: "dead-letter" }),
  ]);
  const lastRunAt = state?.lastRunAt ? new Date(state.lastRunAt as Date) : null;
  const ageMinutes = lastRunAt ? Math.round((now.getTime() - lastRunAt.getTime()) / MINUTE) : null;
  const slotKey = (value: Date) => {
    const shifted = new Date(value.getTime() + 7 * 60 * MINUTE);
    return [
      shifted.getUTCFullYear(),
      String(shifted.getUTCMonth() + 1).padStart(2, "0"),
      String(shifted.getUTCDate()).padStart(2, "0"),
      String(shifted.getUTCHours()).padStart(2, "0"),
    ].join("-");
  };
  const schedule24h = Array.from({ length: 24 }, (_, index) => {
    const hour = new Date(now.getTime() - (23 - index) * 60 * MINUTE);
    const slot = slotKey(hour);
    const matching = latestJobs.filter((job) => String(job.slot || "") === slot);
    const completed = matching.find((job) => job.status === "completed");
    const active = completed || matching[0];
    return {
      slot,
      hour: `${slot.slice(-2)}:00`,
      status: active?.status || "missing",
      attempts: Number(active?.attempts || 0),
      source: active?.requestedBy || null,
      completedAt: active?.completedAt || null,
      provider: active?.result?.provider || null,
    };
  });
  const completedSlots = schedule24h.filter((slot) => slot.status === "completed").length;
  return {
    status: ageMinutes === null ? "unknown" : ageMinutes > 90 ? "delayed" : "healthy",
    lastWakeAt: latestJobs[0]?.updatedAt || null,
    lastCompletedAt: latestJobs.find((job) => job.status === "completed")?.completedAt || null,
    lastRunAt,
    ageMinutes,
    deadLetters,
    completionRate24h: Math.round((completedSlots / schedule24h.length) * 100),
    schedule24h,
    jobs: latestJobs,
    backup: latestBackup || null,
    snapshot: latestSnapshot || null,
  };
}

export function normalizeSupportRequest(input?: Record<string, unknown> | null) {
  if (!input) return null;
  const result = {
    title: String(input.title || "").trim(),
    reason: String(input.reason || "").trim(),
    needed: String(input.needed || "").trim(),
    impact: String(input.impact || "").trim(),
    where: String(input.where || "").trim(),
    doneWhen: String(input.doneWhen || "").trim(),
  };
  if (Object.values(result).some((value) => value.length < 4)) return null;
  return result;
}
