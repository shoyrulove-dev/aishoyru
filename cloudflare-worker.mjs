import next from "./.open-next/worker.js";
import { mongoRequestScope } from "./src/lib/mongo-request-scope.mjs";

export * from "./.open-next/worker.js";

async function closeMongo(scope) {
  try {
    await scope.client?.close();
  } catch (error) {
    console.warn("MongoDB request cleanup failed", error?.name);
  }
}

function fetchWithMongoScope(request, env, ctx) {
    const scope = {};
    return mongoRequestScope.run(scope, async () => {
      try {
        const response = await next.fetch(request, env, ctx);
        if (!scope.client || !response.body || response.status === 101) {
          ctx.waitUntil(closeMongo(scope));
          return response;
        }

        const stream = new TransformStream();
        ctx.waitUntil(response.body.pipeTo(stream.writable)
          .catch(() => {})
          .finally(() => closeMongo(scope)));
        return new Response(stream.readable, response);
      } catch (error) {
        ctx.waitUntil(closeMongo(scope));
        throw error;
      }
    });
}

const scheduledRoutes = new Map([
  ["*/10 * * * *", "/api/cron/agent"],
  ["2,17,32,47 * * * *", "/api/cron/quant"],
]);

const worker = {
  fetch: fetchWithMongoScope,
  async scheduled(controller, env, ctx) {
    const route = scheduledRoutes.get(controller.cron);
    if (!route) throw new Error("Unknown Shoyru cron trigger");
    if (!env.CRON_SECRET) throw new Error("Shoyru cron credential is not configured");
    const request = new Request(`https://shoyruai.blissbiovn.com${route}`, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
    const response = await fetchWithMongoScope(request, env, ctx);
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) {
      throw new Error(`Shoyru cron ${route} failed (HTTP ${response.status})`);
    }
    console.info("Shoyru cron completed", { route, skipped: result.skipped === true });
  },
};

export default worker;
