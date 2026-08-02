from __future__ import annotations

import sys
from datetime import UTC, datetime
from uuid import UUID

import pytest

from scripts import queue_transport_control


def test_queue_transport_status_payload_is_exact() -> None:
    updated_at = datetime.now(UTC)
    correlation_id = UUID(int=1)

    assert queue_transport_control._status_payload(
        {
            "active_transport": "bullmq",
            "correlation_id": correlation_id,
            "updated_at": updated_at,
        },
        changed=True,
    ) == {
        "active_transport": "bullmq",
        "changed": True,
        "correlation_id": str(correlation_id),
        "status": "ok",
        "updated_at": updated_at.isoformat(),
    }


@pytest.mark.parametrize(
    "row",
    (
        {},
        {
            "active_transport": "celery",
            "correlation_id": UUID(int=1),
            "updated_at": datetime.now(UTC),
        },
        {
            "active_transport": "arq",
            "correlation_id": "not-a-uuid",
            "updated_at": datetime.now(UTC),
        },
    ),
)
def test_queue_transport_status_payload_rejects_malformed_rows(
    row: dict[str, object],
) -> None:
    with pytest.raises(RuntimeError, match="response is malformed"):
        queue_transport_control._status_payload(row, changed=None)


@pytest.mark.parametrize("command", ("set-arq", "set-bullmq"))
def test_queue_transport_cli_requires_a_correlation_id(
    monkeypatch: pytest.MonkeyPatch,
    command: str,
) -> None:
    monkeypatch.setattr(sys, "argv", ["queue_transport_control", command])

    with pytest.raises(SystemExit):
        queue_transport_control.main()


def test_queue_transport_cli_routes_the_exact_target(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    correlation_id = UUID(int=2)
    captured: dict[str, object] = {}

    def execute(
        database_url: str,
        *,
        command: queue_transport_control.QueueTransportCommand,
        correlation_id: UUID | None,
    ) -> dict[str, object]:
        captured.update(
            database_url=database_url,
            command=command,
            correlation_id=correlation_id,
        )
        return {
            "active_transport": "bullmq",
            "changed": True,
            "correlation_id": str(correlation_id),
            "status": "ok",
            "updated_at": "2026-07-30T00:00:00+00:00",
        }

    monkeypatch.setattr(
        queue_transport_control,
        "operator_database_url",
        lambda _environment: "postgresql://operator",
    )
    monkeypatch.setattr(
        queue_transport_control,
        "execute_queue_transport_control",
        execute,
    )
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "queue_transport_control",
            "set-bullmq",
            "--correlation-id",
            str(correlation_id),
        ],
    )

    queue_transport_control.main()

    assert captured == {
        "database_url": "postgresql://operator",
        "command": "set-bullmq",
        "correlation_id": correlation_id,
    }
    assert (
        capsys.readouterr().out == '{"active_transport":"bullmq","changed":true,'
        f'"correlation_id":"{correlation_id}",'
        '"status":"ok","updated_at":"2026-07-30T00:00:00+00:00"}\n'
    )
