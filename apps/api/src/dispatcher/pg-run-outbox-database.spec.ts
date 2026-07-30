import type { Pool, PoolClient, QueryResult } from "pg";

import { REQUIRED_DATABASE_MIGRATION_HEAD } from "../config/production-admission";
import { PgRunOutboxDatabase } from "./pg-run-outbox-database";

const OUTBOX_ID = "00000000-0000-4000-8000-0000000000a1";
const RUN_ID = "00000000-0000-4000-8000-0000000000b3";
const CLAIM_TOKEN = "00000000-0000-4000-8000-0000000000c1";
const DELETION_RESOURCE_ID = "00000000-0000-4000-8000-0000000000d1";
const DELETION_REQUEST_ID = "00000000-0000-4000-8000-0000000000d2";
const ORGANIZATION_ID = "00000000-0000-4000-8000-0000000000d3";

function poolWithRows(rows: readonly Record<string, unknown>[]): {
  readonly database: PgRunOutboxDatabase;
  readonly query: jest.Mock;
  readonly release: jest.Mock;
} {
  const query = jest.fn(async (statement: string) => {
    if (
      statement === "begin" ||
      statement === "commit" ||
      statement.includes("pg_catalog.set_config")
    ) {
      return { rows: [] } as unknown as QueryResult;
    }
    return { rows } as unknown as QueryResult;
  });
  const release = jest.fn();
  const client = { query, release } as unknown as PoolClient;
  const pool = {
    connect: jest.fn().mockResolvedValue(client),
  } as unknown as Pool;
  return {
    database: new PgRunOutboxDatabase(pool, REQUIRED_DATABASE_MIGRATION_HEAD),
    query,
    release,
  };
}

