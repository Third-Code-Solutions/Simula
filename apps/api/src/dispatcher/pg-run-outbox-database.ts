import { isUUID } from "class-validator";
import {
  Pool,
  type PoolClient,
  type PoolConfig,
  type QueryResultRow,
} from "pg";

import type {
  RunDispatchClaim,
  RunOutboxDatabasePort,
} from "./run-outbox-dispatcher";
import type { DispatcherRuntimeConfig } from "./dispatcher-runtime";
import type {
  OrganizationDeletionCleanupError,
  OrganizationDeletionDatabasePort,
  OrganizationDeletionResourceClaim,
  OrganizationDeletionResourceKind,
} from "./organization-deletion-reconciler";
import { REQUIRED_DATABASE_MIGRATION_HEAD } from "../config/production-admission";

function exactCount(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`dispatcher database returned an invalid ${name}`);
  }
  return value;
}

function exactUuid(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    !isUUID(value) ||
    value !== value.toLowerCase()
  ) {
    throw new Error(`dispatcher database returned an invalid ${name}`);
  }
  return value;
}

function exactGeneration(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 3
  ) {
    throw new Error("dispatcher database returned an invalid generation");
  }
  return value;
}

function exactBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`dispatcher database returned an invalid ${name}`);
  }
  return value;
}

function dispatchClaim(row: QueryResultRow): RunDispatchClaim {
  const runId = exactUuid(row.run_id, "run id");
  const generation = exactGeneration(row.generation);
  if (row.job_id !== `run:${runId}:dispatch:${generation}`) {
    throw new Error(
      "dispatcher database returned an invalid legacy job binding",
    );
  }
  return Object.freeze({
    outbox_id: exactUuid(row.outbox_id, "outbox id"),
    run_id: runId,
    dispatch_generation: generation,
    claim_token: exactUuid(row.claim_token, "claim token"),
  });
}

function exactTimestamp(value: unknown, name: string): string {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (date === null || !Number.isFinite(date.getTime())) {
    throw new Error(`dispatcher database returned an invalid ${name}`);
  }
  return date.toISOString();
}

function deletionKind(value: unknown): OrganizationDeletionResourceKind {
  if (value !== "storage_object" && value !== "run" && value !== "cache") {
    throw new Error(
      "dispatcher database returned an invalid deletion resource kind",
    );
  }
  return value;
}

function deletionClaim(row: QueryResultRow): OrganizationDeletionResourceClaim {
  const organizationId = exactUuid(row.organization_id, "organization id");
  const kind = deletionKind(row.resource_kind);
  if (typeof row.resource_key !== "string") {
    throw new Error(
      "dispatcher database returned an invalid deletion resource key",
    );
  }
  if (
    (kind === "run" && !isUUID(row.resource_key)) ||
    (kind === "cache" && row.resource_key !== organizationId) ||
    (kind === "storage_object" &&
      (!row.resource_key.startsWith(`${organizationId}/`) ||
        row.resource_key.length > 512 ||
        !/^[0-9a-f/-]+$/.test(row.resource_key)))
  ) {
    throw new Error(
      "dispatcher database returned an invalid deletion resource binding",
    );
  }
  const attemptCount = exactCount(row.attempt_count, "deletion attempt count");
  if (attemptCount < 1 || attemptCount > 10) {
    throw new Error(
      "dispatcher database returned an invalid deletion attempt count",
    );
  }
  return Object.freeze({
    resource_id: exactUuid(row.resource_id, "deletion resource id"),
    request_id: exactUuid(row.request_id, "deletion request id"),
    organization_id: organizationId,
    resource_kind: kind,
    resource_key: row.resource_key,
    claim_token: exactUuid(row.claim_token, "deletion claim token"),
    claim_expires_at: exactTimestamp(
      row.claim_expires_at,
      "deletion claim expiry",
    ),
    attempt_count: attemptCount,
  });
}

