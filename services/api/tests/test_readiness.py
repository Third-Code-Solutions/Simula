from __future__ import annotations

import asyncio
from functools import partial

import pytest
from httpx import ASGITransport, AsyncClient
from simula_api.app import create_app
from simula_api.readiness import DependencyReadiness
from simula_api.telemetry import ApiTelemetry


def _safe_runtime(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "test")
    monkeypatch.setenv("SIMULA_RELEASE_SHA", "a" * 40)
    monkeypatch.setenv("SIMULA_LOG_LEVEL", "INFO")
    monkeypatch.setenv(
        "SIMULA_DATABASE_URL",
        "postgresql://simula_api:test-password@127.0.0.1:54322/postgres?sslmode=disable",
    )
    monkeypatch.setenv("SIMULA_SUPABASE_URL", "http://127.0.0.1:54321")
    monkeypatch.setenv(
        "SIMULA_SUPABASE_JWKS_URL",
        "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json",
    )
    monkeypatch.setenv("SIMULA_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key")
    monkeypatch.setenv("SIMULA_REDIS_URL", "redis://127.0.0.1:6379/0")
    monkeypatch.setenv("SIMULA_CURSOR_SECRET", "c" * 32)


async def test_readiness_checks_every_dependency_and_exports_bounded_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _safe_runtime(monkeypatch)
    checks: list[str] = []
    states = {
        "auth": True,
        "database": True,
        "queue": False,
        "rate_limit": True,
        "run_admission": True,
    }

    async def ready(name: str) -> bool:
        checks.append(name)
        return states[name]

    telemetry = ApiTelemetry()
    probe = DependencyReadiness(
        {
            name: partial(ready, name)
            for name in ("auth", "database", "queue", "rate_limit", "run_admission")
        },
        telemetry,
    )
    app = create_app()
    app.state.domain_ready = True
    app.state.readiness = probe
    app.state.telemetry = telemetry

    async with AsyncClient(
        transport=ASGITransport(app=app, client=("127.0.0.1", 123)),
        base_url="http://test",
    ) as client:
        response = await client.get("/health/ready")
        failed_metrics = telemetry.render().decode()
        states["queue"] = True
        recovered = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"
    assert set(checks) == {"auth", "database", "queue", "rate_limit", "run_admission"}
    assert 'simula_api_dependency_ready{dependency="queue"} 0.0' in failed_metrics
    assert 'simula_api_dependency_ready{dependency="database"} 1.0' in failed_metrics
    assert recovered.status_code == 200
    assert recovered.json()["status"] == "ready"
    assert 'simula_api_dependency_ready{dependency="queue"} 1.0' in (telemetry.render().decode())


async def test_readiness_timeout_fails_closed() -> None:
    telemetry = ApiTelemetry()

    async def blocked() -> bool:
        await asyncio.Event().wait()
        return True

    probe = DependencyReadiness({"database": blocked}, telemetry, timeout_seconds=0.001)

    assert await probe.ready() is False
    assert 'simula_api_dependency_ready{dependency="database"} 0.0' in (telemetry.render().decode())