describe("PgRunOutboxDatabase", () => {
  it("claims and validates the legacy durable identity before v2 publication", async () => {
    const fixture = poolWithRows([
      {
        outbox_id: OUTBOX_ID,
        run_id: RUN_ID,
        generation: 2,
        job_id: `run:${RUN_ID}:dispatch:2`,
        claim_token: CLAIM_TOKEN,
      },
    ]);

    await expect(fixture.database.claimDueDispatches(10)).resolves.toEqual([
      {
        outbox_id: OUTBOX_ID,
        run_id: RUN_ID,
        dispatch_generation: 2,
        claim_token: CLAIM_TOKEN,
      },
    ]);

    expect(fixture.query).toHaveBeenNthCalledWith(1, "begin");
    expect(fixture.query.mock.calls[1]?.[0]).toContain("pg_catalog.set_config");
    expect(fixture.query).toHaveBeenNthCalledWith(
      3,
      "select * from private.claim_due_run_outbox_v2($1)",
      [10],
    );
    expect(fixture.query).toHaveBeenNthCalledWith(4, "commit");
    expect(fixture.release).toHaveBeenCalledWith();
  });

  it("fails closed when the durable legacy job binding drifts", async () => {
    const fixture = poolWithRows([
      {
        outbox_id: OUTBOX_ID,
        run_id: RUN_ID,
        generation: 2,
        job_id: `run:${RUN_ID}:dispatch:1`,
        claim_token: CLAIM_TOKEN,
      },
    ]);

    await expect(fixture.database.claimDueDispatches(10)).rejects.toThrow(
      "invalid legacy job binding",
    );
  });

  it("maps exact confirmation and failure compare-and-set results", async () => {
    const confirmation = poolWithRows([{ changed: true }]);
    await expect(
      confirmation.database.confirmDispatch(OUTBOX_ID, CLAIM_TOKEN),
    ).resolves.toBe(true);
    expect(confirmation.query).toHaveBeenNthCalledWith(
      3,
      "select private.confirm_run_dispatch($1, $2) as changed",
      [OUTBOX_ID, CLAIM_TOKEN],
    );

    const failure = poolWithRows([{ changed: false }]);
    await expect(
      failure.database.failDispatch(
        OUTBOX_ID,
        CLAIM_TOKEN,
        "dispatch_transport_failed",
      ),
    ).resolves.toBe(false);
    expect(failure.query).toHaveBeenNthCalledWith(
      3,
      "select private.fail_run_dispatch($1, $2, $3) as changed",
      [OUTBOX_ID, CLAIM_TOKEN, "dispatch_transport_failed"],
    );
  });

  it("strictly parses and settles deletion-resource leases", async () => {
    const claim = poolWithRows([
      {
        resource_id: DELETION_RESOURCE_ID,
        request_id: DELETION_REQUEST_ID,
        organization_id: ORGANIZATION_ID,
        resource_kind: "cache",
        resource_key: ORGANIZATION_ID,
        claim_token: CLAIM_TOKEN,
        claim_expires_at: new Date("2026-07-30T12:00:00.000Z"),
        attempt_count: 1,
      },
    ]);
    await expect(
      claim.database.claimOrganizationDeletionResources(10),
    ).resolves.toEqual([
      {
        resource_id: DELETION_RESOURCE_ID,
        request_id: DELETION_REQUEST_ID,
        organization_id: ORGANIZATION_ID,
        resource_kind: "cache",
        resource_key: ORGANIZATION_ID,
        claim_token: CLAIM_TOKEN,
        claim_expires_at: "2026-07-30T12:00:00.000Z",
        attempt_count: 1,
      },
    ]);

    const completion = poolWithRows([{ changed: true }]);
    await expect(
      completion.database.completeOrganizationDeletionResource(
        DELETION_RESOURCE_ID,
        CLAIM_TOKEN,
      ),
    ).resolves.toBe(true);

    const release = poolWithRows([{ changed: true }]);
    await expect(
      release.database.releaseOrganizationDeletionResource(
        DELETION_RESOURCE_ID,
        CLAIM_TOKEN,
        "cache_cleanup_failed",
      ),
    ).resolves.toBe(true);

    const finalization = poolWithRows([{ finalized: 1 }]);
    await expect(
      finalization.database.finalizeReadyOrganizationDeletions(10),
    ).resolves.toBe(1);
  });

  it("rejects a deletion resource bound to another organization", async () => {
    const fixture = poolWithRows([
      {
        resource_id: DELETION_RESOURCE_ID,
        request_id: DELETION_REQUEST_ID,
        organization_id: ORGANIZATION_ID,
        resource_kind: "cache",
        resource_key: RUN_ID,
        claim_token: CLAIM_TOKEN,
        claim_expires_at: new Date("2026-07-30T12:00:00.000Z"),
        attempt_count: 1,
      },
    ]);
    await expect(
      fixture.database.claimOrganizationDeletionResources(10),
    ).rejects.toThrow("invalid deletion resource binding");
  });

  it("requires durable BullMQ ownership for readiness and every dispatch pass", async () => {
    const readiness = poolWithRows([
      {
        ready: true,
        migration_version: REQUIRED_DATABASE_MIGRATION_HEAD,
        rls_force_enabled: true,
      },
    ]);
    await expect(readiness.database.isReady()).resolves.toBe(true);
    expect(readiness.query.mock.calls[2]?.[0]).toContain(
      "private.require_queue_transport('bullmq')",
    );
    expect(readiness.query.mock.calls[2]?.[0]).toContain(
      "private.runtime_schema_readiness()",
    );

    const stale = poolWithRows([
      {
        ready: true,
        migration_version: "20260730220000",
        rls_force_enabled: true,
      },
    ]);
    await expect(stale.database.isReady()).resolves.toBe(false);

    const ownership = poolWithRows([{ active: true }]);
    await expect(
      ownership.database.requireQueueTransport(),
    ).resolves.toBeUndefined();
    expect(ownership.query.mock.calls[2]?.[0]).toContain(
      "private.require_queue_transport('bullmq')",
    );
  });

  it("feeds only a bounded operational snapshot into durable run control", async () => {
    const fixture = poolWithRows([
      {
        run_creation_enabled: true,
        alert_reason: null,
        changed: false,
      },
    ]);

    await expect(
      fixture.database.evaluateRunCreationControl(42.5, 0),
    ).resolves.toBeUndefined();
    expect(fixture.query.mock.calls[2]?.[0]).toContain(
      "private.evaluate_run_creation_control",
    );
    expect(fixture.query.mock.calls[2]?.[1]).toEqual([42.5, 0]);
    await expect(
      fixture.database.evaluateRunCreationControl(Number.NaN, 0),
    ).rejects.toThrow("outside its contract");
  });

  it("feeds bounded BullMQ pressure into its separate worker-only boundary", async () => {
    const fixture = poolWithRows([
      {
        pressure_reason: "bullmq_depth_high",
        changed: true,
      },
    ]);

    await expect(
      fixture.database.updateBullMqRunPressure(100, 12.5, 42.5),
    ).resolves.toBeUndefined();
    expect(fixture.query.mock.calls[2]?.[0]).toContain(
      "private.update_bullmq_run_pressure",
    );
    expect(fixture.query.mock.calls[2]?.[1]).toEqual([100, 12.5, 42.5]);
    await expect(
      fixture.database.updateBullMqRunPressure(-1, 0, 0),
    ).rejects.toThrow("outside its contract");
  });

  it("rolls back and destroys a connection when rollback also fails", async () => {
    const release = jest.fn();
    const query = jest.fn(async (statement: string) => {
      if (statement === "begin") {
        return { rows: [] };
      }
      throw new Error(
        statement === "rollback" ? "rollback failed" : "query failed",
      );
    });
    const pool = {
      connect: jest.fn().mockResolvedValue({ query, release }),
    } as unknown as Pool;
    const database = new PgRunOutboxDatabase(
      pool,
      REQUIRED_DATABASE_MIGRATION_HEAD,
    );

    await expect(database.finalizeRequestedCancellations(10)).rejects.toThrow(
      "query failed",
    );
    expect(release).toHaveBeenCalledWith(true);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
