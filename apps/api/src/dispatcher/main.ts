import "../instrumentation";
import "reflect-metadata";

import { Queue } from "bullmq";

import { BullMqSimulationQueue } from "../queue/bullmq-simulation-queue";
import {
  S3AssetObjectStore,
  UnavailableAssetObjectStore,
} from "../assets/s3-asset-object-store";
import {
  SIMULATION_JOB_NAME,
  SIMULATION_QUEUE_NAME,
} from "../queue/queue.constants";
import type { SimulationJobData } from "../queue/simulation-job";
import { runDispatcherService } from "./dispatcher-service";
import { parseDispatcherRuntime } from "./dispatcher-runtime";
import {
  createDispatcherPool,
  PgRunOutboxDatabase,
} from "./pg-run-outbox-database";
import { RunOutboxDispatcher } from "./run-outbox-dispatcher";
import { observabilityRuntime } from "../instrumentation";
import { RedisOrganizationCachePurger } from "./organization-cache-purger";
import { OrganizationDeletionReconciler } from "./organization-deletion-reconciler";
import {
  DispatcherHealthServer,
  DispatcherHealthState,
} from "./dispatcher-health";

async function bootstrap(): Promise<void> {
  const config = parseDispatcherRuntime();
  const pool = createDispatcherPool(config);
  const queue = new Queue<SimulationJobData, void, typeof SIMULATION_JOB_NAME>(
    SIMULATION_QUEUE_NAME,
    {
      connection: config.redisConnection,
      prefix: "simula:v2",
    },
  );
  const database = new PgRunOutboxDatabase(pool, config.migrationHead);
  const transport = new BullMqSimulationQueue(queue);
  const dispatcher = new RunOutboxDispatcher(database, transport);
  const objectStore =
    config.assetStorage === undefined
      ? new UnavailableAssetObjectStore()
      : new S3AssetObjectStore(config.assetStorage);
  const cache = new RedisOrganizationCachePurger(
    config.redisConnection,
    config.rateLimitKeyPrefix,
  );
  const deletionReconciler = new OrganizationDeletionReconciler(
    database,
    objectStore,
    transport,
    cache,
  );
  const healthState = new DispatcherHealthState();
  const healthServer = new DispatcherHealthServer(healthState);
  const abort = new AbortController();
  const stop = (): void => abort.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    await healthServer.listen(config.port);
    await runDispatcherService(
      dispatcher,
      database,
      transport,
      abort.signal,
      undefined,
      deletionReconciler,
      healthState,
    );
  } finally {
    healthState.markStopping();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await Promise.allSettled([
      healthServer.close(),
      queue.close(),
      pool.end(),
      cache.close(),
      ...(objectStore instanceof S3AssetObjectStore
        ? [objectStore.onModuleDestroy()]
        : []),
    ]);
  }
}

void bootstrap().catch((error: unknown) => {
  observabilityRuntime.captureException(error);
  console.error(
    JSON.stringify({
      event: "dispatcher_fatal",
      error_class:
        error instanceof Error ? error.constructor.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
});
