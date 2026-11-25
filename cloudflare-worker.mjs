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

export default {
  fetch(request, env, ctx) {
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
  },
};
