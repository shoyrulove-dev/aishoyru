import type { Db } from "mongodb";

const FAILURE_LIMIT = 3;
const COOLDOWN_MS = 20 * 60 * 1000;
const PROBE_AFTER_MS = 5 * 60 * 1000;

export async function providerIsCoolingDown(db: Db, provider: string) {
  const health = await db.collection("ai_provider_health").findOne(
    { provider },
    { projection: { cooldownUntil: 1, updatedAt: 1 } },
  );
  const now = new Date();
  const updatedAt = health?.updatedAt instanceof Date ? health.updatedAt : null;
  return Boolean(
    health?.cooldownUntil instanceof Date &&
      health.cooldownUntil > now &&
      updatedAt &&
      now.getTime() - updatedAt.getTime() < PROBE_AFTER_MS,
  );
}

export async function recordProviderSuccess(
  db: Db,
  provider: string,
  model: string,
  latencyMs: number,
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number },
) {
  const now = new Date();
  await db.collection("ai_provider_health").updateOne(
    { provider },
    {
      $set: {
        model,
        status: "healthy",
        consecutiveFailures: 0,
        cooldownUntil: null,
        lastSuccessAt: now,
        lastLatencyMs: latencyMs,
        updatedAt: now,
      },
      $inc: { totalSuccess: 1 },
    },
    { upsert: true },
  );
  if (usage) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    await db.collection("ai_usage_daily").updateOne(
      { day, provider, model },
      {
        $inc: {
          requests: 1,
          promptTokens: Number(usage.promptTokens || 0),
          completionTokens: Number(usage.completionTokens || 0),
          totalTokens: Number(usage.totalTokens || 0),
        },
        $set: { updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }
}

export async function recordProviderFailure(
  db: Db,
  provider: string,
  model: string,
  error: unknown,
) {
  const previous = await db.collection("ai_provider_health").findOne(
    { provider },
    { projection: { consecutiveFailures: 1 } },
  );
  const failures = Number(previous?.consecutiveFailures || 0) + 1;
  const now = new Date();
  const cooling = failures >= FAILURE_LIMIT;
  await db.collection("ai_provider_health").updateOne(
    { provider },
    {
      $set: {
        model,
        status: cooling ? "cooldown" : "degraded",
        consecutiveFailures: failures,
        cooldownUntil: cooling ? new Date(now.getTime() + COOLDOWN_MS) : null,
        lastFailureAt: now,
        lastError: (error instanceof Error ? error.message : String(error)).slice(0, 240),
        updatedAt: now,
      },
      $inc: { totalFailure: 1 },
    },
    { upsert: true },
  );
}
