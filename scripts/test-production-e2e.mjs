const base = process.env.SHOYRU_BASE_URL || "https://shoyruai.blissbiovn.com";
const checks = [
  { path: "/", contains: "Shoyru" },
  { path: "/store", contains: "Shoyru" },
  { path: "/store/bo-khoi-tao-ai-shoyru", contains: "79.000" },
  { path: "/free", contains: "Starter Mini" },
  { path: "/api/free-starter", contains: "SHOYRU STARTER MINI" },
  { path: "/feed.xml", contains: "<rss version=\"2.0\">" },
  { path: "/b3f08a6c9d2e4175a8c6e1f94b7d203a.txt", contains: "b3f08a6c9d2e4175a8c6e1f94b7d203a" },
  { path: "/api/health/search", json: (data) => data.configured && data.lastStatus === "success" },
  { path: "/api/health/github", json: (data) => data.configured && data.ok && data.canPush },
  { path: "/api/health/commerce", json: (data) => data.ok },
  { path: "/api/state", json: (data) => data.demo === false && data.lastRunAt },
];

let failed = 0;
for (const check of checks) {
  try {
    const response = await fetch(`${base}${check.path}`, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Shoyru production E2E/1.0" },
    });
    const body = await response.text();
    let valid = response.ok;
    if (valid && check.contains) valid = body.includes(check.contains);
    if (valid && check.json) valid = Boolean(check.json(JSON.parse(body)));
    console.log(`${valid ? "PASS" : "FAIL"} ${check.path} HTTP ${response.status}`);
    if (!valid) failed += 1;
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${check.path} ${error instanceof Error ? error.message : error}`);
  }
}
if (failed) process.exitCode = 1;
