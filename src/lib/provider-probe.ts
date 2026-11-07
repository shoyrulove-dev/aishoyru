import OpenAI from "openai";
import type { Db } from "mongodb";
import {
  classifyProviderError,
  providerTimeoutMs,
  recordProviderFailure,
  recordProviderSuccess,
} from "./ai-health";

type ProbeConfig = {
  name: "gemini" | "cloudflare" | "nvidia";
  apiKey?: string;
  baseURL: string;
  model: string;
  expectedHost: string;
};

const configs = (): ProbeConfig[] => [
  {
    name: "gemini",
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash-lite",
    expectedHost: "generativelanguage.googleapis.com",
  },
  {
    name: "cloudflare",
    apiKey: process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_AI_API_TOKEN
      ? process.env.CLOUDFLARE_AI_API_TOKEN
      : undefined,
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID || ""}/ai/v1`,
    model: "@cf/meta/llama-3.1-8b-instruct",
    expectedHost: "api.cloudflare.com",
  },
  {
    name: "nvidia",
    apiKey: process.env.NVIDIA_NIM_API_KEY,
    baseURL: process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1",
    model: process.env.NVIDIA_NIM_MODEL || "nvidia/nemotron-3.5-bolt-e4b",
    expectedHost: "integrate.api.nvidia.com",
  },
];

const configShape = (config: ProbeConfig) => {
  let url: URL | null = null;
  try { url = new URL(config.baseURL); } catch { /* reported below */ }
  return {
    keyPresent: Boolean(config.apiKey && config.apiKey !== "[SENSITIVE]"),
    baseUrlValid: Boolean(url && url.protocol === "https:"),
    expectedHost: url?.host === config.expectedHost,
    modelPresent: Boolean(config.model && config.model !== "[SENSITIVE]"),
    modelLooksValid: config.name === "gemini"
      ? /^gemini-[\w.-]+$/.test(config.model)
      : config.name === "cloudflare"
        ? config.model.startsWith("@cf/")
        : config.model.includes("/"),
  };
};

async function probeOne(db: Db, config: ProbeConfig) {
  const shape = configShape(config);
  if (!Object.values(shape).every(Boolean)) {
    return { provider: config.name, ok: false, config: shape, failureType: "configuration", status: 0, latencyMs: 0 };
  }
  const startedAt = Date.now();
  try {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL.replace(/\/$/, ""),
      timeout: Math.max(20_000, providerTimeoutMs(config.name)),
      maxRetries: 0,
    });
    const messages = [
      { role: "system" as const, content: "Chỉ trả về đúng một JSON object hợp lệ." },
      { role: "user" as const, content: "Trả về {\"status\":\"sẵn sàng\"}." },
    ];
    let response;
    let strictJson = true;
    try {
      response = await client.chat.completions.create({
        model: config.model,
        messages,
        max_tokens: 80,
        stream: false,
        response_format: { type: "json_object" },
      });
    } catch (error) {
      const status = Number((error as { status?: number })?.status || 0);
      const message = error instanceof Error ? error.message : String(error);
      if (status !== 400 && !/response_format|json_object|unsupported/i.test(message)) throw error;
      strictJson = false;
      response = await client.chat.completions.create({
        model: config.model,
        messages,
        max_tokens: 80,
        stream: false,
      });
    }
    const content = String(response.choices[0]?.message?.content || "").trim();
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    JSON.parse(start >= 0 && end > start ? content.slice(start, end + 1) : content);
    const latencyMs = Date.now() - startedAt;
    await recordProviderSuccess(db, config.name, config.model, latencyMs, {
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
    });
    return { provider: config.name, ok: true, config: shape, status: 200, latencyMs, strictJson };
  } catch (error) {
    await recordProviderFailure(db, config.name, config.model, error);
    return {
      provider: config.name,
      ok: false,
      config: shape,
      failureType: classifyProviderError(error),
      status: Number((error as { status?: number })?.status || 0),
      code: String((error as { code?: string })?.code || "").slice(0, 60),
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function runCoreProviderProbe(db: Db) {
  const results = [];
  for (const config of configs()) results.push(await probeOne(db, config));
  const report = {
    version: 2,
    checkedAt: new Date(),
    ok: results.some((item) => item.ok),
    healthy: results.filter((item) => item.ok).length,
    results,
  };
  await db.collection("ai_probe_reports").updateOne(
    { key: "core-v2" },
    { $set: { ...report, key: "core-v2" } },
    { upsert: true },
  );
  return report;
}
