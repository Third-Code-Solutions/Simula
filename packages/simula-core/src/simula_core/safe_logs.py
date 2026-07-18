"""Small, dependency-free structured-log allowlist boundary."""

from __future__ import annotations

from collections.abc import Mapping

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
