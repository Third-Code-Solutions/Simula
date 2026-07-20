"""Governed public RFC 9457 problem-code inventory."""

from typing import Literal

type StableProblemCode = Literal[
    "dependency_unavailable",
    "forbidden",
    "idempotency_key_reused",
    "internal_error",
    "invalid_request",
    "method_not_allowed",
    "not_found",
    "queue_backpressure",
    "quota_exceeded",
    "rate_limited",
    "request_deadline_exceeded",
    "request_too_large",
    "run_not_cancelable",
    "unauthenticated",
    "unsupported_media_type",
    "unsupported_scope",
    "validation_error",
    "version_conflict",
]

STABLE_PROBLEM_CODES: tuple[StableProblemCode, ...] = (
    "dependency_unavailable",
    "forbidden",
    "idempotency_key_reused",
    "internal_error",
    "invalid_request",
    "method_not_allowed",
    "not_found",
    "queue_backpressure",
    "quota_exceeded",
    "rate_limited",
    "request_deadline_exceeded",
    "request_too_large",
    "run_not_cancelable",
    "unauthenticated",
    "unsupported_media_type",
    "unsupported_scope",
    "validation_error",
    "version_conflict",
)
