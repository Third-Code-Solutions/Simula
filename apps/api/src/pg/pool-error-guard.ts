import type { Pool } from "pg";

/**
 * node-postgres reports a connection it lost — an idle client closed by the
 * server, a pooler recycling a backend, a transient network drop — as an
 * `error` event on the pool. `pg-pool` has already discarded the failed client
 * by then, so the event is informational; but Node's `EventEmitter` throws when
 * an `error` event has no listener, which turns that routine blip into an
 * uncaught exception that terminates the process. The production dispatcher
 * crash-looped on exactly this after a dropped connection on 2026-09-13, so
 * every long-lived pool goes through this guard.
 *
 * Only the error class is reported: dependency errors can carry connection
 * detail, and this repository keeps raw dependency errors out of logs.
 */
export interface PoolErrorLogger {
  error(event: Readonly<Record<string, unknown>>): void;
}

const consoleLogger: PoolErrorLogger = {
  error: (event) => console.error(JSON.stringify(event)),
};

export function guardPoolErrors(
  pool: Pool,
  logger: PoolErrorLogger = consoleLogger,
): Pool {
  pool.on("error", (error: unknown) => {
    logger.error({
      event: "database_pool_error",
      error_class:
        error instanceof Error ? error.constructor.name : typeof error,
    });
  });
  return pool;
}
