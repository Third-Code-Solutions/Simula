"""Fail-closed configuration for the private behavioral-engine service."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import cast

from simula_core.runtime_admission import (
    REQUIRED_DATABASE_MIGRATION_HEAD,
    ProductionAdmission,
    RuntimeAdmissionError,
    parse_deployment_admission,
)

Environment = str
_VALID_ENVIRONMENTS = frozenset({"local", "test", "preview", "staging", "production"})
_PLACEHOLDER_FRAGMENTS = ("replace", "example", "changeme")


class EngineConfigurationError(ValueError):
    """The private engine cannot safely start from its current environment."""


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise EngineConfigurationError(f"{name} is required")
    return value


def _internal_tokens() -> tuple[str, ...]:
    raw = _required("SIMULA_AI_ENGINE_INTERNAL_TOKENS")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        raise EngineConfigurationError(
            "SIMULA_AI_ENGINE_INTERNAL_TOKENS must be a JSON array"
        ) from error
    if not isinstance(parsed, list) or not 1 <= len(parsed) <= 2:
        raise EngineConfigurationError(
            "SIMULA_AI_ENGINE_INTERNAL_TOKENS must contain one or two rotation tokens"
        )
    if any(not isinstance(item, str) for item in parsed):
        raise EngineConfigurationError("every internal engine token must be a string")
    tokens = tuple(cast(str, item) for item in parsed)
    if len(tokens) != len(set(tokens)):
        raise EngineConfigurationError("internal engine tokens must be unique")
    if any(
        not 32 <= len(token) <= 256
        or token.strip() != token
        or any(fragment in token.lower() for fragment in _PLACEHOLDER_FRAGMENTS)
        for token in tokens
    ):
        raise EngineConfigurationError(
            "internal engine tokens must be non-placeholder values from 32 through 256 characters"
        )
    return tokens


@dataclass(frozen=True, slots=True)
class EngineSettings:
    environment: Environment
    release_sha: str
    internal_tokens: tuple[str, ...]
    port: int
    technical_visual_profile_enabled: bool = False
    migration_head: str = REQUIRED_DATABASE_MIGRATION_HEAD
    production_admission: ProductionAdmission | None = None

    @classmethod
    def from_environment(cls) -> EngineSettings:
        environment = _required("SIMULA_ENVIRONMENT").lower()
        if environment not in _VALID_ENVIRONMENTS:
            raise EngineConfigurationError("SIMULA_ENVIRONMENT is unsupported")
        release_sha = _required("SIMULA_RELEASE_SHA")
        if not re.fullmatch(r"[0-9a-f]{40}", release_sha):
            raise EngineConfigurationError(
                "SIMULA_RELEASE_SHA must be an exact 40-character git SHA"
            )
        try:
            deployment_admission = parse_deployment_admission(environment)
        except RuntimeAdmissionError as error:
            raise EngineConfigurationError(str(error)) from error
        raw_port = os.getenv("PORT", "8010")
        if not raw_port.isascii() or not raw_port.isdecimal():
            raise EngineConfigurationError("PORT must be an integer from 1 through 65535")
        port = int(raw_port)
        if port not in range(1, 65_536):
            raise EngineConfigurationError("PORT must be an integer from 1 through 65535")
        raw_visual_enabled = os.getenv("SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED", "false")
        if raw_visual_enabled not in {"true", "false"}:
            raise EngineConfigurationError(
                "SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED must be true or false"
            )
        return cls(
            environment=environment,
            release_sha=release_sha,
            internal_tokens=_internal_tokens(),
            port=port,
            technical_visual_profile_enabled=raw_visual_enabled == "true",
            migration_head=deployment_admission.migration_head,
            production_admission=deployment_admission.production_admission,
        )
