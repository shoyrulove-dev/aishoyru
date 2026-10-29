import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  const db = await getDb();
  if (!db)
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  const rows = await db.collection("ai_provider_health")
    .find({})
    .sort({ updatedAt: -1 })
    .project({ provider: 1, model: 1, status: 1, consecutiveFailures: 1, lastError: 1, updatedAt: 1, _id: 0 })
    .toArray();
  const configured = [
    ["groq", process.env.GROQ_API_KEY],
    ["nvidia", process.env.NVIDIA_NIM_API_KEY],
    ["cloudflare", process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_AI_API_TOKEN],
    ["gemini", process.env.GEMINI_API_KEY],
    ["cerebras", process.env.CEREBRAS_API_KEY],
    ["mistral", process.env.MISTRAL_API_KEY],
    ["huggingface", process.env.HUGGINGFACE_API_KEY],
    ["sambanova", process.env.SAMBANOVA_API_KEY],
    ["radox", process.env.RADOX_API_KEY],
    ["openrouter", process.env.OPENROUTER_API_KEY],
    ["kilo", process.env.KILO_API_KEY],
    ["oxion", process.env.OXION_API_KEY],
    ["openai", process.env.OPENAI_API_KEY],
  ].filter(([, key]) => Boolean(key)).map(([name]) => name);
  const providers = configured.map((name) => {
    const row = rows.find((item) => item.provider === name || (name === "kilo" && item.provider === "kilo-fallback"));
    const error = String(row?.lastError || "");
    const failureType = row?.status === "healthy" || !error
      ? null
      : /401|403|unauthor|forbidden|invalid.*key|authentication/i.test(error)
        ? "auth"
        : /429|rate|quota|limit|credit|balance|insufficient/i.test(error)
          ? "quota"
          : /404|model.+not|unknown model|does not exist/i.test(error)
            ? "model"
            : /400|response_format|json_object|unsupported|invalid request/i.test(error)
              ? "request-format"
              : /timeout|timed out|abort/i.test(error)
                ? "timeout"
                : /tiếng Việt|public|JSON|parse/i.test(error)
                  ? "invalid-output"
                  : "upstream";
    return {
      name,
      status: row?.status || "untested",
      consecutiveFailures: Number(row?.consecutiveFailures || 0),
      failureType,
      updatedAt: row?.updatedAt || null,
    };
  });
  const available = providers.filter((provider) => provider.status !== "down" && provider.status !== "cooldown").length;
  return NextResponse.json(
    { ok: configured.length > 0 && available > 0, configured: configured.length, available, providers },
    { status: configured.length > 0 && available > 0 ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
