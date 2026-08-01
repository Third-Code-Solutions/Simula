from __future__ import annotations

from types import TracebackType
from typing import Any, Self, cast
from uuid import UUID

from simula_worker.database import WorkerDatabase


class _Cursor:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    async def fetchall(self) -> list[dict[str, Any]]:
        return self._rows

    async def fetchone(self) -> dict[str, Any] | None:
        return self._rows[0] if self._rows else None


class _Transaction:
    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exception_type: type[BaseException] | None,
        exception: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        del exception_type, exception, traceback


class _Connection:
    def __init__(self, *, migration_version: str = "20260801125632") -> None:
        self.queries: list[tuple[str, tuple[object, ...] | None]] = []
        self.migration_version = migration_version

    def transaction(self) -> _Transaction:
        return _Transaction()

    async def execute(self, query: str, parameters: tuple[object, ...] | None = None) -> _Cursor:
        self.queries.append((" ".join(query.split()), parameters))
        if "require_queue_transport" in query:
            return _Cursor([{"ready": True}])
        if "runtime_schema_readiness" in query:
            return _Cursor(
                [
                    {
                        "migration_version": self.migration_version,
                        "rls_force_enabled": True,
                    }
                ]
            )
        return _Cursor([{"changed": True}])


class _ConnectionContext:
    def __init__(self, connection: _Connection) -> None:
        self._connection = connection

    async def __aenter__(self) -> _Connection:
        return self._connection

    async def __aexit__(
        self,
        exception_type: type[BaseException] | None,
        exception: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        del exception_type, exception, traceback


class _Pool:
    def __init__(self, connection: _Connection) -> None:
        self._connection = connection
        self.acquisition_timeouts: list[float] = []

    def connection(self, *, timeout: float) -> _ConnectionContext:
        self.acquisition_timeouts.append(timeout)
        return _ConnectionContext(self._connection)


async def test_worker_database_sets_every_approved_transaction_timeout() -> None:
    connection = _Connection()
    pool = _Pool(connection)
    database = WorkerDatabase.__new__(WorkerDatabase)
    database._pool = cast(Any, pool)
    database._telemetry = None

    query = "select private.complete_run_execution() as changed"
    rows = await database._fetchall(query, ())

    assert pool.acquisition_timeouts == [2.0]
    assert rows == [{"changed": True}]
    assert len(connection.queries) == 2
    timeout_query, timeout_parameters = connection.queries[0]
    assert timeout_parameters is None
    assert timeout_query.count("pg_catalog.set_config") == 3
    assert "set_config('statement_timeout', '8000', true)" in timeout_query
    assert "set_config('lock_timeout', '2000', true)" in timeout_query
    assert "'idle_in_transaction_session_timeout', '10000', true" in timeout_query
    assert connection.queries[1] == (query, ())


async def test_worker_database_readiness_requires_the_exact_schema_head() -> None:
    connection = _Connection()
    database = WorkerDatabase.__new__(WorkerDatabase)
    database._pool = cast(Any, _Pool(connection))
    database._telemetry = None
    database._queue_transport = "bullmq"
    database._migration_head = "20260801125632"

    assert await database.ready() is True

    connection.migration_version = "20260730220000"

    assert await database.ready() is False


async def test_worker_database_uses_only_the_v2_bullmq_claim_function() -> None:
    run_id = UUID("00000000-0000-4000-8000-0000000000b3")
    job_id = f"run-{run_id}-generation-2"
    database = WorkerDatabase.__new__(WorkerDatabase)
    calls: list[tuple[str, tuple[object, ...]]] = []

    async def fetchone(query: str, parameters: tuple[object, ...]) -> dict[str, Any]:
        calls.append((" ".join(query.split()), parameters))
        return {
            "attempt_id": None,
            "claim_status": "no_work",
            "correlation_id": None,
            "deterministic_seed": None,
            "frozen_manifest": None,
            "frozen_manifest_sha256": None,
            "lease_token": None,
            "traceparent": None,
        }

    cast(Any, database)._fetchone = fetchone

    claim = await database.claim_execution_v2(run_id, 2, job_id)

    assert claim.status == "no_work"
    assert calls == [
        (
            "select * from private.claim_run_execution_v2_traced(%s, %s, %s)",
            (run_id, 2, job_id),
        )
    ]


async def test_worker_database_requires_the_selected_durable_queue_transport() -> None:
    database = WorkerDatabase.__new__(WorkerDatabase)
    calls: list[tuple[str, tuple[object, ...]]] = []

    async def fetchone(query: str, parameters: tuple[object, ...]) -> dict[str, Any]:
        calls.append((" ".join(query.split()), parameters))
        return {"active": True}

    cast(Any, database)._fetchone = fetchone

    await database.require_queue_transport("bullmq")

    assert calls == [
        (
            "select private.require_queue_transport(%s) as active",
            ("bullmq",),
        )
    ]
    assert database._database_operation(calls[0][0]) == "require_queue_transport"


async def test_worker_database_uses_the_separate_behavioral_completion_function() -> None:
    database = WorkerDatabase.__new__(WorkerDatabase)
    calls: list[tuple[str, tuple[object, ...]]] = []

    async def boolean_function(
        query: str,
        parameters: tuple[object, ...],
    ) -> bool:
        calls.append((" ".join(query.split()), parameters))
        return True

    cast(Any, database)._boolean_function = boolean_function
    run_id = UUID("00000000-0000-4000-8000-000000000001")
    attempt_id = UUID("00000000-0000-4000-8000-000000000002")
    lease_token = UUID("00000000-0000-4000-8000-000000000003")

    changed = await database.complete_behavioral_execution(
        run_id,
        attempt_id,
        lease_token,
        b'{"schema_version":1}',
        {"schema_version": 1},
    )

    assert changed is True
    assert len(calls) == 1
    query, parameters = calls[0]
    assert query == (
        "select private.complete_behavioral_run_execution(%s, %s, %s, %s, %s) as changed"
    )
    assert parameters[:4] == (
        run_id,
        attempt_id,
        lease_token,
        b'{"schema_version":1}',
    )
    assert database._database_operation(query) == "complete_behavioral_execution"
