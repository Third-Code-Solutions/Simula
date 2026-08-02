from __future__ import annotations

from types import TracebackType
from typing import Any, Self, cast

from simula_api.database import DatabaseGateway


class _Cursor:
    def __init__(self, row: dict[str, Any]) -> None:
        self._row = row

    async def fetchone(self) -> dict[str, Any]:
        return self._row


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
    def __init__(self, migration_version: str) -> None:
        self.migration_version = migration_version

    def transaction(self) -> _Transaction:
        return _Transaction()

    async def execute(self, query: str) -> _Cursor:
        if "select 1 as ready" in query:
            return _Cursor({"ready": 1})
        if "runtime_schema_readiness" in query:
            return _Cursor(
                {
                    "migration_version": self.migration_version,
                    "rls_force_enabled": True,
                }
            )
        if "runtime_observability_snapshot" in query:
            return _Cursor({})
        raise AssertionError(f"unexpected readiness query: {query}")


class _ConnectionContext:
    def __init__(self, connection: _Connection) -> None:
        self.connection = connection

    async def __aenter__(self) -> _Connection:
        return self.connection

    async def __aexit__(
        self,
        exception_type: type[BaseException] | None,
        exception: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        del exception_type, exception, traceback


class _Pool:
    def __init__(self, connection: _Connection) -> None:
        self.connection_value = connection

    def connection(self, *, timeout: float) -> _ConnectionContext:
        assert timeout == 2.0
        return _ConnectionContext(self.connection_value)


async def test_api_database_readiness_requires_the_exact_schema_head() -> None:
    connection = _Connection("20260802143000")
    database = DatabaseGateway.__new__(DatabaseGateway)
    database._pool = cast(Any, _Pool(connection))
    database._telemetry = None
    database._migration_head = "20260802143000"

    assert await database.ready() is True

    connection.migration_version = "20260730220000"

    assert await database.ready() is False
