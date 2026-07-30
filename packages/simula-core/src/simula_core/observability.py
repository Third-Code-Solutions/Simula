"""Optional, privacy-bounded Sentry error capture and OpenTelemetry tracing."""

from __future__ import annotations

import os
from collections.abc import Mapping, Sequence
from contextlib import AbstractContextManager, nullcontext
from dataclasses import dataclass
from threading import Lock
from typing import Literal, Self, cast
from urllib.parse import urlsplit

import sentry_sdk
from fastapi import FastAPI
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import Event, ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter, SpanExportResult
from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased
from opentelemetry.trace import (
    INVALID_SPAN_CONTEXT,
    Link,
    NonRecordingSpan,
    Span,
    Status,
)
from sentry_sdk.types import Event as SentryEvent
from sentry_sdk.types import Hint as SentryHint

ObservabilityService = Literal["api", "ai-engine", "worker"]
_ENVIRONMENTS = frozenset({"local", "test", "preview", "staging", "production"})
_SAFE_SPAN_ATTRIBUTES = frozenset(
    {
        "db.operation.name",
        "db.system",
        "error.type",
        "http.request.method",
        "http.response.status_code",
        "http.route",
        "messaging.operation.type",
        "messaging.system",
        "network.protocol.version",
        "rpc.method",
        "rpc.system",
        "server.port",
        "simula.job.outcome",
    }
)


class ObservabilityConfigurationError(ValueError):
    """Telemetry was enabled without a safe, complete exporter configuration."""


def _enabled(value: str | None) -> bool:
    normalized = (value or "false").strip().lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise ObservabilityConfigurationError("SIMULA_TELEMETRY_ENABLED must be true or false")


def _sample_rate(value: str | None) -> float:
    normalized = (value or "0.1").strip()
    try:
        sample_rate = float(normalized)
    except ValueError as error:
        raise ObservabilityConfigurationError(
            "SIMULA_TELEMETRY_TRACES_SAMPLE_RATE must be a number from 0 through 1"
        ) from error
    if not 0 <= sample_rate <= 1:
        raise ObservabilityConfigurationError(
            "SIMULA_TELEMETRY_TRACES_SAMPLE_RATE must be a number from 0 through 1"
        )
    return sample_rate


def _exporter_url(
    name: str,
    value: str | None,
    *,
    environment: str,
    path_suffix: str | None = None,
) -> str:
    normalized = (value or "").strip()
    parsed = urlsplit(normalized)
    if not normalized or not parsed.scheme or not parsed.hostname:
        raise ObservabilityConfigurationError(f"{name} must be an absolute URL")
    local_http = (
        environment == "local"
        and parsed.scheme == "http"
        and parsed.hostname in {"127.0.0.1", "localhost"}
    )
    if parsed.scheme != "https" and not local_http:
        raise ObservabilityConfigurationError(
            f"{name} must use HTTPS outside a loopback-only local environment"
        )
    if parsed.query or parsed.fragment:
        raise ObservabilityConfigurationError(
            f"{name} must not contain query parameters or a fragment"
        )
    if path_suffix is not None and not parsed.path.endswith(path_suffix):
        raise ObservabilityConfigurationError(f"{name} must end with {path_suffix}")
    return normalized


@dataclass(frozen=True, slots=True)
class ObservabilitySettings:
    enabled: bool
    environment: str
    release_sha: str
    service: ObservabilityService
    traces_sample_rate: float
    sentry_dsn: str | None = None
    otlp_traces_endpoint: str | None = None

    @classmethod
    def from_environment(
        cls,
        service: ObservabilityService,
        environment: Mapping[str, str] | None = None,
    ) -> Self:
        source = os.environ if environment is None else environment
        enabled = _enabled(source.get("SIMULA_TELEMETRY_ENABLED"))
        runtime_environment = source.get("SIMULA_ENVIRONMENT", "local").strip()
        release_sha = source.get("SIMULA_RELEASE_SHA", "0" * 40).strip()
        traces_sample_rate = _sample_rate(source.get("SIMULA_TELEMETRY_TRACES_SAMPLE_RATE"))
        if not enabled:
            return cls(
                enabled=False,
                environment=runtime_environment,
                release_sha=release_sha,
                service=service,
                traces_sample_rate=traces_sample_rate,
            )
        if runtime_environment not in _ENVIRONMENTS:
            raise ObservabilityConfigurationError("SIMULA_ENVIRONMENT is unsupported")
        valid_release = len(release_sha) == 40 and all(
            character in "0123456789abcdef" for character in release_sha
        )
        if not valid_release:
            raise ObservabilityConfigurationError(
                "SIMULA_RELEASE_SHA must be an exact lowercase 40-character git SHA"
            )
        return cls(
            enabled=True,
            environment=runtime_environment,
            release_sha=release_sha,
            service=service,
            sentry_dsn=_exporter_url(
                "SIMULA_SENTRY_DSN",
                source.get("SIMULA_SENTRY_DSN"),
                environment=runtime_environment,
            ),
            otlp_traces_endpoint=_exporter_url(
                "SIMULA_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
                source.get("SIMULA_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"),
                environment=runtime_environment,
                path_suffix="/v1/traces",
            ),
            traces_sample_rate=traces_sample_rate,
        )


def sanitize_sentry_event(
    event: SentryEvent,
    _hint: SentryHint,
    *,
    environment: str,
    service: ObservabilityService,
) -> SentryEvent:
    event.pop("breadcrumbs", None)
    event.pop("contexts", None)
    event.pop("extra", None)
    event.pop("message", None)
    event.pop("request", None)
    event.pop("transaction", None)
    event.pop("user", None)
    event["tags"] = {"environment": environment, "service": service}
    exception = event.get("exception")
    if isinstance(exception, dict):
        values = exception.get("values")
        if isinstance(values, list):
            for value in values:
                if isinstance(value, dict):
                    value["value"] = value.get("type") or "RedactedException"
    return event


