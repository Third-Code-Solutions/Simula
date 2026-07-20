from __future__ import annotations

import asyncio
import json

import pytest
from httpx import ASGITransport, AsyncClient
from simula_api.app import CORRELATION_HEADER, RequestDeadlineMiddleware, create_app
from simula_api.telemetry import ApiTelemetry
from simula_core.trace_context import TRACEPARENT_HEADER, TraceContext
from starlette.types import Receive, Scope, Send
from structlog.testing import capture_logs


def test_trace_context_accepts_only_canonical_nonzero_w3c_parent() -> None:
    inbound = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"

    trace = TraceContext.from_header(inbound)

    assert trace.trace_id == "4bf92f3577b34da6a3ce929d0e0e4736"
    assert trace.span_id != "00f067aa0ba902b7"
    assert trace.flags == "01"
    assert trace.header_value.startswith("00-4bf92f3577b34da6a3ce929d0e0e4736-")

    for rejected in (
        None,
        "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01",
        "00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-03",
        "sensitive-trace-canary",
    ):
        replacement = TraceContext.from_header(rejected)
        assert replacement.trace_id != "0" * 32
        assert replacement.span_id != "0" * 16
        assert replacement.flags == "00"


async def test_http_trace_logs_and_metrics_are_bounded_and_payload_free(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "test")
    app = create_app()
    inbound = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"

    with capture_logs() as logs:
        async with AsyncClient(
            transport=ASGITransport(app=app, client=("127.0.0.1", 123)),
            base_url="http://test",
        ) as client:
            response = await client.get(
                "/health/live?confidential=metrics-query-canary",
                headers={
                    CORRELATION_HEADER: "018f0bf1-0b2a-7c91-9d8a-d1bd92d5a4f4",
                    TRACEPARENT_HEADER: inbound,
                },
            )
            metrics = await client.get("/internal/metrics")

    assert response.status_code == 200
    assert response.headers[TRACEPARENT_HEADER].startswith("00-4bf92f3577b34da6a3ce929d0e0e4736-")
    completed = next(
        entry
        for entry in logs
        if entry["event"] == "http_request_completed" and entry["route_template"] == "/health/live"
    )
    assert completed["trace_id"] == "4bf92f3577b34da6a3ce929d0e0e4736"
    assert completed["span_id"] in response.headers[TRACEPARENT_HEADER]
    assert set(completed) <= {
        "correlation_id",
        "duration_ms",
        "environment",
        "event",
        "log_level",
        "method",
        "release_sha",
        "route_template",
        "service",
        "span_id",
        "status",
        "trace_id",
    }
    assert metrics.status_code == 200
    assert metrics.headers["content-type"] == "text/plain; version=0.0.4; charset=utf-8"
    assert (
        'simula_api_http_requests_total{method="GET",route="/health/live",status_class="2xx"} 1.0'
        in metrics.text
    )
    rendered = json.dumps(logs) + metrics.text
    assert "metrics-query-canary" not in rendered
    assert "confidential" not in rendered


@pytest.mark.parametrize(
    ("environment", "peer"),
    [
        ("test", ("203.0.113.10", 443)),
        ("production", ("127.0.0.1", 123)),
    ],
)
async def test_metrics_are_not_exposed_outside_local_loopback(
    monkeypatch: pytest.MonkeyPatch,
    environment: str,
    peer: tuple[str, int],
) -> None:
    monkeypatch.setenv("SIMULA_ENVIRONMENT", environment)
    app = create_app()
    async with AsyncClient(
        transport=ASGITransport(app=app, client=peer),
        base_url="http://test",
    ) as client:
        response = await client.get("/internal/metrics")

    assert response.status_code == 404
    assert response.content == b""


async def test_metrics_reject_browser_origin_even_on_local_loopback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "test")
    app = create_app()
    async with AsyncClient(
        transport=ASGITransport(app=app, client=("127.0.0.1", 123)),
        base_url="http://test",
    ) as client:
        response = await client.get(
            "/internal/metrics", headers={"Origin": "http://127.0.0.1:3000"}
        )

    assert response.status_code == 404


def test_dependency_labels_fail_closed_to_the_allowlist() -> None:
    telemetry = ApiTelemetry()

    try:
        telemetry.set_dependency_ready("tenant-controlled", True)
    except ValueError as error:
        assert str(error) == "dependency metric label is not allowlisted"
    else:
        raise AssertionError("unknown dependency label was accepted")


def test_rejection_metrics_cover_required_policy_classes_and_reject_unknown_labels() -> None:
    telemetry = ApiTelemetry()
    for kind in ("authentication", "authorization", "rate", "quota"):
        telemetry.observe_rejection(kind)

    rendered = telemetry.render().decode()
    for kind in ("authentication", "authorization", "rate", "quota"):
        assert f'simula_api_rejections_total{{kind="{kind}"}} 1.0' in rendered
    with pytest.raises(ValueError, match="not allowlisted"):
        telemetry.observe_rejection("tenant-controlled")


def test_database_and_runtime_metrics_are_bounded_and_payload_free() -> None:
    telemetry = ApiTelemetry()
    telemetry.observe_database(
        "create_run",
        "success",
        duration_seconds=0.025,
        pool_size=10,
        pool_available=7,
    )
    telemetry.set_runtime_snapshot(
        migration_version=20260720063411,
        rls_force_enabled=True,
        state_counts={
            "queued": 2,
            "running": 1,
            "retrying": 0,
            "cancel_requested": 1,
            "succeeded": 3,
            "failed": 0,
            "canceled": 1,
        },
        stuck_lease_count=0,
        oldest_cancellation_age_seconds=4.5,
    )

    rendered = telemetry.render().decode()
    assert (
        'simula_api_database_queries_total{operation="create_run",outcome="success"} 1.0'
        in rendered
    )
    assert 'simula_api_database_pool_connections{state="in_use"} 3.0' in rendered
    assert 'simula_run_state_count{state="cancel_requested"} 1.0' in rendered
    assert "simula_run_oldest_cancellation_age_seconds 4.5" in rendered
    with pytest.raises(ValueError, match="not allowlisted"):
        telemetry.observe_database(
            "tenant-controlled",
            "success",
            duration_seconds=0,
            pool_size=1,
            pool_available=1,
        )


async def test_request_deadline_discards_partial_response_and_uses_run_create_budget() -> None:
    async def slow_partial_response(scope: Scope, receive: Receive, send: Send) -> None:
        del scope, receive
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await asyncio.sleep(0.05)
        await send({"type": "http.response.body", "body": b"late"})

    app = RequestDeadlineMiddleware(
        slow_partial_response,
        default_seconds=0.04,
        run_create_seconds=0.01,
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/projects/00000000-0000-4000-8000-000000000001/runs",
            json={},
        )

    assert response.status_code == 503
    assert response.headers["retry-after"] == "5"
    assert response.json()["code"] == "request_deadline_exceeded"
