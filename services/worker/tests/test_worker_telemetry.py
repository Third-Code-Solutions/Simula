from __future__ import annotations

import asyncio
from time import time

import pytest
from simula_worker.database import RunCreationControl
from simula_worker.main import (
    _queue_memory_percent,
    _refresh_dependency_readiness,
    _refresh_run_creation_control,
)
from simula_worker.telemetry import WorkerMetricsServer, WorkerTelemetry
from structlog.testing import capture_logs


def test_worker_metrics_have_bounded_labels_and_explicit_zero_external_calls() -> None:
    telemetry = WorkerTelemetry()
    telemetry.observe_job("completed", duration_seconds=0.25)
    telemetry.observe_dispatch("confirmed", count=2)
    telemetry.observe_provider("completed")
    telemetry.set_dependency_ready("database", True)
    telemetry.set_queue_snapshot(
        depth=3,
        oldest_ready_age_seconds=1.5,
        memory_percent=50.0,
    )
    telemetry.set_run_creation_control(enabled=False, alert_reason="poison_outbox")

    rendered = telemetry.render().decode()

    assert 'simula_worker_jobs_total{outcome="completed"} 1.0' in rendered
    assert 'simula_worker_dispatch_total{outcome="confirmed"} 2.0' in rendered
    assert 'simula_worker_dependency_ready{dependency="database"} 1.0' in rendered
    assert "simula_worker_external_provider_calls_total 0.0" in rendered
    assert "simula_worker_queue_depth 3.0" in rendered
    assert "simula_worker_queue_oldest_ready_age_seconds 1.5" in rendered
    assert "simula_worker_queue_memory_percent 50.0" in rendered
    assert "simula_worker_run_creation_enabled 0.0" in rendered
    assert 'simula_worker_run_control_alert_active{reason="poison_outbox"} 1.0' in rendered
    assert "run_id" not in rendered
    with pytest.raises(ValueError, match="not allowlisted"):
        telemetry.observe_job("sensitive-unbounded-status", duration_seconds=0)


async def _request(port: int, request: bytes) -> bytes:
    reader, writer = await asyncio.open_connection("127.0.0.1", port)
    writer.write(request)
    await writer.drain()
    response = await reader.read()
    writer.close()
    await writer.wait_closed()
    return response


async def test_worker_metrics_endpoint_is_loopback_and_rejects_browser_origin() -> None:
    server = WorkerMetricsServer(WorkerTelemetry(), port=0)
    await server.start()
    try:
        allowed = await _request(
            server.port,
            b"GET /internal/metrics HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
        )
        browser = await _request(
            server.port,
            b"GET /internal/metrics HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: https://evil.invalid\r\n\r\n",
        )
    finally:
        await server.close()

    assert allowed.startswith(b"HTTP/1.1 200 OK")
    assert b"simula_worker_external_provider_calls_total 0.0" in allowed
    assert browser.startswith(b"HTTP/1.1 404 Not Found")
    assert b"simula_worker_" not in browser


class _ReadyDatabase:
    async def ready(self) -> bool:
        return True


class _ReadyQueue:
    async def ping(self) -> bool:
        return True

    async def zcard(self, _name: str) -> int:
        return 2

    async def zrange(
        self, _name: str, _start: int, _end: int, *, withscores: bool
    ) -> list[tuple[bytes, float]]:
        assert withscores
        return [(b"job", (time() - 2) * 1000)]

    async def info(self, section: str) -> dict[str, int]:
        assert section == "memory"
        return {"used_memory": 64, "maxmemory": 128}


async def test_worker_dependency_probe_refreshes_queue_readiness_and_age() -> None:
    telemetry = WorkerTelemetry()

    memory_percent = await _refresh_dependency_readiness(_ReadyDatabase(), _ReadyQueue(), telemetry)

    rendered = telemetry.render().decode()
    assert 'simula_worker_dependency_ready{dependency="database"} 1.0' in rendered
    assert 'simula_worker_dependency_ready{dependency="queue"} 1.0' in rendered
    assert "simula_worker_queue_depth 2.0" in rendered
    assert "simula_worker_queue_memory_percent 50.0" in rendered
    assert memory_percent == 50.0


def test_worker_queue_memory_snapshot_is_bounded() -> None:
    assert _queue_memory_percent({"used_memory": 200, "maxmemory": 100}) == 100.0
    assert _queue_memory_percent({"used_memory": 200, "maxmemory": 0}) == 0.0
    with pytest.raises(ValueError, match="malformed"):
        _queue_memory_percent("sensitive-unbounded-memory-response")


class _CriticalControlDatabase:
    async def evaluate_run_creation_control(
        self, redis_memory_percent: float, poisoned_count: int
    ) -> RunCreationControl:
        assert redis_memory_percent == 91.0
        assert poisoned_count == 0
        return RunCreationControl(
            enabled=False,
            alert_reason="redis_memory_critical",
            changed=True,
        )


async def test_worker_emits_bounded_alert_when_run_creation_latches_closed() -> None:
    telemetry = WorkerTelemetry()

    with capture_logs() as logs:
        await _refresh_run_creation_control(
            _CriticalControlDatabase(),
            telemetry,
            redis_memory_percent=91.0,
            poisoned_count=0,
        )

    assert logs == [
        {
            "event": "run_creation_disabled",
            "log_level": "warning",
            "reason": "redis_memory_critical",
        }
    ]
    rendered = telemetry.render().decode()
    assert "simula_worker_run_creation_enabled 0.0" in rendered
    assert 'simula_worker_run_control_alert_active{reason="redis_memory_critical"} 1.0' in rendered
