import { AsyncLocalStorage } from "node:async_hooks";

// Shared by the Worker entrypoint and the separately bundled Next server.
export const mongoRequestScope =
  (globalThis[Symbol.for("aishoyru.mongoRequestScope")] ??= new AsyncLocalStorage());
