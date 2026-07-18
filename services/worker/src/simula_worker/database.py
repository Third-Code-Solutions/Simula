"""Worker-only PostgreSQL capability boundary.

The worker connects solely as ``simula_worker`` and invokes security-definer
execution functions.  It has no direct table DML surface in application code.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol, cast
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool, PoolTimeout

from simula_worker.config import WorkerSettings

DatabaseRow = dict[str, Any]


@dataclass(frozen=True, slots=True)
class DispatchClaim:
    outbox_id: UUID
    run_id: UUID
    generation: int
    job_id: str
    claim_token: UUID
    claim_expires_at: datetime


@dataclass(frozen=True, slots=True)
class ExecutionClaim:
    """The only manifest-bearing response, issued after worker binding checks."""

    status: str
    attempt_id: UUID | None
    lease_token: UUID | None
    frozen_manifest: Mapping[str, object] | None
    frozen_manifest_sha256: str | None
    deterministic_seed: int | None


class WorkerExecutionGateway(Protocol):
    """Lease-bound execution mutations available to the ARQ handler."""

    async def claim_execution(
        self, run_id: UUID, generation: int, job_id: str
    ) -> ExecutionClaim: ...

    async def heartbeat_execution(
        self, run_id: UUID, attempt_id: UUID, lease_token: UUID
    ) -> bool: ...

    async def complete_execution(
        self,
        run_id: UUID,
        attempt_id: UUID,
        lease_token: UUID,
        artifact: Mapping[str, object],
    ) -> bool: ...

    async def fail_execution(
        self,
        run_id: UUID,
        attempt_id: UUID,
        lease_token: UUID,
        safe_error_code: str,
        retryable: bool,
    ) -> str: ...


class WorkerDatabase(WorkerExecutionGateway):
    """Bounded worker connection pool with function-only database access."""

    def __init__(self, settings: WorkerSettings) -> None:
        self._pool = AsyncConnectionPool(
            conninfo=settings.database_url,
            min_size=1,
            max_size=4,
            timeout=2.0,
            open=False,
            kwargs={"autocommit": False, "row_factory": dict_row},
        )

    async def open(self) -> None:
        await self._pool.open(wait=True, timeout=2.0)

    async def close(self) -> None:
        await self._pool.close(timeout=2.0)

    async def ready(self) -> bool:
        try:
            async with self._pool.connection(timeout=2.0) as connection:
                async with connection.transaction():
                    cursor = await connection.execute("select 1 as ready")
                    row = await cursor.fetchone()
            return row is not None and cast(DatabaseRow, row)["ready"] == 1
        except PoolTimeout, psycopg.Error:
            return False

    async def claim_due_dispatches(self, requested_batch_size: int = 10) -> list[DispatchClaim]:
        rows = await self._fetchall(
            "select * from private.claim_due_run_outbox(%s)", (requested_batch_size,)
        )
        return [
            DispatchClaim(
                outbox_id=cast(UUID, row["outbox_id"]),
                run_id=cast(UUID, row["run_id"]),
                generation=int(row["generation"]),
                job_id=cast(str, row["job_id"]),
                claim_token=cast(UUID, row["claim_token"]),
                claim_expires_at=cast(datetime, row["claim_expires_at"]),
            )
            for row in rows
        ]

    async def finalize_requested_cancellations(self, requested_batch_size: int = 10) -> int:
        row = await self._fetchone(
            "select private.finalize_requested_cancellations(%s) as finalized",
            (requested_batch_size,),
        )
        return int(row["finalized"])

    async def confirm_dispatch(self, outbox_id: UUID, claim_token: UUID) -> bool:
        return await self._boolean_function(
            "select private.confirm_run_dispatch(%s, %s) as changed", (outbox_id, claim_token)
        )

    async def fail_dispatch(self, outbox_id: UUID, claim_token: UUID, safe_error_code: str) -> bool:
        return await self._boolean_function(
            "select private.fail_run_dispatch(%s, %s, %s) as changed",
            (outbox_id, claim_token, safe_error_code),
        )

    async def claim_execution(self, run_id: UUID, generation: int, job_id: str) -> ExecutionClaim:
        row = await self._fetchone(
            "select * from private.claim_run_execution(%s, %s, %s)",
            (run_id, generation, job_id),
        )
        manifest = row["frozen_manifest"]
        return ExecutionClaim(
            status=cast(str, row["claim_status"]),
            attempt_id=cast(UUID | None, row["attempt_id"]),
            lease_token=cast(UUID | None, row["lease_token"]),
            frozen_manifest=cast(Mapping[str, object], manifest)
            if isinstance(manifest, Mapping)
            else None,
            frozen_manifest_sha256=cast(str | None, row["frozen_manifest_sha256"]),
            deterministic_seed=int(row["deterministic_seed"])
            if row["deterministic_seed"] is not None
            else None,
        )

    async def heartbeat_execution(self, run_id: UUID, attempt_id: UUID, lease_token: UUID) -> bool:
        return await self._boolean_function(
            "select private.heartbeat_run_execution(%s, %s, %s) as changed",
            (run_id, attempt_id, lease_token),
        )

    async def complete_execution(
        self,
        run_id: UUID,
        attempt_id: UUID,
        lease_token: UUID,
        artifact: Mapping[str, object],
    ) -> bool:
        return await self._boolean_function(
            "select private.complete_run_execution(%s, %s, %s, %s) as changed",
            (run_id, attempt_id, lease_token, Jsonb(dict(artifact))),
        )

    async def fail_execution(
        self,
        run_id: UUID,
        attempt_id: UUID,
        lease_token: UUID,
        safe_error_code: str,
        retryable: bool,
    ) -> str:
        row = await self._fetchone(
            "select private.fail_run_execution(%s, %s, %s, %s, %s) as next_state",
            (run_id, attempt_id, lease_token, safe_error_code, retryable),
        )
        return cast(str, row["next_state"])

    async def _boolean_function(self, query: str, parameters: tuple[object, ...]) -> bool:
        row = await self._fetchone(query, parameters)
        return bool(row["changed"])

    async def _fetchone(self, query: str, parameters: tuple[object, ...]) -> DatabaseRow:
        rows = await self._fetchall(query, parameters)
        if len(rows) != 1:
            raise RuntimeError("worker database function returned an unexpected row count")
        return rows[0]

    async def _fetchall(self, query: str, parameters: tuple[object, ...]) -> list[DatabaseRow]:
        async with self._pool.connection(timeout=2.0) as connection:
            async with connection.transaction():
                cursor = await connection.execute(query, parameters)
                rows = await cursor.fetchall()
        return [cast(DatabaseRow, row) for row in rows]