def _safe_span_name(span: ReadableSpan) -> str:
    instrumentation = (
        span.instrumentation_scope.name if span.instrumentation_scope is not None else "unknown"
    )
    if any(name in instrumentation for name in ("http", "asgi", "fastapi")):
        return "http.request"
    if "psycopg" in instrumentation:
        return "database.query"
    if "redis" in instrumentation:
        return "redis.operation"
    if "bullmq" in instrumentation or "arq" in instrumentation:
        return "queue.operation"
    return "internal.operation"


def sanitize_span(span: ReadableSpan) -> ReadableSpan:
    attributes = {
        name: value
        for name, value in (span.attributes or {}).items()
        if name in _SAFE_SPAN_ATTRIBUTES
    }
    events = tuple(
        Event(
            event.name,
            attributes=(
                {"exception.type": event.attributes["exception.type"]}
                if event.name == "exception"
                and event.attributes is not None
                and isinstance(event.attributes.get("exception.type"), str)
                else {}
            ),
            timestamp=event.timestamp,
        )
        for event in span.events
    )
    links = tuple(Link(link.context, attributes={}) for link in span.links)
    return ReadableSpan(
        name=_safe_span_name(span),
        context=span.context,
        parent=span.parent,
        resource=span.resource,
        attributes=attributes,
        events=events,
        links=links,
        kind=span.kind,
        status=Status(span.status.status_code),
        start_time=span.start_time,
        end_time=span.end_time,
        instrumentation_scope=span.instrumentation_scope,
    )


class RedactingSpanExporter(SpanExporter):
    def __init__(self, delegate: SpanExporter) -> None:
        self._delegate = delegate

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        return self._delegate.export(tuple(sanitize_span(span) for span in spans))

    def force_flush(self, timeout_millis: int = 30_000) -> bool:
        return self._delegate.force_flush(timeout_millis)

    def shutdown(self) -> None:
        self._delegate.shutdown()


class ObservabilityRuntime:
    def __init__(
        self,
        settings: ObservabilitySettings,
        *,
        initialize_sentry: bool = True,
        span_exporter: SpanExporter | None = None,
    ) -> None:
        self.settings = settings
        self._provider: TracerProvider | None = None
        self._httpx_instrumented = False
        self._sentry_initialized = False
        if not settings.enabled:
            return
        if initialize_sentry:
            sentry_sdk.init(
                before_send=lambda event, hint: sanitize_sentry_event(
                    event,
                    hint,
                    environment=settings.environment,
                    service=settings.service,
                ),
                dsn=settings.sentry_dsn,
                environment=settings.environment,
                include_local_variables=False,
                max_request_body_size="never",
                release=settings.release_sha,
                send_default_pii=False,
                traces_sample_rate=0,
            )
            self._sentry_initialized = True
        exporter = span_exporter or OTLPSpanExporter(endpoint=settings.otlp_traces_endpoint)
        provider = TracerProvider(
            resource=Resource.create(
                {
                    "deployment.environment.name": settings.environment,
                    "service.name": f"simula-{settings.service}",
                    "service.version": settings.release_sha,
                }
            ),
            sampler=ParentBased(TraceIdRatioBased(settings.traces_sample_rate)),
        )
        provider.add_span_processor(BatchSpanProcessor(RedactingSpanExporter(exporter)))
        self._provider = provider
        HTTPXClientInstrumentor().instrument(tracer_provider=provider)
        self._httpx_instrumented = True

    def instrument_fastapi(self, app: FastAPI) -> None:
        if self._provider is not None:
            FastAPIInstrumentor.instrument_app(
                app,
                excluded_urls="health/live,health/ready,metrics",
                tracer_provider=self._provider,
            )

    def span(
        self,
        name: Literal[
            "behavioral.execute",
            "methodology.compare",
            "methodology.preview",
            "report.export",
            "visual.profile",
            "worker.job",
        ],
    ) -> AbstractContextManager[Span]:
        if self._provider is None:
            return cast(
                AbstractContextManager[Span],
                nullcontext(NonRecordingSpan(INVALID_SPAN_CONTEXT)),
            )
        tracer = self._provider.get_tracer("simula.runtime")
        return tracer.start_as_current_span(name)

    def capture_exception(self, error: BaseException) -> None:
        if self._sentry_initialized:
            sentry_sdk.capture_exception(error)

    def shutdown(self) -> None:
        if self._httpx_instrumented:
            HTTPXClientInstrumentor().uninstrument()
            self._httpx_instrumented = False
        if self._provider is not None:
            self._provider.force_flush(timeout_millis=2_000)
            self._provider.shutdown()
            self._provider = None
        if self._sentry_initialized:
            sentry_sdk.flush(timeout=2)


_RUNTIMES: dict[ObservabilityService, ObservabilityRuntime] = {}
_RUNTIME_LOCK = Lock()


def initialize_observability(service: ObservabilityService) -> ObservabilityRuntime:
    with _RUNTIME_LOCK:
        runtime = _RUNTIMES.get(service)
        if runtime is None:
            runtime = ObservabilityRuntime(ObservabilitySettings.from_environment(service))
            _RUNTIMES[service] = runtime
        return runtime


def get_observability_runtime(service: ObservabilityService) -> ObservabilityRuntime:
    return initialize_observability(service)
