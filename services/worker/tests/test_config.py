from __future__ import annotations

import pytest
from simula_worker.config import ConfigurationError, WorkerSettings


def _environment(monkeypatch: pytest.MonkeyPatch, **overrides: str) -> None:
    values = {
        "SIMULA_ENVIRONMENT": "test",
        "SIMULA_RELEASE_SHA": "a" * 40,
        "SIMULA_WORKER_DATABASE_URL": (
            "postgresql://simula_worker:worker-password@127.0.0.1:54322/postgres?sslmode=disable"
        ),
        "SIMULA_REDIS_URL": "redis://127.0.0.1:6379/0",
    }
    values.update(overrides)
    for name, value in values.items():
        monkeypatch.setenv(name, value)


def test_worker_settings_require_the_dedicated_runtime_role(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _environment(
        monkeypatch,
        SIMULA_WORKER_DATABASE_URL=(
            "postgresql://simula_api:api-password@127.0.0.1:54322/postgres?sslmode=disable"
        ),
    )

    with pytest.raises(ConfigurationError, match="simula_worker"):
        WorkerSettings.from_environment()


def test_worker_settings_accept_loopback_test_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    _environment(monkeypatch)

    settings = WorkerSettings.from_environment()

    assert settings.environment == "test"
    assert settings.redis_url == "redis://127.0.0.1:6379/0"
    assert settings.metrics_port == 9464


def test_worker_settings_reject_invalid_metrics_port(monkeypatch: pytest.MonkeyPatch) -> None:
    _environment(monkeypatch, SIMULA_WORKER_METRICS_PORT="0")

    with pytest.raises(ConfigurationError, match="1 through 65535"):
        WorkerSettings.from_environment()


def test_worker_settings_require_an_exact_git_release(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _environment(monkeypatch, SIMULA_RELEASE_SHA="dev")

    with pytest.raises(ConfigurationError, match="exact 40-character git SHA"):
        WorkerSettings.from_environment()
