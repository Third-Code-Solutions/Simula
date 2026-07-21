from __future__ import annotations

import pytest
from simula_api.config import ApiSettings, ConfigurationError


def _environment(monkeypatch: pytest.MonkeyPatch, **overrides: str) -> None:
    values = {
        "SIMULA_ENVIRONMENT": "production",
        "SIMULA_RELEASE_SHA": "a" * 40,
        "SIMULA_DATABASE_URL": (
            "postgresql://simula_api:api-password@db.example.test:5432/postgres?sslmode=verify-full"
        ),
        "SIMULA_SUPABASE_URL": "https://project.supabase.co",
        "SIMULA_SUPABASE_JWKS_URL": ("https://project.supabase.co/auth/v1/.well-known/jwks.json"),
        "SIMULA_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_" + ("A" * 32),
        "SIMULA_REDIS_URL": "rediss://redis.example.test:6379/0",
        "SIMULA_CURSOR_SECRET": "a" * 64,
        "SIMULA_CORS_ORIGINS": "https://app.example.test",
    }
    values.update(overrides)
    for name, value in values.items():
        monkeypatch.setenv(name, value)


@pytest.mark.parametrize("sslmode", ["require", "verify-ca"])
def test_deployed_api_rejects_database_tls_without_hostname_verification(
    monkeypatch: pytest.MonkeyPatch,
    sslmode: str,
) -> None:
    _environment(
        monkeypatch,
        SIMULA_DATABASE_URL=(
            f"postgresql://simula_api:api-password@db.example.test:5432/postgres?sslmode={sslmode}"
        ),
    )

    with pytest.raises(ConfigurationError, match="sslmode=verify-full"):
        ApiSettings.from_environment()


def test_deployed_api_accepts_database_hostname_verification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _environment(monkeypatch)

    assert ApiSettings.from_environment().environment == "production"


def test_deployed_api_accepts_project_scoped_supavisor_role(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_ref = "a" * 20
    _environment(
        monkeypatch,
        SIMULA_DATABASE_URL=(
            f"postgresql://simula_api.{project_ref}:api-password@"
            "pooler.example.test:5432/postgres?sslmode=verify-full"
        ),
    )

    assert ApiSettings.from_environment().environment == "production"
