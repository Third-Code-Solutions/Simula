"""Opaque integrity-protected keyset cursors."""

from __future__ import annotations

import base64
import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from simula_core.json_codec import (
    CanonicalJsonCodecError,
    canonical_json_dumps,
    canonical_json_loads,
)

from simula_api.problems import AppProblem, ProblemError

MAX_CURSOR_LENGTH = 1024


@dataclass(frozen=True)
class CursorPosition:
    created_at: datetime
    resource_id: UUID


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


class CursorCodec:
    def __init__(self, secret: bytes) -> None:
        if len(secret) < 32:
            raise ValueError("cursor secret is too short")
        self._secret = secret

    def encode(self, *, scope: str, position: CursorPosition) -> str:
        created_at = position.created_at.astimezone(UTC).isoformat().replace("+00:00", "Z")
        payload = canonical_json_dumps(
            {
                "created_at": created_at,
                "id": str(position.resource_id),
                "scope": scope,
                "v": 1,
            }
        )
        signature = hmac.digest(self._secret, payload, hashlib.sha256)
        return f"{_encode(payload)}.{_encode(signature)}"

    def decode(self, value: str | None, *, scope: str) -> CursorPosition | None:
        if value is None:
            return None
        try:
            if not value or len(value) > MAX_CURSOR_LENGTH or value.count(".") != 1:
                raise ValueError
            payload_part, signature_part = value.split(".", 1)
            payload = _decode(payload_part)
            signature = _decode(signature_part)
            expected = hmac.digest(self._secret, payload, hashlib.sha256)
            if not hmac.compare_digest(signature, expected):
                raise ValueError
            decoded = canonical_json_loads(payload)
            if not isinstance(decoded, dict):
                raise ValueError
            document = cast(dict[str, Any], decoded)
            if set(document) != {"created_at", "id", "scope", "v"}:
                raise ValueError
            if document["v"] != 1 or document["scope"] != scope:
                raise ValueError
            created_at_raw = document["created_at"]
            resource_id_raw = document["id"]
            if not isinstance(created_at_raw, str) or not isinstance(resource_id_raw, str):
                raise ValueError
            created_at = datetime.fromisoformat(created_at_raw.replace("Z", "+00:00"))
            if created_at.tzinfo is None:
                raise ValueError
            resource_id = UUID(resource_id_raw)
            if str(resource_id) != resource_id_raw:
                raise ValueError
        except (CanonicalJsonCodecError, UnicodeError, ValueError) as error:
            raise AppProblem(
                status=422,
                code="validation_error",
                title="Invalid cursor",
                detail="The pagination cursor is invalid or no longer applies.",
                errors=(ProblemError(field="cursor", code="invalid"),),
            ) from error
        return CursorPosition(created_at=created_at, resource_id=resource_id)
