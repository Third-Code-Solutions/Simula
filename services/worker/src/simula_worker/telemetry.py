"""Bounded worker metrics and loopback-only Prometheus endpoint."""

from __future__ import annotations

import asyncio
from time import perf_counter

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, generate_latest

_DEPENDENCIES = frozenset({"database", "queue"})
_DISPATCH_OUTCOMES = frozenset(
    {
        "ambiguous",
        "canceled",
        "claimed",
        "confirmation_rejected",
        "confirmed",
        "failed",
        "failure_record_failed",
        "failure_record_rejected",
        "poisoned",
        "recovered",
        "unproven",
    }
)
_JOB_OUTCOMES = frozenset(
    {
        "binding_rejected",
        "claim_rejected",
        "completed",
        "completion_rejected",
        "failed",
        "lease_rejected",
        "retrying",
    }
)
_PROVIDER_OUTCOMES = frozenset({"completed", "failed", "retryable_failure"})
_RUN_CONTROL_ALERT_REASONS = frozenset(
    {
        "oldest_undispatched_critical",
        "operator_manual",
        "poison_outbox",
        "redis_memory_critical",
    }
)
_MAX_REQUEST_BYTES = 16 * 1024
_PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8"


class WorkerTelemetry:
    """Per-process worker measurements with fixed, low-cardinality labels."""

    def __init__(self) -> None:
        self.registry = CollectorRegistry(auto_describe=True)
        self._jobs = Counter(
            "simula_worker_jobs_total",
            "Worker jobs by terminal processing outcome.",
            ("outcome",),
            registry=self.registry,
        )
        self._job_duration = Histogram(
            "simula_worker_job_duration_seconds",
            "Worker job processing duration by bounded outcome.",
            ("outcome",),
            buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0),
            registry=self.registry,
        )
        self._dispatches = Counter(
            "simula_worker_dispatch_total",
            "Durable dispatch activity by bounded outcome.",
            ("outcome",),
            registry=self.registry,
        )
        self._provider_calls = Counter(
            "simula_worker_deterministic_provider_calls_total",
            "Phase 2 deterministic provider calls by bounded outcome.",
            ("outcome",),
            registry=self.registry,
        )
        self._external_provider_calls = Counter(
            "simula_worker_external_provider_calls_total",
            "External provider calls, which must remain zero in Phase 2.",
            registry=self.registry,
        )
        self._dependency_ready = Gauge(
            "simula_worker_dependency_ready",
            "Whether a required worker dependency passed its bounded live probe.",
            ("dependency",),
            registry=self.registry,
        )
        self._queue_depth = Gauge(
            "simula_worker_queue_depth",
            "Current jobs in the fixed Phase 2 ARQ queue.",
            registry=self.registry,
        )
        self._queue_oldest_ready_age = Gauge(
            "simula_worker_queue_oldest_ready_age_seconds",
            "Age of the oldest ready queue job, or zero when none is ready.",
            registry=self.registry,
        )
        self._queue_memory_percent = Gauge(
            "simula_worker_queue_memory_percent",
            "Redis memory use as a bounded percentage of configured maxmemory.",
            registry=self.registry,
        )
        self._run_creation_enabled = Gauge(
            "simula_worker_run_creation_enabled",
            "Whether durable run admission is enabled.",
            registry=self.registry,
        )
        self._run_control_alert = Gauge(
            "simula_worker_run_control_alert_active",
            "Active durable run-control alert by bounded reason.",
            ("reason",),
            registry=self.registry,
        )
        for dependency in sorted(_DEPENDENCIES):
            self._dependency_ready.labels(dependency=dependency).set(0)
        self._external_provider_calls.inc(0)
        self._run_creation_enabled.set(1)
        for reason in sorted(_RUN_CONTROL_ALERT_REASONS):
            self._run_control_alert.labels(reason=reason).set(0)

    def observe_job(self, outcome: str, *, duration_seconds: float) -> None:
        _require_label(outcome, _JOB_OUTCOMES, name="job outcome")
        self._jobs.labels(outcome=outcome).inc()
        self._job_duration.labels(outcome=outcome).observe(max(0.0, duration_seconds))

    def observe_dispatch(self, outcome: str, *, count: int = 1) -> None:
        _require_label(outcome, _DISPATCH_OUTCOMES, name="dispatch outcome")
        if isinstance(count, bool) or count < 0:
            raise ValueError("dispatch count must be a non-negative integer")
        self._dispatches.labels(outcome=outcome).inc(count)

    def observe_provider(self, outcome: str) -> None:
        _require_label(outcome, _PROVIDER_OUTCOMES, name="provider outcome")
        self._provider_calls.labels(outcome=outcome).inc()

    def observe_external_provider_call(self) -> None:
        self._external_provider_calls.inc()

    def set_dependency_ready(self, dependency: str, ready: bool) -> None:
        _require_label(dependency, _DEPENDENCIES, name="dependency")
        self._dependency_ready.labels(dependency=dependency).set(1 if ready else 0)

    def set_queue_snapshot(
        self, *, depth: int, oldest_ready_age_seconds: float, memory_percent: float
    ) -> None:
        if isinstance(depth, bool) or depth < 0:
            raise ValueError("queue depth must be a non-negative integer")
        if oldest_ready_age_seconds < 0:
            raise ValueError("oldest ready age must be non-negative")
        if memory_percent < 0 or memory_percent > 100:
            raise ValueError("queue memory percent must be from zero through 100")
        self._queue_depth.set(depth)
        self._queue_oldest_ready_age.set(oldest_ready_age_seconds)
        self._queue_memory_percent.set(memory_percent)

    def set_run_creation_control(self, *, enabled: bool, alert_reason: str | None) -> None:
        if enabled and alert_reason is not None:
            raise ValueError("enabled run creation cannot have an active alert")
        if not enabled:
            if alert_reason is None:
                raise ValueError("disabled run creation requires an alert reason")
            _require_label(alert_reason, _RUN_CONTROL_ALERT_REASONS, name="run control alert")
        self._run_creation_enabled.set(1 if enabled else 0)
        for reason in sorted(_RUN_CONTROL_ALERT_REASONS):
            self._run_control_alert.labels(reason=reason).set(
                1 if not enabled and reason == alert_reason else 0
            )

    def render(self) -> bytes:
        return generate_latest(self.registry)


