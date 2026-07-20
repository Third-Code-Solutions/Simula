"""Audited least-privilege operator CLI for the durable run-admission latch."""

from __future__ import annotations

import argparse
import json
import os
from collections.abc import Mapping
from datetime import datetime
from typing import Literal, cast
from urllib.parse import parse_qs, urlparse
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

RunControlCommand = Literal["status", "disable", "enable"]
_LOCAL_ENVIRONMENTS = frozenset({"local", "test"})
_VALID_ENVIRONMENTS = frozenset({"local", "test", "preview", "staging", "production"})
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})


class OperatorConfigurationError(ValueError):
    """Raised when operator credentials are absent, broad, or transport-unsafe."""


def operator_database_url(environment: Mapping[str, str]) -> str:
    runtime_environment = environment.get("SIMULA_ENVIRONMENT", "").strip().lower()
    if runtime_environment not in _VALID_ENVIRONMENTS:
        raise OperatorConfigurationError("SIMULA_ENVIRONMENT is unsupported")
    database_url = environment.get("SIMULA_OPERATOR_DATABASE_URL", "").strip()
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise OperatorConfigurationError(
            "SIMULA_OPERATOR_DATABASE_URL must use postgres or postgresql"
        )
    if parsed.username != "simula_operator":
        raise OperatorConfigurationError(
            "SIMULA_OPERATOR_DATABASE_URL must authenticate as simula_operator"
        )
    if not parsed.password or not parsed.hostname or parsed.fragment:
        raise OperatorConfigurationError(
            "SIMULA_OPERATOR_DATABASE_URL must include credentials and a host with no fragment"
        )
    sslmode = parse_qs(parsed.query).get("sslmode", [""])[-1].lower()
    if runtime_environment in _LOCAL_ENVIRONMENTS:
        if parsed.hostname not in _LOOPBACK_HOSTS:
            raise OperatorConfigurationError("local/test operator database must use loopback")
    elif parsed.scheme != "postgresql" or sslmode != "verify-full":
        raise OperatorConfigurationError(
            "non-local operator database must use postgresql with sslmode=verify-full"
        )
    return database_url


def _status_payload(row: Mapping[str, object], *, changed: bool | None) -> dict[str, object]:
    updated_at = row.get("updated_at")
    correlation_id = row.get("correlation_id")
    reason = row.get("reason")
    if (
        row.get("control_name") != "run_creation"
        or not isinstance(row.get("enabled"), bool)
        or (reason is not None and not isinstance(reason, str))
        or not isinstance(correlation_id, UUID)
        or not isinstance(updated_at, datetime)
    ):
        raise RuntimeError("operator run-control response is malformed")
    return {
        "changed": changed,
        "control": "run_creation",
        "correlation_id": str(correlation_id),
        "enabled": row["enabled"],
        "reason": reason,
        "status": "ok",
        "updated_at": updated_at.isoformat(),
    }


def execute_run_control(
    database_url: str,
    *,
    command: RunControlCommand,
    correlation_id: UUID | None,
) -> dict[str, object]:
    changed: bool | None = None
    with psycopg.connect(database_url, connect_timeout=5, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute("set local statement_timeout = '8s'")
            if command != "status":
                if correlation_id is None:
                    raise ValueError("operator mutation requires a correlation ID")
                enabled = command == "enable"
                reason = "operator_recovery_verified" if enabled else "operator_manual"
                cursor.execute(
                    "select private.set_run_creation_control(%s, %s, %s) as changed",
                    (enabled, reason, correlation_id),
                )
                mutation = cursor.fetchone()
                if mutation is None or not isinstance(mutation.get("changed"), bool):
                    raise RuntimeError("operator run-control mutation returned no result")
                changed = cast(bool, mutation["changed"])
            cursor.execute("select * from private.get_run_creation_control()")
            status = cursor.fetchone()
            if status is None:
                raise RuntimeError("operator run-control status returned no result")
    return _status_payload(status, changed=changed)


def main() -> None:
    parser = argparse.ArgumentParser(description="SIMULA audited run-control operator")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("status", help="read the durable run-admission latch")
    for name in ("disable", "enable"):
        command_parser = commands.add_parser(name, help=f"{name} new run admission")
        command_parser.add_argument("--correlation-id", required=True, type=UUID)
        if name == "enable":
            command_parser.add_argument("--recovery-verified", action="store_true")
    arguments = parser.parse_args()
    if arguments.command == "enable" and not arguments.recovery_verified:
        parser.error("enable requires --recovery-verified")
    requested_command = cast(RunControlCommand, arguments.command)
    correlation_id = cast(UUID | None, getattr(arguments, "correlation_id", None))
    result = execute_run_control(
        operator_database_url(os.environ),
        command=requested_command,
        correlation_id=correlation_id,
    )
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
