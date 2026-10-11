from __future__ import annotations

import pytest
from simula_core.runtime_admission import REQUIRED_DATABASE_MIGRATION_HEAD
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
    if overrides.get("SIMULA_ENVIRONMENT", values["SIMULA_ENVIRONMENT"]) == "production":
        values.update(
            {
                "SIMULA_DATABASE_MIGRATION_HEAD": REQUIRED_DATABASE_MIGRATION_HEAD,
                "SIMULA_PRODUCTION_ADMISSION_ENABLED": "true",
                "SIMULA_PRODUCTION_ROLLOUT_ID": ("018f274b-3c77-4b22-b749-c9274230ef9a"),
                "SIMULA_RELEASE_PROVENANCE_URL": (
                    "https://github.com/Third-Code-Solutions/Simula/actions/runs/12345678"
                ),
                "SIMULA_RELEASE_BUNDLE_SHA256": "b" * 64,
                "SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256": "c" * 64,
            }
        )
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
    assert settings.queue_transport == "arq"
    assert settings.behavioral_engine_transport == "disabled"
    assert settings.behavioral_engine_url is None
    assert settings.behavioral_engine_token is None


def test_worker_settings_admit_bullmq_in_production_only_with_release_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _environment(monkeypatch, SIMULA_WORKER_QUEUE_TRANSPORT="bullmq")

    assert WorkerSettings.from_environment().queue_transport == "bullmq"

    _environment(
        monkeypatch,
        SIMULA_ENVIRONMENT="production",
        SIMULA_WORKER_QUEUE_TRANSPORT="bullmq",
        SIMULA_WORKER_DATABASE_URL=(
            "postgresql://simula_worker:worker-password@db.example.test:5432/postgres"
            "?sslmode=verify-full"
        ),
        SIMULA_REDIS_URL="redis://default:secret@redis.railway.internal:6379/0",
    )
    settings = WorkerSettings.from_environment()

    assert settings.queue_transport == "bullmq"
    assert settings.production_admission is not None


