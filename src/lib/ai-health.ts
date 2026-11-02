import type { Db } from "mongodb";

const FAILURE_LIMIT = 3;

export type ProviderFailureType = "auth" | "quota" | "model" | "request-format" | "timeout" | "invalid-output" | "upstream";

export function classifyProviderError(error: unknown): ProviderFailureType {
  const message = error instanceof Error ? error.message : String(error);
  const status = Number((error as { status?: number } | null)?.status || 0);
  if (status === 401 || status === 403 || /unauthor|forbidden|invalid.*key|authentication/i.test(message)) return "auth";
  if (status === 429 || /rate|quota|limit|credit|balance|insufficient/i.test(message)) return "quota";
  if (status === 404 || /model.+not|unknown model|does not exist/i.test(message)) return "model";
  if (status === 400 || /response_format|json_object|unsupported|invalid request/i.test(message)) return "request-format";
  if (/timeout|timed out|abort/i.test(message)) return "timeout";
  if (/tiếng Việt|public|JSON|parse/i.test(message)) return "invalid-output";
  return "upstream";
}

const retryDelay = (type: ProviderFailureType, failures: number) => {
  if (type === "auth") return 6 * 60 * 60 * 1000;
  if (type === "quota") return 2 * 60 * 60 * 1000;
  if (type === "model" || type === "request-format") return 60 * 60 * 1000;
  if (type === "timeout") return Math.min(30, 5 * Math.max(1, failures - 1)) * 60 * 1000;
  return Math.min(30, 10 * Math.max(1, failures - 1)) * 60 * 1000;
};

export function providerTimeoutMs(provider: string) {
  if (provider === "groq") return 8_000;
  if (["nvidia", "gemini", "openrouter", "kilo", "kilo-fallback"].includes(provider)) return 15_000;
  if (provider === "cloudflare") return 12_000;
  return 10_000;
}

export async function providerIsCoolingDown(db: Db, provider: string) {
  const health = await db.collection("ai_provider_health").findOne(
    { provider },
    { projection: { nextProbeAt: 1, cooldownUntil: 1 } },
  );
  const now = new Date();
  return Boolean(
    (health?.nextProbeAt instanceof Date && health.nextProbeAt > now) ||
      (health?.cooldownUntil instanceof Date && health.cooldownUntil > now),
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
        nextProbeAt: null,
        lastSuccessAt: now,
        lastLatencyMs: latencyMs,
        updatedAt: now,
      },
      $unset: { lastError: "", failureType: "" },
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
  const failureType = classifyProviderError(error);
  const cooling = failures >= FAILURE_LIMIT;
  const delay = retryDelay(failureType, failures);
  await db.collection("ai_provider_health").updateOne(
    { provider },
    {
      $set: {
        model,
        status: cooling ? "cooldown" : "degraded",
        failureType,
        consecutiveFailures: failures,
        cooldownUntil: cooling ? new Date(now.getTime() + delay) : null,
        nextProbeAt: new Date(now.getTime() + delay),
        lastFailureAt: now,
        lastError: (error instanceof Error ? error.message : String(error)).slice(0, 240),
        updatedAt: now,
      },
      $inc: { totalFailure: 1 },
    },
    { upsert: true },
  );
}
