"""Minimal payload-free W3C trace-context continuation shared by services."""

from __future__ import annotations

import re
import secrets
from dataclasses import dataclass

TRACEPARENT_HEADER = "traceparent"
_TRACEPARENT_PATTERN = re.compile(
    r"^00-(?P<trace_id>[0-9a-f]{32})-(?P<parent_id>[0-9a-f]{16})-(?P<flags>0[01])$"
)


@dataclass(frozen=True, slots=True)
class TraceContext:
    """One generated service span continuing a valid version-00 parent."""

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


def _nonzero_hex(byte_count: int) -> str:
    while True:
        value = secrets.token_hex(byte_count)
        if set(value) != {"0"}:
            return value
