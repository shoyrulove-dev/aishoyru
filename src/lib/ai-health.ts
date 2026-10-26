import type { Db } from "mongodb";

const FAILURE_LIMIT = 3;
const COOLDOWN_MS = 20 * 60 * 1000;

export async function providerIsCoolingDown(db: Db, provider: string) {
  const health = await db.collection("ai_provider_health").findOne(
    { provider },
    { projection: { cooldownUntil: 1 } },
  );
  return health?.cooldownUntil instanceof Date && health.cooldownUntil > new Date();
}

export async function recordProviderSuccess(
  db: Db,
  provider: string,
  model: string,
  latencyMs: number,
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
