from collections.abc import Sequence
from typing import cast

from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import Event, ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.sdk.util.instrumentation import InstrumentationScope
from opentelemetry.trace import Status, StatusCode
from pytest import raises
from sentry_sdk.types import Event as SentryEvent
from simula_core.observability import (
    ObservabilityConfigurationError,
    ObservabilityRuntime,
    ObservabilitySettings,
    sanitize_sentry_event,
    sanitize_span,
)


class RecordingExporter(SpanExporter):
    def __init__(self) -> None:
        self.spans: tuple[ReadableSpan, ...] = ()

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        self.spans += tuple(spans)
        return SpanExportResult.SUCCESS


def deployed_environment() -> dict[str, str]:
    return {
        "SIMULA_ENVIRONMENT": "staging",
        "SIMULA_RELEASE_SHA": "a" * 40,
        "SIMULA_SENTRY_DSN": "https://public@example.test/1",
        "SIMULA_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": ("https://collector.example.test/v1/traces"),
        "SIMULA_TELEMETRY_ENABLED": "true",
        "SIMULA_TELEMETRY_TRACES_SAMPLE_RATE": "0.25",
    }


def test_observability_is_inert_without_credentials() -> None:
    settings = ObservabilitySettings.from_environment("worker", {})

    assert settings == ObservabilitySettings(
        enabled=False,
        environment="local",
        release_sha="0" * 40,
        service="worker",
        traces_sample_rate=0.1,
    )


def test_observability_binds_both_exporters_to_release_identity() -> None:
    settings = ObservabilitySettings.from_environment("api", deployed_environment())

    assert settings.enabled is True
    assert settings.service == "api"
    assert settings.sentry_dsn == "https://public@example.test/1"
    assert settings.otlp_traces_endpoint == ("https://collector.example.test/v1/traces")
    assert settings.traces_sample_rate == 0.25


def test_observability_rejects_unsafe_exporters_and_sampling() -> None:
    for name, value in (
        ("SIMULA_TELEMETRY_ENABLED", "yes"),
        ("SIMULA_RELEASE_SHA", "preview"),
        ("SIMULA_SENTRY_DSN", "http://sentry.example.test/1"),
        (
            "SIMULA_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
            "https://collector.example.test",
        ),
        ("SIMULA_TELEMETRY_TRACES_SAMPLE_RATE", "1.1"),
    ):
        environment = {**deployed_environment(), name: value}
        with raises(ObservabilityConfigurationError):
            ObservabilitySettings.from_environment("ai-engine", environment)


def test_sentry_event_redaction_removes_content_identity_and_urls() -> None:
    event = sanitize_sentry_event(
        cast(
            SentryEvent,
            {
                "breadcrumbs": [{"message": "private stimulus"}],
                "exception": {"values": [{"type": "ProviderError", "value": "token=secret"}]},
                "extra": {"result": "private"},
                "message": "private",
                "request": {
                    "data": "private",
                    "headers": {"authorization": "secret"},
                    "url": "https://example.test/private",
                },
                "transaction": "/private",
                "user": {"id": "private"},
            },
        ),
        {},
        environment="staging",
        service="worker",
    )

    assert event == {
        "exception": {"values": [{"type": "ProviderError", "value": "ProviderError"}]},
        "tags": {"environment": "staging", "service": "worker"},
    }


def test_span_redaction_keeps_only_bounded_operational_attributes() -> None:
    span = ReadableSpan(
        name="GET /runs/private",
        attributes={
            "http.request.header.authorization": "Bearer secret",
            "http.request.method": "GET",
            "http.route": "/api/v2/runs/:run_id",
            "url.full": "https://example.test/private?token=secret",
        },
        events=(
            Event(
                "exception",
                {
                    "exception.message": "private",
                    "exception.type": "ProviderError",
                },
            ),
        ),
        resource=Resource.create({}),
        status=Status(StatusCode.ERROR, "private"),
        instrumentation_scope=InstrumentationScope("@opentelemetry/instrumentation-fastapi"),
    )

    redacted = sanitize_span(span)

    assert redacted.name == "http.request"
    assert redacted.attributes == {
        "http.request.method": "GET",
        "http.route": "/api/v2/runs/:run_id",
    }
    assert redacted.events[0].attributes == {"exception.type": "ProviderError"}
    assert redacted.status.status_code == StatusCode.ERROR
    assert redacted.status.description is None


def test_runtime_exports_an_induced_span_only_after_redaction() -> None:
    exporter = RecordingExporter()
    runtime = ObservabilityRuntime(
        ObservabilitySettings.from_environment(
            "worker",
            {
                **deployed_environment(),
                "SIMULA_ENVIRONMENT": "local",
                "SIMULA_SENTRY_DSN": "http://public@127.0.0.1:9999/1",
                "SIMULA_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": ("http://127.0.0.1:4318/v1/traces"),
                "SIMULA_TELEMETRY_TRACES_SAMPLE_RATE": "1",
            },
        ),
        initialize_sentry=False,
        span_exporter=exporter,
    )
    with runtime.span("worker.job") as span:
        span.set_attribute("simula.job.outcome", "failed")
        span.set_attribute("private.stimulus", "must-not-export")
    runtime.shutdown()

    assert len(exporter.spans) == 1
    assert exporter.spans[0].name == "internal.operation"
    assert exporter.spans[0].attributes == {"simula.job.outcome": "failed"}
