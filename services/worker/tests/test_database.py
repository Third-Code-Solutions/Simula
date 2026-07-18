from __future__ import annotations

from types import TracebackType
from typing import Any, Self, cast

from simula_worker.database import WorkerDatabase


class _Cursor:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    async def fetchall(self) -> list[dict[str, Any]]:
        return self._rows


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
    def __init__(self) -> None:
        self.queries: list[tuple[str, tuple[object, ...] | None]] = []

    def transaction(self) -> _Transaction:
        return _Transaction()

    async def execute(self, query: str, parameters: tuple[object, ...] | None = None) -> _Cursor:
        self.queries.append((" ".join(query.split()), parameters))
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
