"""Structured, payload-free service logging."""

from __future__ import annotations

import logging
import os
import sys
from collections.abc import Mapping, MutableMapping
from typing import Any

import structlog
from simula_core.safe_logs import runtime_metadata_processor, sanitize_log_event

_API_LOG_FIELDS = {
    "api_request_denied": frozenset(
        {"code", "correlation_id", "route_template", "span_id", "status", "trace_id"}
    ),
    "api_request_deadline_exceeded": frozenset(
        {"budget_seconds", "correlation_id", "route_template"}
    ),
    "audit_evidence_incomplete": frozenset(
        {"action", "correlation_id", "error_code", "object_type"}
    ),
    "domain_dependencies_unavailable": frozenset({"error_class"}),
    "http_request_completed": frozenset(
        {
            "correlation_id",
            "duration_ms",
            "method",
            "route_template",
            "span_id",
            "status",
            "trace_id",
        }
    ),
    "http_request_failed": frozenset(
        {
            "correlation_id",
            "error_class",
            "method",
            "route_template",
            "span_id",
            "status",
            "trace_id",
        }
    ),
    "idempotency_created": frozenset({"correlation_id", "route_template"}),
    "idempotency_replay": frozenset({"correlation_id", "route_template"}),
    "run_publish_ambiguous": frozenset({"correlation_id", "run_id"}),
    "run_publisher_unavailable": frozenset({"correlation_id"}),
    "service_started": frozenset(),
    "service_stopped": frozenset(),
}


def _enforce_log_allowlist(
    _logger: object, _method_name: str, event_dict: MutableMapping[str, Any]
) -> Mapping[str, Any]:
    return sanitize_log_event(
        event_dict,
        allowed_fields=_API_LOG_FIELDS,
        unknown_event="foreign_log",
    )


def configure_logging() -> None:
    level = os.getenv("SIMULA_LOG_LEVEL", "INFO").upper()
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        runtime_metadata_processor(service="api"),
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        _enforce_log_allowlist,
    ]
    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(sort_keys=True),
        ],
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(level)
    logging.captureWarnings(True)
    structlog.configure(
        processors=[*shared_processors, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
