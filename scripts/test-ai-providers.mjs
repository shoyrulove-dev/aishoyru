import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.ai.local");
if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const position = line.indexOf("=");
    if (position < 1) continue;
    const key = line.slice(0, position).trim();
    let value = line.slice(position + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

const numberArg = (name, fallback) => {
  const prefix = `--${name}=`;
  const raw = process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
  const value = Number(raw || process.env[`AI_TEST_${name.toUpperCase()}`] || fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};
const requests = numberArg("requests", 1);
const concurrency = numberArg("concurrency", 1);
const timeoutMs = numberArg("timeout_ms", 30000);
const maxTokens = numberArg("max_tokens", 256);
const stringArg = (name, fallback = "") => {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || fallback;
};
const providerFilter = stringArg("provider").toLowerCase();
const modelOverride = stringArg("model");
const prompt = process.env.AI_TEST_PROMPT || "Chỉ trả lời một câu tiếng Việt ngắn: Shoyru đã sẵn sàng.";

let providers = [
  ["Groq", "GROQ", "openai", "https://api.groq.com/openai/v1", "openai/gpt-oss-20b"],
  ["OpenRouter", "OPENROUTER", "openai", "https://openrouter.ai/api/v1", "openrouter/free"],
  ["Kilo", "KILO", "openai", "https://ai-gateway.kilo.ai/api/v1", "kilo-auto/free"],
  ["Radox AI", "RADOX", "openai", "https://radoxai.com/v1", ""],
  ["Cerebras", "CEREBRAS", "openai", "https://api.cerebras.ai/v1", ""],
  ["Gemini", "GEMINI", "openai", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-3.8-flash"],
  ["Hugging Face", "HUGGINGFACE", "openai", "https://router.huggingface.co/v1", "openai/gpt-oss-120b:fastest"],
  ["Cohere", "COHERE", "cohere", "https://api.cohere.com/v2", "command-a-03-2025"],
  ["Mistral", "MISTRAL", "openai", "https://api.mistral.ai/v1", "mistral-small-latest"],
  ["SambaNova", "SAMBANOVA", "openai", "https://api.sambanova.ai/v1", ""],
  ["Vercel AI Gateway", "VERCEL_AI_GATEWAY", "openai", "https://ai-gateway.vercel.sh/v1", "openai/gpt-oss-20b"],
  ["NVIDIA NIM", "NVIDIA_NIM", "openai", "https://integrate.api.nvidia.com/v1", "meta/llama-3.1-8b-instruct"],
].map(([name, prefix, protocol, defaultBaseURL, defaultModel]) => ({
  name,
  protocol,
  key: process.env[`${prefix}_API_KEY`] || "",
  baseURL: (process.env[`${prefix}_BASE_URL`] || defaultBaseURL).replace(/\/$/, ""),
  model: process.env[`${prefix}_MODEL`] || defaultModel,
}));

providers.push({
  name: "Cloudflare Workers AI",
  protocol: "cloudflare",
  key: process.env.CLOUDFLARE_AI_API_TOKEN || "",
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
  baseURL: "https://api.cloudflare.com/client/v4",
  model: process.env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct",
});

if (providerFilter) {
  providers = providers.filter((provider) =>
    provider.name.toLowerCase().includes(providerFilter));
}
if (modelOverride && providers.length === 1) providers[0].model = modelOverride;

const classify = (status, body) => {
  const message = String(body?.error?.message || body?.message || "").toLowerCase();
  if (status === 401 || status === 403) return "AUTH";
  if (status === 402) return "CREDIT";
  if (status === 429 || /rate|quota|limit/.test(message)) return "RATE_LIMIT";
  if (status >= 500) return "UPSTREAM";
  if (status >= 400) return "REQUEST";
  return "OK";
};

const rateHeaders = (headers) => ({
  limit: headers.get("x-ratelimit-limit-requests") || headers.get("x-ratelimit-limit") || headers.get("ratelimit-limit") || "",
  remaining: headers.get("x-ratelimit-remaining-requests") || headers.get("ratelimit-remaining") || "",
  reset: headers.get("x-ratelimit-reset-requests") || headers.get("ratelimit-reset") || "",
  tokenLimit: headers.get("x-ratelimit-limit-tokens") || "",
  tokenRemaining: headers.get("x-ratelimit-remaining-tokens") || "",
  retryAfter: headers.get("retry-after") || "",
});

async function discoverModel(provider) {
  if (provider.model || provider.protocol === "cohere" || provider.protocol === "cloudflare") return provider.model;
  const response = await fetch(`${provider.baseURL}/models`, {
    headers: { Authorization: `Bearer ${provider.key}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`MODEL_LIST_${response.status}`);
  return String(body?.data?.find((item) => item?.id)?.id || "");
}

async function oneRequest(provider, model) {
  const started = performance.now();
  const url = provider.protocol === "cloudflare"
    ? `${provider.baseURL}/accounts/${provider.accountId}/ai/run/${model}`
    : provider.protocol === "cohere"
    ? `${provider.baseURL}/chat`
    : `${provider.baseURL}/chat/completions`;
  const payload = provider.protocol === "cloudflare"
    ? { messages: [{ role: "user", content: prompt }], max_tokens: maxTokens }
    : provider.protocol === "cohere"
    ? { model, messages: [{ role: "user", content: prompt }], max_tokens: maxTokens }
    : { model, messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, stream: false };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.key}`,
        "Content-Type": "application/json",
        ...(provider.name === "OpenRouter" ? {
          "HTTP-Referer": "https://shoyruai.blissbiovn.com",
          "X-Title": "Shoyru provider benchmark",
        } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.json().catch(() => ({}));
    const content = provider.protocol === "cloudflare"
      ? body?.result?.response
      : provider.protocol === "cohere"
      ? body?.message?.content?.map?.((item) => item?.text || "").join("")
      : body?.choices?.[0]?.message?.content;
    const usage = body?.usage || {};
    return {
      status: response.status,
      result: classify(response.status, body),
      latencyMs: Math.round(performance.now() - started),
      hasText: Boolean(String(content || "").trim()),
      inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? "",
      outputTokens: usage.completion_tokens ?? usage.output_tokens ?? "",
      errorCode: body?.error?.code || body?.error?.type || "",
      ...rateHeaders(response.headers),
    };
  } catch (error) {
    return {
      status: 0,
      result: error?.name === "TimeoutError" ? "TIMEOUT" : "NETWORK",
      latencyMs: Math.round(performance.now() - started),
      hasText: false,
      inputTokens: "",
      outputTokens: "",
      limit: "",
      remaining: "",
      reset: "",
      tokenLimit: "",
      tokenRemaining: "",
      retryAfter: "",
      errorCode: "",
    };
  }
}

async function testProvider(provider) {
  if (!provider.key)
    return [{ provider: provider.name, model: provider.model || "auto", result: "SKIPPED_NO_KEY" }];
  if (provider.protocol === "cloudflare" && !provider.accountId)
    return [{ provider: provider.name, model: provider.model, result: "SKIPPED_NO_ACCOUNT_ID" }];
  let model;
  try {
    model = await discoverModel(provider);
  } catch (error) {
    return [{ provider: provider.name, model: "auto", result: String(error.message) }];
  }
  if (!model)
    return [{ provider: provider.name, model: "auto", result: "MODEL_REQUIRED" }];

  const results = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < requests) {
      const index = cursor++;
      results[index] = await oneRequest(provider, model);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker));
  return results.map((result, index) => ({ provider: provider.name, model, request: index + 1, ...result }));
}

console.log(`Testing ${providers.length} providers · ${requests} request(s)/provider · concurrency ${concurrency}`);
console.log("Keys and response content are never printed.\n");
const rows = [];
for (const provider of providers) rows.push(...await testProvider(provider));
console.table(rows);

const failures = rows.filter((row) => !["OK", "SKIPPED_NO_KEY"].includes(row.result));
if (failures.length) process.exitCode = 2;
