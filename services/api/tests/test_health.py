import json
from uuid import UUID

import pytest
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient
from simula_api.app import CORRELATION_HEADER, create_app
from simula_api.routes import router
from structlog.testing import capture_logs


def test_runtime_route_inventory_matches_the_m3_boundary() -> None:
    app = create_app()

    assert {route.path for route in router.routes if isinstance(route, APIRoute)} == {
        "/api/v1/me",
        "/api/v1/organizations",
        "/api/v1/organizations/{organization_id}/projects",
        "/api/v1/projects/{project_id}",
        "/api/v1/projects/{project_id}/stimuli",
        "/api/v1/projects/{project_id}/runs",
        "/api/v1/runs/{run_id}",
        "/api/v1/runs/{run_id}/provenance",
        "/api/v1/runs/{run_id}/result",
        "/api/v1/stimuli/{stimulus_id}/versions",
    }
    assert {route.path for route in app.routes[1:] if isinstance(route, APIRoute)} == {
        "/health/live",
        "/health/ready",
    }


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
async def test_documentation_routes_are_not_exposed(path: str) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        response = await client.get(path)

    assert response.status_code == 404


async def test_health_returns_safe_runtime_metadata() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        response = await client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {
        "environment": "local",
        "release_sha": "dev",
        "service": "api",
        "status": "ok",
    }
    UUID(response.headers[CORRELATION_HEADER])


async def test_valid_correlation_id_is_propagated(monkeypatch: pytest.MonkeyPatch) -> None:
    correlation_id = "018f0bf1-0b2a-7c91-9d8a-d1bd92d5a4f4"
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "test")
    monkeypatch.setenv("SIMULA_RELEASE_SHA", "a" * 40)
    monkeypatch.setenv("SIMULA_LOG_LEVEL", "INFO")
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        response = await client.get("/health/ready", headers={CORRELATION_HEADER: correlation_id})

    assert response.status_code == 503
    assert response.headers[CORRELATION_HEADER] == correlation_id


async def test_non_v4_or_v7_correlation_id_is_replaced(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    uuid_v1 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "test")
    monkeypatch.setenv("SIMULA_RELEASE_SHA", "a" * 40)
    monkeypatch.setenv("SIMULA_LOG_LEVEL", "INFO")
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        response = await client.get("/health/ready", headers={CORRELATION_HEADER: uuid_v1})

    replacement = UUID(response.headers[CORRELATION_HEADER])
    assert replacement.version == 4
    assert str(replacement) != uuid_v1


async def test_readiness_fails_closed_on_missing_production_release(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "production")
    monkeypatch.delenv("SIMULA_RELEASE_SHA", raising=False)
    monkeypatch.setenv("SIMULA_LOG_LEVEL", "INFO")

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "environment": "production",
        "release_sha": "dev",
        "service": "api",
        "status": "not_ready",
    }


@pytest.mark.parametrize(
    ("environment", "release_sha", "log_level"),
    [
        ("unknown", "a" * 40, "INFO"),
        ("production", "dev", "INFO"),
        ("production", "a" * 40, "VERBOSE"),
    ],
)
async def test_readiness_rejects_unsafe_runtime_configuration(
    monkeypatch: pytest.MonkeyPatch,
    environment: str,
    release_sha: str,
    log_level: str,
) -> None:
    monkeypatch.setenv("SIMULA_ENVIRONMENT", environment)
    monkeypatch.setenv("SIMULA_RELEASE_SHA", release_sha)
    monkeypatch.setenv("SIMULA_LOG_LEVEL", log_level)

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"


async def test_unhandled_error_is_safe_correlated_and_structured() -> None:
    app = create_app()

    @app.get("/test-only/failure")
    async def fail_safely() -> None:
        raise RuntimeError("sensitive-error-message-canary")

    with capture_logs() as logs:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                "/test-only/failure?confidential=query-canary",
                headers={"authorization": "Bearer header-canary"},
            )

    correlation_id = response.headers[CORRELATION_HEADER]
    assert response.status_code == 500
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json() == {
        "code": "internal_error",
        "correlation_id": correlation_id,
        "detail": "The request could not be completed. Use the correlation ID for support.",
        "instance": "",
        "status": 500,
        "title": "Internal server error",
        "type": "https://simula.invalid/problems/internal-error",
    }
    failed = next(log for log in logs if log["event"] == "http_request_failed")
    completed = next(log for log in logs if log["event"] == "http_request_completed")
    assert failed["error_class"] == "RuntimeError"
    assert failed["route_template"] == "/test-only/failure"
    assert completed["status"] == 500
    assert failed["correlation_id"] == completed["correlation_id"] == correlation_id
    rendered_logs = json.dumps(logs)
    assert "sensitive-error-message-canary" not in rendered_logs
    assert "query-canary" not in rendered_logs
    assert "header-canary" not in rendered_logs


async def test_untrusted_release_sha_is_not_reflected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SIMULA_RELEASE_SHA", "bad\nvalue")
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        response = await client.get("/health/live")

    assert response.json()["release_sha"] == "invalid"
