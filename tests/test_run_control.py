from __future__ import annotations

import json
import sys
from collections.abc import Mapping
from uuid import UUID

import pytest

from scripts import run_control


def _environment(**overrides: str) -> Mapping[str, str]:
    return {
        "SIMULA_ENVIRONMENT": "test",
        "SIMULA_OPERATOR_DATABASE_URL": (
            "postgresql://simula_operator:operator-password@127.0.0.1:54322/"
            "postgres?sslmode=disable"
        ),
        **overrides,
    }


def _set_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in _environment().items():
        monkeypatch.setenv(name, value)


def test_operator_database_url_accepts_only_the_dedicated_local_role() -> None:
    assert "simula_operator" in run_control.operator_database_url(_environment())

    with pytest.raises(run_control.OperatorConfigurationError, match="simula_operator"):
        run_control.operator_database_url(
            _environment(
                SIMULA_OPERATOR_DATABASE_URL=(
                    "postgresql://postgres:password@127.0.0.1:54322/postgres"
                )
            )
        )


def test_deployed_operator_database_requires_hostname_verified_tls() -> None:
    with pytest.raises(run_control.OperatorConfigurationError, match="verify-full"):
        run_control.operator_database_url(
            _environment(
                SIMULA_ENVIRONMENT="production",
                SIMULA_OPERATOR_DATABASE_URL=(
                    "postgresql://simula_operator:password@db.example.test:5432/postgres"
                ),
            )
        )


def test_enable_command_requires_explicit_recovery_verification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        sys,
        "argv",
        ["run_control", "enable", "--correlation-id", str(UUID(int=1))],
    )
    _set_environment(monkeypatch)

    with pytest.raises(SystemExit) as error:
        run_control.main()

    assert error.value.code == 2


def test_verified_enable_dispatches_the_narrow_command_and_prints_safe_json(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    correlation_id = UUID("00000000-0000-4000-8000-000000000123")
    calls: list[tuple[str, str, UUID | None]] = []

    def execute(
        database_url: str,
        *,
        command: run_control.RunControlCommand,
        correlation_id: UUID | None,
    ) -> dict[str, object]:
        calls.append((database_url, command, correlation_id))
        return {"changed": True, "enabled": True, "status": "ok"}

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "run_control",
            "enable",
            "--correlation-id",
            str(correlation_id),
            "--recovery-verified",
        ],
    )
    _set_environment(monkeypatch)
    monkeypatch.setattr(run_control, "execute_run_control", execute)

    run_control.main()

    output = json.loads(capsys.readouterr().out)
    assert output == {"changed": True, "enabled": True, "status": "ok"}
    assert calls == [
        (
            _environment()["SIMULA_OPERATOR_DATABASE_URL"],
            "enable",
            correlation_id,
        )
    ]
