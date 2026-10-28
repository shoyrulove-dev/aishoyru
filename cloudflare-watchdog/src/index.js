const worker = {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(wakeShoyru(env));
  },

  async fetch(_request, env) {
    const result = await wakeShoyru(env);
    return Response.json(result);
  },
};

export default worker;

async function wakeShoyru(env) {
  const response = await fetch(env.SHOYRU_HEARTBEAT_URL, {
    headers: { "User-Agent": "Shoyru-Cloudflare-Watchdog/1.0" },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Heartbeat HTTP ${response.status}: ${body.slice(0, 200)}`);
  return { ok: true, status: response.status, heartbeat: JSON.parse(body) };
}
