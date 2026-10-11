from __future__ import annotations

from collections.abc import Iterator
from http.client import RemoteDisconnected

import pytest

from scripts.verify_m0_runtime import AUTH_HEALTH_URL
from tests.integration import test_database_boundary as boundary


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    elapsed = [0.0]

    def advance(seconds: float) -> None:
        elapsed[0] += seconds

    monkeypatch.setattr(boundary, "monotonic", lambda: elapsed[0])
    monkeypatch.setattr(boundary, "sleep", advance)
    return elapsed


def test_auth_waits_for_gateway_recovery_before_signing_in(
    monkeypatch: pytest.MonkeyPatch, clock: list[float]
) -> None:
    responses: Iterator[int | Exception] = iter(
        [502, ConnectionError(), RemoteDisconnected(""), 200]
    )
    calls: list[str] = []

    def health(url: str, *, timeout_seconds: float) -> int:
        assert url == AUTH_HEALTH_URL
        assert 0 < timeout_seconds <= 2
        calls.append("health")
        response = next(responses)
        if isinstance(response, Exception):
            raise response
        return response

    def sign_in(**kwargs: object) -> tuple[int, dict[str, object]]:
        assert kwargs["method"] == "POST"
        calls.append("sign_in")
        return 200, {
            "user": {"id": boundary.LOCAL_USERS["owner-a@simula.local"]},
            "access_token": "synthetic-test-token",
        }

    monkeypatch.setattr(boundary, "probe_health", health)
    monkeypatch.setattr(boundary, "_request_json", sign_in)

    assert (
        boundary._sign_in(
            boundary.LocalSupabase(boundary.EXPECTED_API_URL, "test-key"), "owner-a@simula.local"
        )
        == "synthetic-test-token"
    )
    assert calls == ["health", "health", "health", "health", "sign_in"]
    assert clock[0] == 3


@pytest.mark.parametrize("status", [502, 503, 504])
def test_auth_readiness_timeout_fails_closed(
    monkeypatch: pytest.MonkeyPatch, clock: list[float], status: int
) -> None:
    monkeypatch.setattr(boundary, "probe_health", lambda *args, **kwargs: status)
    with pytest.raises(pytest.fail.Exception, match=f"within 60 seconds: HTTP {status}"):
        boundary._wait_for_auth_ready()
    assert clock[0] == 60


def test_auth_readiness_configuration_error_is_not_retried(
    monkeypatch: pytest.MonkeyPatch, clock: list[float]
) -> None:
    monkeypatch.setattr(boundary, "probe_health", lambda *args, **kwargs: 401)
    with pytest.raises(pytest.fail.Exception, match="readiness failed: HTTP 401"):
        boundary._wait_for_auth_ready()
    assert clock[0] == 0


@pytest.mark.parametrize("status", [400, 401, 502])
def test_auth_login_failure_is_not_retried(
    monkeypatch: pytest.MonkeyPatch, clock: list[float], status: int
) -> None:
    calls = []
    monkeypatch.setattr(boundary, "probe_health", lambda *args, **kwargs: 200)

    def sign_in(**kwargs: object) -> tuple[int, dict[str, object]]:
        calls.append(kwargs)
        return status, {}

    monkeypatch.setattr(boundary, "_request_json", sign_in)
    with pytest.raises(AssertionError, match=f"sign-in returned HTTP {status}"):
        boundary._sign_in(
            boundary.LocalSupabase(boundary.EXPECTED_API_URL, "test-key"), "owner-a@simula.local"
        )
    assert len(calls) == 1
    assert clock[0] == 0
