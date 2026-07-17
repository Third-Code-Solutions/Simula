from __future__ import annotations

import base64
import json
from typing import Any

from scripts.check_secrets import findings_for_text


def _base64url_json(value: dict[str, Any]) -> str:
    encoded = json.dumps(value, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(encoded).decode().rstrip("=")


def test_supabase_secret_api_key_is_detected() -> None:
    credential = "sb_" + "secret_" + ("A" * 32)

    assert findings_for_text(credential) == {"Supabase secret API key"}


def test_supabase_privileged_legacy_jwt_is_detected() -> None:
    credential = ".".join(
        (
            _base64url_json({"alg": "HS256", "typ": "JWT"}),
            _base64url_json({"role": "service_role"}),
            "signaturecanarysignaturecanarysignaturecanary",
        )
    )

    assert findings_for_text(credential) == {"Supabase privileged legacy JWT"}


def test_publishable_key_and_unprivileged_jwt_are_allowed() -> None:
    publishable = "sb_" + "publishable_" + ("A" * 32)
    unprivileged_jwt = ".".join(
        (
            _base64url_json({"alg": "HS256", "typ": "JWT"}),
            _base64url_json({"role": "authenticated"}),
            "signaturecanarysignaturecanarysignaturecanary",
        )
    )

    assert findings_for_text(publishable + "\n" + unprivileged_jwt) == set()