def test_worker_settings_reject_unknown_queue_transport(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _environment(monkeypatch, SIMULA_WORKER_QUEUE_TRANSPORT="celery")

    with pytest.raises(ConfigurationError, match="must be arq or bullmq"):
        WorkerSettings.from_environment()


def test_worker_settings_admit_private_engine_only_on_safe_nonproduction_origin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _environment(
        monkeypatch,
        SIMULA_WORKER_QUEUE_TRANSPORT="bullmq",
        SIMULA_BEHAVIORAL_ENGINE_TRANSPORT="private_http",
        SIMULA_BEHAVIORAL_ENGINE_URL="http://127.0.0.1:8010",
        SIMULA_BEHAVIORAL_ENGINE_TOKEN="t" * 32,
    )

    settings = WorkerSettings.from_environment()

    assert settings.behavioral_engine_transport == "private_http"
    assert settings.behavioral_engine_url == "http://127.0.0.1:8010"
    assert settings.behavioral_engine_token == "t" * 32


@pytest.mark.parametrize(
    "url",
    (
        "https://127.0.0.1:8010",
        "http://engine.example.test",
        "http://user:password@127.0.0.1:8010",
        "http://127.0.0.1:8010/path",
        "http://127.0.0.1:8010?query=1",
    ),
)
def test_worker_settings_reject_unsafe_private_engine_origins(
    monkeypatch: pytest.MonkeyPatch,
    url: str,
) -> None:
    _environment(
        monkeypatch,
        SIMULA_WORKER_QUEUE_TRANSPORT="bullmq",
        SIMULA_BEHAVIORAL_ENGINE_TRANSPORT="private_http",
        SIMULA_BEHAVIORAL_ENGINE_URL=url,
        SIMULA_BEHAVIORAL_ENGINE_TOKEN="t" * 32,
    )

    with pytest.raises(ConfigurationError, match=r"(?i)behavioral.engine"):
        WorkerSettings.from_environment()


def test_worker_settings_admit_private_engine_in_production_with_release_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _environment(
        monkeypatch,
        SIMULA_ENVIRONMENT="production",
        SIMULA_WORKER_DATABASE_URL=(
            "postgresql://simula_worker:worker-password@db.example.test:5432/postgres"
            "?sslmode=verify-full"
        ),
        SIMULA_REDIS_URL="redis://default:secret@redis.railway.internal:6379/0",
        SIMULA_WORKER_QUEUE_TRANSPORT="bullmq",
        SIMULA_BEHAVIORAL_ENGINE_TRANSPORT="private_http",
        SIMULA_BEHAVIORAL_ENGINE_URL="http://simula-ai-engine.railway.internal:8010",
        SIMULA_BEHAVIORAL_ENGINE_TOKEN="t" * 32,
    )

    settings = WorkerSettings.from_environment()

    assert settings.behavioral_engine_transport == "private_http"
    assert settings.production_admission is not None


def test_worker_settings_reject_production_without_release_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _environment(
        monkeypatch,
        SIMULA_ENVIRONMENT="production",
        SIMULA_WORKER_DATABASE_URL=(
            "postgresql://simula_worker:worker-password@db.example.test:5432/postgres"
            "?sslmode=verify-full"
        ),
        SIMULA_REDIS_URL="redis://default:secret@redis.railway.internal:6379/0",
    )
    monkeypatch.delenv("SIMULA_RELEASE_PROVENANCE_URL")

    with pytest.raises(ConfigurationError, match="PROVENANCE_URL is required"):
        WorkerSettings.from_environment()


def test_worker_settings_reject_private_engine_on_legacy_queue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _environment(
        monkeypatch,
        SIMULA_BEHAVIORAL_ENGINE_TRANSPORT="private_http",
        SIMULA_BEHAVIORAL_ENGINE_URL="http://127.0.0.1:8010",
        SIMULA_BEHAVIORAL_ENGINE_TOKEN="t" * 32,
    )

    with pytest.raises(ConfigurationError, match="requires the BullMQ v2"):
        WorkerSettings.from_environment()


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


@pytest.mark.parametrize("sslmode", ["require", "verify-ca"])
def test_deployed_worker_rejects_database_tls_without_hostname_verification(
    monkeypatch: pytest.MonkeyPatch,
    sslmode: str,
) -> None:
    _environment(
        monkeypatch,
        SIMULA_ENVIRONMENT="production",
        SIMULA_WORKER_DATABASE_URL=(
            "postgresql://simula_worker:worker-password@db.example.test:5432/postgres"
            f"?sslmode={sslmode}"
        ),
        SIMULA_REDIS_URL="rediss://redis.example.test:6379/0",
    )

    with pytest.raises(ConfigurationError, match="sslmode=verify-full"):
        WorkerSettings.from_environment()


def test_deployed_worker_accepts_railway_private_redis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _environment(
        monkeypatch,
        SIMULA_ENVIRONMENT="production",
        SIMULA_WORKER_DATABASE_URL=(
            "postgresql://simula_worker:worker-password@db.example.test:5432/postgres"
            "?sslmode=verify-full"
        ),
        SIMULA_REDIS_URL="redis://default:secret@redis.railway.internal:6379/0",
    )

    settings = WorkerSettings.from_environment()

    assert settings.redis_url == "redis://default:secret@redis.railway.internal:6379/0"


def test_deployed_worker_accepts_project_scoped_supavisor_role(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _environment(
        monkeypatch,
        SIMULA_ENVIRONMENT="production",
        SIMULA_WORKER_DATABASE_URL=(
            "postgresql://simula_worker.ywiwmczccktwzqyhzhiz:worker-password@"
            "aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full"
        ),
        SIMULA_REDIS_URL="redis://default:secret@redis.railway.internal:6379/0",
    )

    settings = WorkerSettings.from_environment()

    assert settings.database_url.startswith("postgresql://simula_worker.ywiwmczccktwzqyhzhiz:")


def test_deployed_worker_rejects_a_different_project_scoped_role(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _environment(
        monkeypatch,
        SIMULA_ENVIRONMENT="production",
        SIMULA_WORKER_DATABASE_URL=(
            "postgresql://simula_api.ywiwmczccktwzqyhzhiz:api-password@"
            "aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full"
        ),
        SIMULA_REDIS_URL="redis://default:secret@redis.railway.internal:6379/0",
    )

    with pytest.raises(ConfigurationError, match="simula_worker"):
        WorkerSettings.from_environment()


def test_deployed_worker_rejects_plaintext_public_redis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _environment(
        monkeypatch,
        SIMULA_ENVIRONMENT="production",
        SIMULA_WORKER_DATABASE_URL=(
            "postgresql://simula_worker:worker-password@db.example.test:5432/postgres"
            "?sslmode=verify-full"
        ),
        SIMULA_REDIS_URL="redis://redis.example.test:6379/0",
    )

    with pytest.raises(ConfigurationError, match="Railway private-network"):
        WorkerSettings.from_environment()
