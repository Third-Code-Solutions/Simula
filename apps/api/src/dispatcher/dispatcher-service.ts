import { setTimeout as wait } from "node:timers/promises";

import type { DispatchPass } from "./run-outbox-dispatcher";
import type { OrganizationDeletionPass } from "./organization-deletion-reconciler";

export interface DispatcherPassRunner {
  dispatchOnce(batchSize?: number): Promise<DispatchPass>;
}

export interface OrganizationDeletionPassRunner {
  reconcileIfDue(batchSize?: number): Promise<OrganizationDeletionPass>;
}

export interface DispatcherDatabaseRuntime {
  isReady(): Promise<boolean>;
  updateBullMqRunPressure(
    readyDepth: number,
    oldestReadyAgeSeconds: number,
    redisMemoryPercent: number,
  ): Promise<void>;
  evaluateRunCreationControl(
    redisMemoryPercent: number,
    poisonedCount: number,
  ): Promise<void>;
}

export interface DispatcherQueueRuntime {
  isReady(): Promise<boolean>;
  snapshot(): Promise<{
    readonly depth: number;
    readonly memoryPercent: number;
    readonly oldestReadyAgeSeconds: number;
  }>;
}

export interface DispatcherLogger {
  info(event: Readonly<Record<string, unknown>>): void;
  error(event: Readonly<Record<string, unknown>>): void;
}

export interface DispatcherHealthRuntime {
  markReady(): void;
  markPassSucceeded(): void;
  markStopping(): void;
}

const consoleLogger: DispatcherLogger = {
  info: (event) => console.info(JSON.stringify(event)),
  error: (event) => console.error(JSON.stringify(event)),
};

export async function runDispatcherService(
  dispatcher: DispatcherPassRunner,
  database: DispatcherDatabaseRuntime,
  queue: DispatcherQueueRuntime,
  signal: AbortSignal,
  logger: DispatcherLogger = consoleLogger,
  deletionReconciler?: OrganizationDeletionPassRunner,
  health?: DispatcherHealthRuntime,
): Promise<void> {
  const [databaseReady, queueReady] = await Promise.all([
    database.isReady(),
    queue.isReady(),
  ]);
  if (!databaseReady || !queueReady) {
    throw new Error("dispatcher dependencies are not ready");
  }
  health?.markReady();
  logger.info({ event: "dispatcher_started" });

  while (!signal.aborted) {
    try {
      const snapshot = await queue.snapshot();
      await database.updateBullMqRunPressure(
        snapshot.depth,
        snapshot.oldestReadyAgeSeconds,
        snapshot.memoryPercent,
      );
      await database.evaluateRunCreationControl(snapshot.memoryPercent, 0);
      const result = await dispatcher.dispatchOnce(10);
      const deletionResult =
        deletionReconciler === undefined
          ? null
          : await deletionReconciler.reconcileIfDue(10);
      if (result.poisoned > 0) {
        await database.evaluateRunCreationControl(
          snapshot.memoryPercent,
          result.poisoned,
        );
      }
      if (
        result.canceled > 0 ||
        result.poisoned > 0 ||
        result.recovered > 0 ||
        result.claimed > 0
      ) {
        logger.info({ event: "dispatcher_pass", ...result });
      }
      if (
        deletionResult !== null &&
        (deletionResult.claimed > 0 ||
          deletionResult.released > 0 ||
          deletionResult.finalized > 0)
      ) {
        logger.info({
          event: "organization_deletion_reconciliation_pass",
          ...deletionResult,
        });
      }
      health?.markPassSucceeded();
    } catch (error) {
      logger.error({
        event: "dispatcher_pass_failed",
        error_class:
          error instanceof Error ? error.constructor.name : "UnknownError",
      });
    }
    try {
      await wait(1_000, undefined, { signal });
    } catch (error) {
      if (signal.aborted) {
        break;
      }
      throw error;
    }
  }

  health?.markStopping();
  logger.info({ event: "dispatcher_stopped" });
}