class WorkerMetricsServer:
    """Minimal loopback-only endpoint; never exposed on a container interface."""

    def __init__(self, telemetry: WorkerTelemetry, *, port: int) -> None:
        if isinstance(port, bool) or port not in range(0, 65_536):
            raise ValueError("metrics port must be an integer from 0 through 65535")
        self._telemetry = telemetry
        self._requested_port = port
        self._server: asyncio.Server | None = None

    @property
    def port(self) -> int:
        if self._server is None or not self._server.sockets:
            return self._requested_port
        return int(self._server.sockets[0].getsockname()[1])

    async def start(self) -> None:
        if self._server is not None:
            raise RuntimeError("worker metrics server is already started")
        self._server = await asyncio.start_server(
            self._handle,
            host="127.0.0.1",
            port=self._requested_port,
            limit=_MAX_REQUEST_BYTES,
        )

    async def close(self) -> None:
        if self._server is None:
            return
        self._server.close()
        await self._server.wait_closed()
        self._server = None

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        status = "404 Not Found"
        content_type = "text/plain; charset=utf-8"
        body = b""
        try:
            async with asyncio.timeout(1.0):
                request = await reader.readuntil(b"\r\n\r\n")
            if len(request) <= _MAX_REQUEST_BYTES:
                lines = request.decode("ascii", errors="strict").split("\r\n")
                has_origin = any(line.lower().startswith("origin:") for line in lines[1:])
                if lines[0] == "GET /internal/metrics HTTP/1.1" and not has_origin:
                    status = "200 OK"
                    content_type = _PROMETHEUS_CONTENT_TYPE
                    body = self._telemetry.render()
        except TimeoutError, UnicodeDecodeError, asyncio.IncompleteReadError, ValueError:
            pass
        response = (
            f"HTTP/1.1 {status}\r\n"
            f"Content-Type: {content_type}\r\n"
            f"Content-Length: {len(body)}\r\n"
            "Connection: close\r\n\r\n"
        ).encode("ascii") + body
        writer.write(response)
        await writer.drain()
        writer.close()
        await writer.wait_closed()


class JobObservation:
    """Tiny outcome recorder that guarantees one measurement per worker job."""

    def __init__(self, telemetry: WorkerTelemetry | None) -> None:
        self._telemetry = telemetry
        self._started_at = perf_counter()
        self.outcome = "binding_rejected"

    def finish(self) -> None:
        if self._telemetry is not None:
            self._telemetry.observe_job(
                self.outcome,
                duration_seconds=perf_counter() - self._started_at,
            )


def _require_label(value: str, allowed: frozenset[str], *, name: str) -> None:
    if value not in allowed:
        raise ValueError(f"{name} is not allowlisted")
