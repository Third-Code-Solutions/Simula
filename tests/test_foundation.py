from subprocess import CompletedProcess

import pytest
from simula_api.app import app
from simula_core.runtime import RuntimeMetadata
from simula_worker.main import serve

import scripts.verify_p2_e2e as browser_gate
from tests.integration.redis_fixture import (
    TEST_QUEUE_NAME,
    TEST_REDIS_URL,
    TEST_STATE_PREFIX,
    redis_test_settings,
)


def test_all_python_workspace_packages_import() -> None:
    assert app.title == "SIMULA API"
    assert RuntimeMetadata.from_environment(service="worker").service == "worker"
    assert callable(serve)


def test_browser_readiness_timeout_is_retryable(monkeypatch: pytest.MonkeyPatch) -> None:
    def time_out(*_: object, **__: object) -> None:
        raise TimeoutError

    monkeypatch.setattr(browser_gate, "urlopen", time_out)

    assert browser_gate.response_is_ok(browser_gate.WEB_URL) is False


def test_browser_gate_overrides_release_public_origins(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The isolated browser proof must never inherit production browser routes."""

    monkeypatch.setattr(browser_gate, "executable", lambda *_args, **_kwargs: "git")
    monkeypatch.setattr(
        browser_gate,
        "run",
        lambda command, **_kwargs: CompletedProcess(command, 0, stdout="a" * 40),
    )
    release_environment = {
        "NEXT_PUBLIC_SIMULA_API_URL": "https://legacy.example.invalid",
        "NEXT_PUBLIC_SIMULA_API_V1_URL": "https://v1.example.invalid",
        "NEXT_PUBLIC_SIMULA_API_V2_URL": "https://v2.example.invalid",
        "NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION": "v2",
        "NEXT_PUBLIC_SIMULA_ENVIRONMENT": "production",
        "NEXT_PUBLIC_SIMULA_WEB_URL": "https://web.example.invalid",
    }

    _, _, web_environment = browser_gate.runtime_environments(
        base=release_environment,
        supabase=browser_gate.SupabaseRuntime(
            api_url="http://127.0.0.1:54321",
            publishable_key="local-public-key",
        ),
        api_credential="api-credential",
        worker_credential="worker-credential",
    )

    assert web_environment["NEXT_PUBLIC_SIMULA_API_URL"] == "http://127.0.0.1:8000"
    assert web_environment["NEXT_PUBLIC_SIMULA_API_V1_URL"] == "http://127.0.0.1:8000"
    assert web_environment["NEXT_PUBLIC_SIMULA_API_V2_URL"] == "http://127.0.0.1:8000"
    assert web_environment["NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION"] == "v1"
    assert web_environment["NEXT_PUBLIC_SIMULA_ENVIRONMENT"] == "local"
    assert web_environment["NEXT_PUBLIC_SIMULA_WEB_URL"] == "http://127.0.0.1:3100"


def test_integration_redis_target_is_fixed_and_namespaced() -> None:
    settings = redis_test_settings()

    assert TEST_REDIS_URL == "redis://127.0.0.1:6379/15"
    assert settings.host == "127.0.0.1"
    assert settings.port == 6379
    assert settings.database == 15
    assert settings.username is None
    assert settings.password is None
    assert TEST_QUEUE_NAME.startswith("simula:test:foundation:")
    assert TEST_STATE_PREFIX.startswith("simula:test:foundation:")
