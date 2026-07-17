"""Shared SIMULA primitives."""

from simula_core.json_codec import CanonicalJsonCodecError, canonical_json_dumps
from simula_core.json_codec import canonical_json_loads as canonical_json_loads
from simula_core.runtime import RuntimeMetadata

__all__ = [
    "CanonicalJsonCodecError",
    "RuntimeMetadata",
    "canonical_json_dumps",
    "canonical_json_loads",
]
