"""Bounded canonical JSON codec used instead of Python object serialization."""

from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any, Never

MAX_JSON_BYTES = 256 * 1024
MAX_CANONICAL_JSON_BYTES = 16_000_000
MAX_JSON_DEPTH = 32


class CanonicalJsonCodecError(ValueError):
    """Payload is unsafe, malformed, or not in canonical wire form."""


def _reject_constant(value: str) -> Never:
    raise CanonicalJsonCodecError(f"non-finite number is forbidden: {value}")


def _unique_object(pairs: Iterable[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise CanonicalJsonCodecError(f"duplicate object key: {key}")
        result[key] = value
    return result


def _depth(value: Any, current: int = 0) -> int:
    if current > MAX_JSON_DEPTH:
        raise CanonicalJsonCodecError(f"JSON exceeds maximum depth {MAX_JSON_DEPTH}")
    if isinstance(value, dict):
        for child in value.values():
            _depth(child, current + 1)
    elif isinstance(value, list):
        for child in value:
            _depth(child, current + 1)
    return current


def canonical_json_dumps_bounded(value: Any, *, maximum_bytes: int) -> bytes:
    """Encode strict canonical JSON within one explicitly governed byte budget."""

    if (
        not isinstance(maximum_bytes, int)
        or isinstance(maximum_bytes, bool)
        or maximum_bytes not in range(1, MAX_CANONICAL_JSON_BYTES + 1)
    ):
        raise CanonicalJsonCodecError(
            f"maximum size must be from 1 through {MAX_CANONICAL_JSON_BYTES}"
        )

    try:
        payload = json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise CanonicalJsonCodecError("value is not strict JSON") from error
    _depth(value)
    if len(payload) > maximum_bytes:
        raise CanonicalJsonCodecError(f"JSON exceeds maximum size {maximum_bytes}")
    return payload


def canonical_json_dumps(value: Any) -> bytes:
    """Encode one JSON value deterministically and within the queue budget."""

    return canonical_json_dumps_bounded(value, maximum_bytes=MAX_JSON_BYTES)


def canonical_json_loads(payload: bytes) -> Any:
    """Decode only canonical UTF-8 JSON; never fall back to pickle."""

    if not isinstance(payload, bytes):
        raise CanonicalJsonCodecError("payload must be bytes")
    if len(payload) > MAX_JSON_BYTES:
        raise CanonicalJsonCodecError(f"JSON exceeds maximum size {MAX_JSON_BYTES}")
    try:
        text = payload.decode("utf-8", errors="strict")
        value = json.loads(
            text,
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CanonicalJsonCodecError("payload is not strict UTF-8 JSON") from error
    _depth(value)
    if canonical_json_dumps(value) != payload:
        raise CanonicalJsonCodecError("payload is not canonical JSON")
    return value
