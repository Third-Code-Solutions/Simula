"""Structured, payload-free worker logging."""

from __future__ import annotations

import logging
import os
from collections.abc import Mapping, MutableMapping
from typing import Any

import structlog
from simula_core.safe_logs import sanitize_log_event

_WORKER_LOG_FIELDS = {
    "run_dispatch_ambiguous": frozenset({"outbox_id"}),
    "run_dispatch_confirmation_rejected": frozenset({"outbox_id"}),
    "run_dispatch_failed": frozenset({"error_class", "outbox_id"}),
    "run_dispatch_failure_record_failed": frozenset({"error_class", "outbox_id"}),
    "run_dispatch_failure_record_rejected": frozenset({"outbox_id"}),
    "run_dispatch_pass_failed": frozenset({"error_class"}),
    "run_dispatch_unproven": frozenset({"outbox_id"}),
    "run_execution_binding_rejected": frozenset({"reason"}),
    "run_execution_claim_rejected": frozenset({"reason", "run_id"}),
    "run_execution_completion_rejected": frozenset({"run_id"}),
    "run_execution_lease_rejected": frozenset({"checkpoint", "run_id"}),
    "run_execution_provider_failed": frozenset({"error_class", "run_id"}),
    "run_execution_retryable_failure": frozenset({"reason", "run_id"}),
    "service_started": frozenset({"payload_contract"}),
    "service_stopped": frozenset({"payload_contract"}),
}


def _enforce_log_allowlist(
    _logger: object, _method_name: str, event_dict: MutableMapping[str, Any]
) -> Mapping[str, Any]:
    return sanitize_log_event(
        event_dict,
        allowed_fields=_WORKER_LOG_FIELDS,
        unknown_event="foreign_log",
    )


def configure_logging() -> None:
    level = os.getenv("SIMULA_LOG_LEVEL", "INFO").upper()
    logging.basicConfig(format="%(message)s", level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            _enforce_log_allowlist,
            structlog.processors.JSONRenderer(sort_keys=True),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level)),
    )