export function createDispatcherPool(config: DispatcherRuntimeConfig): Pool {
  const url = new URL(config.databaseUrl);
  url.searchParams.delete("sslmode");
  const poolConfig: PoolConfig = {
    connectionString: url.toString(),
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 10_000,
    max: 4,
    maxLifetimeSeconds: 300,
    ...(config.databaseCaPem === null
      ? {}
      : {
          ssl: {
            ca: config.databaseCaPem,
            rejectUnauthorized: true,
          },
        }),
  };
  return new Pool(poolConfig);
}

export class PgRunOutboxDatabase
  implements RunOutboxDatabasePort, OrganizationDeletionDatabasePort
{
  constructor(
    private readonly pool: Pool,
    private readonly expectedMigrationHead: string = REQUIRED_DATABASE_MIGRATION_HEAD,
  ) {}

  async isReady(): Promise<boolean> {
    try {
      const rows = await this.query(
        `
        select
          private.require_queue_transport('bullmq') as ready,
          readiness.migration_version::text as migration_version,
          readiness.rls_force_enabled
        from private.runtime_schema_readiness() as readiness
        `,
        [],
      );
      return (
        rows.length === 1 &&
        rows[0]?.ready === true &&
        rows[0]?.migration_version === this.expectedMigrationHead &&
        rows[0]?.rls_force_enabled === true
      );
    } catch {
      return false;
    }
  }

  async requireQueueTransport(): Promise<void> {
    const row = await this.one(
      "select private.require_queue_transport('bullmq') as active",
      [],
    );
    if (row.active !== true) {
      throw new Error("BullMQ queue transport is not active.");
    }
  }

  async finalizeRequestedCancellations(batchSize: number): Promise<number> {
    const row = await this.one(
      "select private.finalize_requested_cancellations($1) as finalized",
      [batchSize],
    );
    return exactCount(row.finalized, "cancellation count");
  }

  async finalizePoisonedDispatches(batchSize: number): Promise<number> {
    const row = await this.one(
      "select private.finalize_poisoned_dispatches($1) as finalized",
      [batchSize],
    );
    return exactCount(row.finalized, "poison count");
  }

  async reconcileStaleDispatches(batchSize: number): Promise<number> {
    const row = await this.one(
      "select private.reconcile_run_dispatch($1, false) as reconciled",
      [batchSize],
    );
    return exactCount(row.reconciled, "recovery count");
  }

  async claimDueDispatches(
    batchSize: number,
  ): Promise<readonly RunDispatchClaim[]> {
    const rows = await this.query(
      "select * from private.claim_due_run_outbox_v2($1)",
      [batchSize],
    );
    return Object.freeze(rows.map(dispatchClaim));
  }

  async confirmDispatch(
    outboxId: string,
    claimToken: string,
  ): Promise<boolean> {
    const row = await this.one(
      "select private.confirm_run_dispatch($1, $2) as changed",
      [outboxId, claimToken],
    );
    return exactBoolean(row.changed, "confirmation result");
  }

  async failDispatch(
    outboxId: string,
    claimToken: string,
    safeErrorCode: "dispatch_transport_failed",
  ): Promise<boolean> {
    const row = await this.one(
      "select private.fail_run_dispatch($1, $2, $3) as changed",
      [outboxId, claimToken, safeErrorCode],
    );
    return exactBoolean(row.changed, "failure result");
  }

  async claimOrganizationDeletionResources(
    batchSize: number,
  ): Promise<readonly OrganizationDeletionResourceClaim[]> {
    const rows = await this.query(
      "select * from private.claim_organization_deletion_resources($1)",
      [batchSize],
    );
    return Object.freeze(rows.map(deletionClaim));
  }

  async completeOrganizationDeletionResource(
    resourceId: string,
    claimToken: string,
  ): Promise<boolean> {
    const row = await this.one(
      `select private.complete_organization_deletion_resource(
        $1, $2
      ) as changed`,
      [resourceId, claimToken],
    );
    return exactBoolean(row.changed, "deletion resource completion");
  }

  async releaseOrganizationDeletionResource(
    resourceId: string,
    claimToken: string,
    errorCode: OrganizationDeletionCleanupError,
  ): Promise<boolean> {
    const row = await this.one(
      `select private.release_organization_deletion_resource(
        $1, $2, $3
      ) as changed`,
      [resourceId, claimToken, errorCode],
    );
    return exactBoolean(row.changed, "deletion resource release");
  }

  async finalizeReadyOrganizationDeletions(batchSize: number): Promise<number> {
    const row = await this.one(
      "select private.finalize_ready_organization_deletions($1) as finalized",
      [batchSize],
    );
    return exactCount(row.finalized, "organization deletion finalization");
  }

  async evaluateRunCreationControl(
    redisMemoryPercent: number,
    poisonedCount: number,
  ): Promise<void> {
    if (
      !Number.isFinite(redisMemoryPercent) ||
      redisMemoryPercent < 0 ||
      redisMemoryPercent > 100 ||
      !Number.isSafeInteger(poisonedCount) ||
      poisonedCount < 0
    ) {
      throw new Error(
        "dispatcher operational snapshot is outside its contract",
      );
    }
    const row = await this.one(
      `
      select
        control.run_creation_enabled,
        control.alert_reason,
        control.changed
      from private.evaluate_run_creation_control(
        $1::numeric,
        $2::integer
      ) as control
      `,
      [redisMemoryPercent, poisonedCount],
    );
    exactBoolean(row.run_creation_enabled, "run-control state");
    if (row.alert_reason !== null && typeof row.alert_reason !== "string") {
      throw new Error("dispatcher database returned an invalid alert reason");
    }
    exactBoolean(row.changed, "run-control transition");
  }

  async updateBullMqRunPressure(
    readyDepth: number,
    oldestReadyAgeSeconds: number,
    redisMemoryPercent: number,
  ): Promise<void> {
    if (
      !Number.isSafeInteger(readyDepth) ||
      readyDepth < 0 ||
      !Number.isFinite(oldestReadyAgeSeconds) ||
      oldestReadyAgeSeconds < 0 ||
      !Number.isFinite(redisMemoryPercent) ||
      redisMemoryPercent < 0 ||
      redisMemoryPercent > 100
    ) {
      throw new Error("BullMQ pressure snapshot is outside its contract");
    }
    const row = await this.one(
      `
      select
        pressure.pressure_reason,
        pressure.changed
      from private.update_bullmq_run_pressure(
        $1::integer,
        $2::numeric,
        $3::numeric
      ) as pressure
      `,
      [readyDepth, oldestReadyAgeSeconds, redisMemoryPercent],
    );
    if (
      row.pressure_reason !== null &&
      typeof row.pressure_reason !== "string"
    ) {
      throw new Error(
        "dispatcher database returned an invalid BullMQ pressure reason",
      );
    }
    exactBoolean(row.changed, "BullMQ pressure transition");
  }

  private async one(
    statement: string,
    parameters: readonly unknown[],
  ): Promise<QueryResultRow> {
    const rows = await this.query(statement, parameters);
    if (rows.length !== 1) {
      throw new Error("dispatcher database returned an unexpected row count");
    }
    return rows[0] as QueryResultRow;
  }

  private async query(
    statement: string,
    parameters: readonly unknown[],
  ): Promise<readonly QueryResultRow[]> {
    let client: PoolClient | undefined;
    let destroyed = false;
    try {
      client = await this.pool.connect();
      await client.query("begin");
      await client.query(`
        select
          pg_catalog.set_config('statement_timeout', '8000', true),
          pg_catalog.set_config('lock_timeout', '2000', true),
          pg_catalog.set_config(
            'idle_in_transaction_session_timeout',
            '10000',
            true
          )
      `);
      const result = await client.query(statement, [...parameters]);
      await client.query("commit");
      return result.rows;
    } catch (error) {
      if (client !== undefined) {
        try {
          await client.query("rollback");
        } catch {
          client.release(true);
          destroyed = true;
        }
      }
      throw error;
    } finally {
      if (client !== undefined && !destroyed) {
        client.release();
      }
    }
  }
}
