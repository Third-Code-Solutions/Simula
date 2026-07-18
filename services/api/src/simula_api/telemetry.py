"""Bounded, payload-free API metrics and W3C trace context."""

from __future__ import annotations

import re
import secrets
from dataclasses import dataclass

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, generate_latest

TRACEPARENT_HEADER = "traceparent"
_TRACEPARENT_PATTERN = re.compile(
    r"^00-(?P<trace_id>[0-9a-f]{32})-(?P<parent_id>[0-9a-f]{16})-(?P<flags>0[01])$"
)
_HTTP_METHODS = frozenset({"DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"})
_DEPENDENCIES = frozenset({"auth", "database", "queue", "rate_limit", "run_admission"})


@dataclass(frozen=True, slots=True)
class TraceContext:
    trace_id: str
    span_id: str
    flags: str

    @classmethod
    def from_header(cls, value: str | None) -> TraceContext:
        match = _TRACEPARENT_PATTERN.fullmatch(value) if value is not None else None
        if match is not None:
            trace_id = match.group("trace_id")
            parent_id = match.group("parent_id")
            if trace_id != "0" * 32 and parent_id != "0" * 16:
                return cls(
                    trace_id=trace_id,
                    span_id=_nonzero_hex(8),
                    flags=match.group("flags"),
                )
        return cls(trace_id=_nonzero_hex(16), span_id=_nonzero_hex(8), flags="00")

    @property
    def header_value(self) -> str:
        return f"00-{self.trace_id}-{self.span_id}-{self.flags}"


class ApiTelemetry:
    """Per-process RED metrics with fixed, low-cardinality labels."""

    def __init__(self) -> None:
        self.registry = CollectorRegistry(auto_describe=True)
        self._requests = Counter(
            "simula_api_http_requests_total",
            "Completed API HTTP requests.",
            ("method", "route", "status_class"),
            registry=self.registry,
        )
        self._duration = Histogram(
            "simula_api_http_request_duration_seconds",
            "API HTTP request duration by bounded route template.",
            ("method", "route", "status_class"),
            buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
            registry=self.registry,
        )
        self._dependency_ready = Gauge(
            "simula_api_dependency_ready",
            "Whether a required API dependency passed its bounded live probe.",
            ("dependency",),
            registry=self.registry,
        )
        for dependency in sorted(_DEPENDENCIES):
            self._dependency_ready.labels(dependency=dependency).set(0)

    def observe_http(
        self, *, method: str, route: str, status: int, duration_seconds: float
    ) -> None:
        labels = {
            "method": method if method in _HTTP_METHODS else "OTHER",
            "route": route,
            "status_class": _status_class(status),
        }
        self._requests.labels(**labels).inc()
        self._duration.labels(**labels).observe(max(0.0, duration_seconds))

    def set_dependency_ready(self, dependency: str, ready: bool) -> None:
        if dependency not in _DEPENDENCIES:
            raise ValueError("dependency metric label is not allowlisted")
        self._dependency_ready.labels(dependency=dependency).set(1 if ready else 0)

    def render(self) -> bytes:
        return generate_latest(self.registry)


def _nonzero_hex(byte_count: int) -> str:
    while True:
        value = secrets.token_hex(byte_count)
        if set(value) != {"0"}:
            return value


def _status_class(status: int) -> str:
    return f"{status // 100}xx" if 100 <= status <= 599 else "other"
