"""Least-privilege operator CLI for the durable ARQ/BullMQ ownership fence."""

from __future__ import annotations

import argparse
import json
import os
from collections.abc import Mapping
from datetime import datetime
from typing import Literal, cast
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from scripts.run_control import operator_database_url

QueueTransportCommand = Literal["status", "set-arq", "set-bullmq"]


def _status_payload(row: Mapping[str, object], *, changed: bool | None) -> dict[str, object]:
    active_transport = row.get("active_transport")
    correlation_id = row.get("correlation_id")
    updated_at = row.get("updated_at")
    if (
        active_transport not in {"arq", "bullmq"}
        or not isinstance(correlation_id, UUID)
        or not isinstance(updated_at, datetime)
    ):
        raise RuntimeError("operator queue-transport response is malformed")
    return {
        "active_transport": active_transport,
        "changed": changed,
        "correlation_id": str(correlation_id),
        "status": "ok",
        "updated_at": updated_at.isoformat(),
    }


def execute_queue_transport_control(
    database_url: str,
    *,
    command: QueueTransportCommand,
    correlation_id: UUID | None,
) -> dict[str, object]:
    changed: bool | None = None
    with psycopg.connect(
        database_url,
        connect_timeout=5,
        row_factory=dict_row,
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute("set local statement_timeout = '8s'")
            if command != "status":
                if correlation_id is None:
                    raise ValueError("operator queue-transport mutation requires a correlation ID")
                target = "arq" if command == "set-arq" else "bullmq"
                cursor.execute(
                    "select private.set_queue_transport(%s, %s) as changed",
                    (target, correlation_id),
                )
                mutation = cursor.fetchone()
                if mutation is None or not isinstance(mutation.get("changed"), bool):
                    raise RuntimeError("operator queue-transport mutation returned no result")
                changed = cast(bool, mutation["changed"])
            cursor.execute("select * from private.get_queue_transport_control()")
            status = cursor.fetchone()
            if status is None:
                raise RuntimeError("operator queue-transport status returned no result")
    return _status_payload(status, changed=changed)


def main() -> None:
    parser = argparse.ArgumentParser(description="SIMULA audited queue-transport operator")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("status", help="read durable ARQ/BullMQ ownership")
    for name in ("set-arq", "set-bullmq"):
        command_parser = commands.add_parser(
            name,
            help=f"set durable transport ownership to {name.removeprefix('set-')}",
        )
        command_parser.add_argument("--correlation-id", required=True, type=UUID)
    arguments = parser.parse_args()
    result = execute_queue_transport_control(
        operator_database_url(os.environ),
        command=cast(QueueTransportCommand, arguments.command),
        correlation_id=cast(
            UUID | None,
            getattr(arguments, "correlation_id", None),
        ),
    )
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
