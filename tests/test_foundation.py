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
