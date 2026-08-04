"""Worker-only PostgreSQL capability boundary.

The worker connects solely as ``simula_worker`` and invokes security-definer
execution functions.  It has no direct table DML surface in application code.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from time import perf_counter
from typing import Any, Literal, Protocol, cast
from uuid import UUID

import psycopg
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool, PoolTimeout

from simula_worker.config import WorkerSettings
from simula_worker.telemetry import WorkerTelemetry

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
    correlation_id: UUID | None = None
    traceparent: str | None = None


@dataclass(frozen=True, slots=True)
class FailureResolution:
    """One terminal or retry disposition returned by the database CAS."""

    state: Literal["retrying", "failed", "canceled", "no_work"]
    retry_after_seconds: int | None = None


@dataclass(frozen=True, slots=True)
class RunCreationControl:
    """Durable admission latch and its bounded active alert."""

    enabled: bool
    alert_reason: str | None
    changed: bool


@dataclass(frozen=True, slots=True)
class RuntimeObservabilitySnapshot:
    migration_version: int
    rls_force_enabled: bool
    state_counts: Mapping[str, int]
    stuck_lease_count: int
    oldest_cancellation_age_seconds: float


@dataclass(frozen=True, slots=True)
class CampaignEvidenceClaim:
    evidence_id: UUID
    kind: Literal["survey_calibration", "historical_backtest"]
    request: Mapping[str, object]
    secret_payload: Mapping[str, object] | None
    lease_token: UUID
    attempt_count: int


@dataclass(frozen=True, slots=True)
class CampaignLabClaim:
    run_id: UUID
    run_type: Literal[
        "repeated_simulation",
        "survey_calibration",
        "survey_import",
        "historical_backtest",
        "research_ingestion",
        "interview",
        "compliance_review",
        "report",
    ]
    request: Mapping[str, object]
    secret_payload: Mapping[str, object] | None
    lease_token: UUID
    attempt_count: int


class CampaignEvidenceDatabase(Protocol):
    async def expire_campaign_evidence_runs(self, requested_batch_size: int = 50) -> int: ...

    async def claim_campaign_evidence_runs(
        self, requested_batch_size: int = 5
    ) -> list[CampaignEvidenceClaim]: ...

    async def update_campaign_evidence_progress(
        self,
        evidence_id: UUID,
        lease_token: UUID,
        stage: str,
        progress: int,
        message: str,
    ) -> bool: ...

    async def complete_campaign_evidence_run(
        self, evidence_id: UUID, lease_token: UUID, result: Mapping[str, object]
    ) -> bool: ...

    async def finalize_canceled_campaign_evidence_run(
        self, evidence_id: UUID, lease_token: UUID
    ) -> bool: ...

    async def fail_campaign_evidence_run(
        self,
        evidence_id: UUID,
        lease_token: UUID,
        error_code: str,
        error_detail: str,
        retryable: bool,
    ) -> str: ...


class CampaignLabDatabase(Protocol):
    async def expire_campaign_lab_runs(self, requested_batch_size: int = 50) -> int: ...

    async def claim_campaign_lab_runs(
        self, requested_batch_size: int = 5
    ) -> list[CampaignLabClaim]: ...

    async def update_campaign_lab_progress(
        self, run_id: UUID, lease_token: UUID, stage: str, progress: int, message: str
    ) -> bool: ...

    async def finalize_canceled_campaign_lab_run(self, run_id: UUID, lease_token: UUID) -> bool: ...

    async def complete_campaign_lab_run(
        self, run_id: UUID, lease_token: UUID, result: Mapping[str, object]
    ) -> bool: ...

    async def fail_campaign_lab_run(
        self,
        run_id: UUID,
        lease_token: UUID,
        error_code: str,
        error_detail: str,
        retryable: bool,
    ) -> str: ...


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
        receipt: Mapping[str, object],
    ) -> bool: ...

    async def complete_behavioral_execution(
        self,
        run_id: UUID,
        attempt_id: UUID,
        lease_token: UUID,
        canonical_artifact: bytes,
        receipt: Mapping[str, object],
    ) -> bool: ...

    async def fail_execution(
        self,
        run_id: UUID,
        attempt_id: UUID,
        lease_token: UUID,
        safe_error_code: str,
        retryable: bool,
    ) -> FailureResolution: ...


class WorkerDatabase(WorkerExecutionGateway):
    """Bounded worker connection pool with function-only database access."""

    def __init__(
        self, settings: WorkerSettings, *, telemetry: WorkerTelemetry | None = None
    ) -> None:
        self._telemetry = telemetry
        self._queue_transport = settings.queue_transport
        self._migration_head = settings.migration_head
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
        started_at = perf_counter()
        outcome = "error"
        try:
            async with self._pool.connection(timeout=2.0) as connection:
                async with connection.transaction():
                    cursor = await connection.execute(
                        "select private.require_queue_transport(%s) as ready",
                        (self._queue_transport,),
                    )
                    row = await cursor.fetchone()
                    schema_cursor = await connection.execute(
                        "select * from private.runtime_schema_readiness_v3()"
                    )
                    schema = await schema_cursor.fetchone()
            ready = (
                row is not None
                and cast(DatabaseRow, row)["ready"] is True
                and schema is not None
                and str(cast(DatabaseRow, schema)["migration_version"]) == self._migration_head
                and cast(DatabaseRow, schema)["rls_force_enabled"] is True
            )
            outcome = "success" if ready else "error"
            return ready
        except KeyError, TypeError, ValueError, PoolTimeout, psycopg.Error:
            return False
        finally:
            self._observe_database("readiness", outcome, started_at)

    async def require_queue_transport(self, requested_transport: Literal["arq", "bullmq"]) -> None:
        row = await self._fetchone(
            "select private.require_queue_transport(%s) as active",
            (requested_transport,),
        )
        if row["active"] is not True:
            raise RuntimeError("worker queue transport is not active")

    async def runtime_observability_snapshot(self) -> RuntimeObservabilitySnapshot:
        row = await self._fetchone(
            "select * from private.runtime_observability_snapshot_v3()",
            (),
        )
        states = (
            "queued",
            "running",
            "retrying",
            "cancel_requested",
            "succeeded",
            "failed",
            "canceled",
        )
        return RuntimeObservabilitySnapshot(
            migration_version=int(row["migration_version"]),
            rls_force_enabled=bool(row["rls_force_enabled"]),
            state_counts={state: int(row[f"{state}_count"]) for state in states},
            stuck_lease_count=int(row["stuck_lease_count"]),
            oldest_cancellation_age_seconds=float(row["oldest_cancel_requested_age_seconds"]),
        )

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

    async def finalize_poisoned_dispatches(self, requested_batch_size: int = 10) -> int:
        row = await self._fetchone(
            "select private.finalize_poisoned_dispatches(%s) as finalized",
            (requested_batch_size,),
        )
        return int(row["finalized"])

    async def reconcile_stale_dispatches(
        self, requested_batch_size: int = 10, *, force_recovery: bool = False
    ) -> int:
        row = await self._fetchone(
            "select private.reconcile_run_dispatch(%s, %s) as reconciled",
            (requested_batch_size, force_recovery),
        )
        return int(row["reconciled"])

    async def evaluate_run_creation_control(
        self, redis_memory_percent: float, poisoned_count: int
    ) -> RunCreationControl:
        row = await self._fetchone(
            "select * from private.evaluate_run_creation_control(%s::numeric, %s::integer)",
            (redis_memory_percent, poisoned_count),
        )
        return RunCreationControl(
            enabled=bool(row["run_creation_enabled"]),
            alert_reason=cast(str | None, row["alert_reason"]),
            changed=bool(row["changed"]),
        )

    async def confirm_dispatch(self, outbox_id: UUID, claim_token: UUID) -> bool:
        return await self._boolean_function(
            "select private.confirm_run_dispatch(%s, %s) as changed", (outbox_id, claim_token)
        )

    async def fail_dispatch(self, outbox_id: UUID, claim_token: UUID, safe_error_code: str) -> bool:
        return await self._boolean_function(
            "select private.fail_run_dispatch(%s, %s, %s) as changed",
            (outbox_id, claim_token, safe_error_code),
        )

    async def claim_campaign_evidence_runs(
        self, requested_batch_size: int = 5
    ) -> list[CampaignEvidenceClaim]:
        rows = await self._fetchall(
            "select * from private.claim_campaign_evidence_runs(%s)",
            (requested_batch_size,),
        )
        claims: list[CampaignEvidenceClaim] = []
        for row in rows:
            kind = cast(str, row["kind"])
            if kind not in {"survey_calibration", "historical_backtest"}:
                raise RuntimeError("worker database returned an invalid evidence kind")
            request = row["request"]
            if not isinstance(request, Mapping):
                raise RuntimeError("worker database returned an invalid evidence request")
            secret_payload = row["secret_payload"]
            if secret_payload is not None and not isinstance(secret_payload, Mapping):
                raise RuntimeError("worker database returned an invalid evidence secret")
            claims.append(
                CampaignEvidenceClaim(
                    evidence_id=cast(UUID, row["evidence_id"]),
                    kind=cast(Literal["survey_calibration", "historical_backtest"], kind),
                    request=cast(Mapping[str, object], request),
                    secret_payload=cast(Mapping[str, object] | None, secret_payload),
                    lease_token=cast(UUID, row["lease_token"]),
                    attempt_count=int(row["attempt_count"]),
                )
            )
        return claims

    async def expire_campaign_evidence_runs(self, requested_batch_size: int = 50) -> int:
        row = await self._fetchone(
            "select private.expire_campaign_evidence_runs(%s) as deleted",
            (requested_batch_size,),
        )
        return int(row["deleted"])

    async def update_campaign_evidence_progress(
        self,
        evidence_id: UUID,
        lease_token: UUID,
        stage: str,
        progress: int,
        message: str,
    ) -> bool:
        return await self._boolean_function(
            "select private.update_campaign_evidence_progress(%s, %s, %s, %s, %s) as changed",
            (evidence_id, lease_token, stage, progress, message),
        )

    async def complete_campaign_evidence_run(
        self, evidence_id: UUID, lease_token: UUID, result: Mapping[str, object]
    ) -> bool:
        return await self._boolean_function(
            "select private.complete_campaign_evidence_run(%s, %s, %s) as changed",
            (evidence_id, lease_token, Jsonb(dict(result))),
        )

    async def finalize_canceled_campaign_evidence_run(
        self, evidence_id: UUID, lease_token: UUID
    ) -> bool:
        return await self._boolean_function(
            "select private.finalize_canceled_campaign_evidence_run(%s, %s) as changed",
            (evidence_id, lease_token),
        )

    async def fail_campaign_evidence_run(
        self,
        evidence_id: UUID,
        lease_token: UUID,
        error_code: str,
        error_detail: str,
        retryable: bool,
    ) -> str:
        row = await self._fetchone(
            "select private.fail_campaign_evidence_run(%s, %s, %s, %s, %s) as next_state",
            (evidence_id, lease_token, error_code, error_detail, retryable),
        )
        next_state = row["next_state"]
        if not isinstance(next_state, str) or next_state not in {
            "retrying",
            "failed",
            "stale",
        }:
            raise RuntimeError("worker database returned an invalid evidence failure state")
        return next_state

    async def claim_campaign_lab_runs(
        self, requested_batch_size: int = 5
    ) -> list[CampaignLabClaim]:
        rows = await self._fetchall(
            "select * from private.claim_campaign_lab_runs(%s)",
            (requested_batch_size,),
        )
        claims: list[CampaignLabClaim] = []
        for row in rows:
            run_type = cast(str, row["run_type"])
            allowed_types = {
                "repeated_simulation",
                "survey_calibration",
                "survey_import",
                "historical_backtest",
                "research_ingestion",
                "interview",
                "compliance_review",
                "report",
            }
            if run_type not in allowed_types:
                raise RuntimeError("worker database returned an invalid Campaign Lab run type")
            request = row["request"]
            if not isinstance(request, Mapping):
                raise RuntimeError("worker database returned an invalid Campaign Lab request")
            secret_payload = row["secret_payload"]
            if secret_payload is not None and not isinstance(secret_payload, Mapping):
                raise RuntimeError("worker database returned an invalid Campaign Lab secret")
            claims.append(
                CampaignLabClaim(
                    run_id=cast(UUID, row["run_id"]),
                    run_type=cast(
                        Literal[
                            "repeated_simulation",
                            "survey_calibration",
                            "survey_import",
                            "historical_backtest",
                            "research_ingestion",
                            "interview",
                            "compliance_review",
                            "report",
                        ],
                        run_type,
                    ),
                    request=cast(Mapping[str, object], request),
                    secret_payload=cast(Mapping[str, object] | None, secret_payload),
                    lease_token=cast(UUID, row["lease_token"]),
                    attempt_count=int(row["attempt_count"]),
                )
            )
        return claims

    async def expire_campaign_lab_runs(self, requested_batch_size: int = 50) -> int:
        row = await self._fetchone(
            "select private.expire_campaign_lab_runs(%s) as deleted",
            (requested_batch_size,),
        )
        return int(row["deleted"])

    async def update_campaign_lab_progress(
        self, run_id: UUID, lease_token: UUID, stage: str, progress: int, message: str
    ) -> bool:
        return await self._boolean_function(
            "select private.update_campaign_lab_run_progress(%s, %s, %s, %s, %s) as changed",
            (run_id, lease_token, stage, progress, message),
        )

    async def finalize_canceled_campaign_lab_run(self, run_id: UUID, lease_token: UUID) -> bool:
        return await self._boolean_function(
            "select private.finalize_canceled_campaign_lab_run(%s, %s) as changed",
            (run_id, lease_token),
        )

    async def complete_campaign_lab_run(
        self, run_id: UUID, lease_token: UUID, result: Mapping[str, object]
    ) -> bool:
        return await self._boolean_function(
            "select private.complete_campaign_lab_run_v3(%s, %s, %s) as changed",
            (run_id, lease_token, Jsonb(dict(result))),
        )

    async def fail_campaign_lab_run(
        self,
        run_id: UUID,
        lease_token: UUID,
        error_code: str,
        error_detail: str,
        retryable: bool,
    ) -> str:
        row = await self._fetchone(
            "select private.fail_campaign_lab_run(%s, %s, %s, %s, %s) as next_state",
            (run_id, lease_token, error_code, error_detail, retryable),
        )
        next_state = row["next_state"]
        if not isinstance(next_state, str) or next_state not in {"retrying", "failed", "stale"}:
            raise RuntimeError("worker database returned an invalid Campaign Lab failure state")
        return next_state

    async def claim_execution(self, run_id: UUID, generation: int, job_id: str) -> ExecutionClaim:
        row = await self._fetchone(
            "select * from private.claim_run_execution_traced(%s, %s, %s)",
            (run_id, generation, job_id),
        )
        return self._execution_claim(row)

    async def claim_execution_v2(
        self, run_id: UUID, generation: int, job_id: str
    ) -> ExecutionClaim:
        row = await self._fetchone(
            "select * from private.claim_run_execution_v2_traced(%s, %s, %s)",
            (run_id, generation, job_id),
        )
        return self._execution_claim(row)

    async def heartbeat_execution(self, run_id: UUID, attempt_id: UUID, lease_token: UUID) -> bool:
        return await self._boolean_function(
            "select private.heartbeat_run_execution(%s, %s, %s) as changed",
            (run_id, attempt_id, lease_token),
        )

    @staticmethod
    def _execution_claim(row: DatabaseRow) -> ExecutionClaim:
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
            correlation_id=cast(UUID | None, row["correlation_id"]),
            traceparent=cast(str | None, row["traceparent"]),
        )

    async def complete_execution(
        self,
        run_id: UUID,
        attempt_id: UUID,
        lease_token: UUID,
        artifact: Mapping[str, object],
        receipt: Mapping[str, object],
    ) -> bool:
        return await self._boolean_function(
            "select private.complete_run_execution(%s, %s, %s, %s, %s) as changed",
            (
                run_id,
                attempt_id,
                lease_token,
                Jsonb(dict(artifact)),
                Jsonb(dict(receipt)),
            ),
        )

    async def complete_behavioral_execution(
        self,
        run_id: UUID,
        attempt_id: UUID,
        lease_token: UUID,
        canonical_artifact: bytes,
        receipt: Mapping[str, object],
    ) -> bool:
        return await self._boolean_function(
            ("select private.complete_behavioral_run_execution(%s, %s, %s, %s, %s) as changed"),
            (
                run_id,
                attempt_id,
                lease_token,
                canonical_artifact,
                Jsonb(dict(receipt)),
            ),
        )

    async def fail_execution(
        self,
        run_id: UUID,
        attempt_id: UUID,
        lease_token: UUID,
        safe_error_code: str,
        retryable: bool,
    ) -> FailureResolution:
        row = await self._fetchone(
            "select private.fail_run_execution(%s, %s, %s, %s, %s) as next_state",
            (run_id, attempt_id, lease_token, safe_error_code, retryable),
        )
        return self._failure_resolution(cast(str, row["next_state"]))

    @staticmethod
    def _failure_resolution(raw_state: str) -> FailureResolution:
        if raw_state in {"failed", "canceled", "no_work"}:
            return FailureResolution(
                state=cast(Literal["failed", "canceled", "no_work"], raw_state)
            )
        prefix, separator, raw_delay = raw_state.partition(":")
        if prefix != "retrying" or separator != ":":
            raise RuntimeError("worker database returned an invalid failure resolution")
        try:
            retry_after_seconds = int(raw_delay)
        except ValueError as error:
            raise RuntimeError("worker database returned an invalid retry delay") from error
        if retry_after_seconds not in {5, 30}:
            raise RuntimeError("worker database returned an unsupported retry delay")
        return FailureResolution(state="retrying", retry_after_seconds=retry_after_seconds)

    async def _boolean_function(self, query: str, parameters: tuple[object, ...]) -> bool:
        row = await self._fetchone(query, parameters)
        return bool(row["changed"])

    async def _fetchone(self, query: str, parameters: tuple[object, ...]) -> DatabaseRow:
        rows = await self._fetchall(query, parameters)
        if len(rows) != 1:
            raise RuntimeError("worker database function returned an unexpected row count")
        return rows[0]

    async def _fetchall(self, query: str, parameters: tuple[object, ...]) -> list[DatabaseRow]:
        operation = self._database_operation(query)
        started_at = perf_counter()
        outcome = "error"
        try:
            async with self._transaction() as connection:
                cursor = await connection.execute(query, parameters)
                rows = await cursor.fetchall()
            outcome = "success"
            return list(rows)
        finally:
            self._observe_database(operation, outcome, started_at)

    @staticmethod
    def _database_operation(query: str) -> str:
        operations = {
            "claim_due_run_outbox": "claim_dispatch",
            "claim_campaign_evidence_runs": "claim_campaign_evidence",
            "claim_campaign_lab_runs": "claim_campaign_lab",
            "claim_run_execution_traced": "claim_execution",
            "claim_run_execution_v2_traced": "claim_execution",
            "complete_behavioral_run_execution": "complete_behavioral_execution",
            "complete_campaign_evidence_run": "complete_campaign_evidence",
            "complete_campaign_lab_run_v3": "complete_campaign_lab",
            "complete_run_execution": "complete_execution",
            "confirm_run_dispatch": "confirm_dispatch",
            "evaluate_run_creation_control": "evaluate_run_control",
            "expire_campaign_evidence_runs": "expire_campaign_evidence",
            "expire_campaign_lab_runs": "expire_campaign_lab",
            "fail_run_dispatch": "fail_dispatch",
            "fail_campaign_evidence_run": "fail_campaign_evidence",
            "fail_campaign_lab_run": "fail_campaign_lab",
            "fail_run_execution": "fail_execution",
            "finalize_canceled_campaign_evidence_run": "finalize_canceled_campaign_evidence",
            "finalize_canceled_campaign_lab_run": "finalize_canceled_campaign_lab",
            "finalize_requested_cancellations": "finalize_cancellations",
            "finalize_poisoned_dispatches": "finalize_poison",
            "heartbeat_run_execution": "heartbeat_execution",
            "reconcile_run_dispatch": "reconcile_dispatch",
            "require_queue_transport": "require_queue_transport",
            "runtime_observability_snapshot": "runtime_snapshot",
            "update_campaign_evidence_progress": "update_campaign_evidence",
            "update_campaign_lab_run_progress": "update_campaign_lab",
        }
        matches = [operation for marker, operation in operations.items() if marker in query]
        if len(matches) != 1:
            raise ValueError("worker database query operation is not allowlisted")
        return matches[0]

    def _observe_database(self, operation: str, outcome: str, started_at: float) -> None:
        if self._telemetry is None:
            return
        stats = self._pool.get_stats()
        self._telemetry.observe_database(
            operation,
            outcome,
            duration_seconds=perf_counter() - started_at,
            pool_size=int(stats.get("pool_size", 0)),
            pool_available=int(stats.get("pool_available", 0)),
        )

    @asynccontextmanager
    async def _transaction(self) -> AsyncIterator[AsyncConnection[DatabaseRow]]:
        async with self._pool.connection(timeout=2.0) as connection:
            async with connection.transaction():
                await connection.execute(
                    """
                    select
                      pg_catalog.set_config('statement_timeout', '8000', true),
                      pg_catalog.set_config('lock_timeout', '2000', true),
                      pg_catalog.set_config(
                        'idle_in_transaction_session_timeout', '10000', true
                      )
                    """
                )
                yield cast(AsyncConnection[DatabaseRow], connection)
