"""Small, dependency-free structured-log allowlist boundary."""

from __future__ import annotations

from collections.abc import Callable, Mapping, MutableMapping
from typing import Any, Literal

from simula_core.runtime import RuntimeMetadata

_COMMON_FIELDS = frozenset(
    {
        "environment",
        "event",
        "level",
        "log_level",
        "release_sha",
        "service",
        "timestamp",
    }
)


def runtime_metadata_processor(
    *, service: Literal["api", "worker"]
) -> Callable[[Any, str, MutableMapping[str, Any]], Mapping[str, Any]]:
    """Build a processor that stamps trusted runtime identity on every log."""

    metadata = RuntimeMetadata.from_environment(service=service).model_dump()

    def add_runtime_metadata(
        _logger: Any, _method_name: str, event_dict: MutableMapping[str, Any]
    ) -> Mapping[str, Any]:
        event_dict.update(metadata)
        return event_dict

    return add_runtime_metadata


def sanitize_log_event(
    event_dict: Mapping[str, object],
    *,
    allowed_fields: Mapping[str, frozenset[str]],
    unknown_event: str,
) -> dict[str, object]:
    """Return only fields explicitly admitted for one known event.

    Unknown/foreign log messages are reduced to a fixed event name.  This keeps
    framework, dependency, exception, and accidental application messages from
    becoming a payload or credential exfiltration channel.
    """

    raw_event = event_dict.get("event")
    event = (
        raw_event if isinstance(raw_event, str) and raw_event in allowed_fields else unknown_event
    )
    event_specific_fields = allowed_fields.get(event, frozenset())
    permitted = _COMMON_FIELDS | event_specific_fields
    sanitized = {key: value for key, value in event_dict.items() if key in permitted}
    sanitized["event"] = event
    return sanitized
