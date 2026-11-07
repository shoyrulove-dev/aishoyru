import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { classifyProviderError, providerCanBeProbed } from "@/lib/ai-health";

export async function GET() {
  const db = await getDb();
  if (!db)
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  const rows = await db.collection("ai_provider_health")
    .find({})
    .sort({ updatedAt: -1 })
    .project({ provider: 1, model: 1, status: 1, consecutiveFailures: 1, lastError: 1, failureType: 1, nextProbeAt: 1, updatedAt: 1, _id: 0 })
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
      : row?.failureType || classifyProviderError(new Error(error));
    const eligibleForProbe = providerCanBeProbed(row);
    const reportedStatus = row?.status === "cooldown" && eligibleForProbe ? "probe-due" : row?.status || "untested";
    const availableNow = eligibleForProbe && ["healthy", "degraded", "untested"].includes(String(row?.status || "untested"));
    return {
      name,
      status: reportedStatus,
      availableNow,
      eligibleForProbe,
      consecutiveFailures: Number(row?.consecutiveFailures || 0),
      failureType,
      nextProbeAt: row?.nextProbeAt || null,
      updatedAt: row?.updatedAt || null,
    };
  });
  const available = providers.filter((provider) => provider.availableNow).length;
  const probeDue = providers.filter((provider) => provider.status === "probe-due").length;
  const operational = configured.length > 0 && (available > 0 || probeDue > 0);
  return NextResponse.json(
    { ok: operational, configured: configured.length, available, probeDue, providers },
    { status: operational ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
