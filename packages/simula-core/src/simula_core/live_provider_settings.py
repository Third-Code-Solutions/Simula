"""Server-owned admission for experimental Philippine scenario execution.

The public API advertises configuration, never credentials. Workers independently
validate the same limits and require their own key before making any model call.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal
from urllib.parse import urlsplit

from pydantic import Field

from simula_core.methodology import FrozenModel

if TYPE_CHECKING:
    from simula_core.campaign_lab import CampaignLabSimulationRequest

PROMPT_VERSION: Literal["philippine_scenario_v1"] = "philippine_scenario_v1"
SUPPORTED_LANGUAGES = ("fil", "taglish", "en")
SUPPORTED_PURPOSES = (
    "commercial_marketing",
    "brand_communication",
    "product_launch",
    "public_service",
)


class LiveProviderConfigurationError(ValueError):
    """A live provider is absent or cannot safely admit the requested run."""


class LiveProviderLimits(FrozenModel):
    max_agents: int = Field(default=10, ge=10, le=100)
    max_rounds: int = Field(default=1, ge=1, le=10)
    max_repetitions: int = Field(default=3, ge=3, le=10)
    max_calls: int = Field(default=100, ge=1, le=5000)
    max_cost_microusd: int = Field(default=1_000_000, ge=1, le=100_000_000)


class LiveProviderCapabilities(FrozenModel):
    live_available: bool
    provider: Literal["openai_compatible"] = "openai_compatible"
    model_name: str | None
    prompt_version: Literal["philippine_scenario_v1"] = PROMPT_VERSION
    supported_languages: tuple[str, ...] = SUPPORTED_LANGUAGES
    supported_purposes: tuple[str, ...] = SUPPORTED_PURPOSES
    limits: LiveProviderLimits
    unavailable_reason: str | None


def _integer(name: str, default: int | None, *, maximum: int) -> int:
    raw = os.getenv(name, str(default) if default is not None else "")
    if not raw.isascii() or not raw.isdecimal() or not 1 <= int(raw) <= maximum:
        raise LiveProviderConfigurationError(f"{name} requires a positive bounded integer")
    return int(raw)


@dataclass(frozen=True, slots=True)
class LiveProviderSettings:
    base_url: str
    model: str
    api_key: str = field(repr=False)
    input_microusd_per_million_tokens: int
    output_microusd_per_million_tokens: int
    max_input_tokens: int = 32000
    max_output_tokens: int = 4096
    max_agents: int = 10
    max_rounds: int = 1
    max_repetitions: int = 3
    max_calls: int = 100
    max_cost_microusd: int = 1_000_000

    @classmethod
    def from_environment(cls, *, require_api_key: bool = False) -> LiveProviderSettings:
        if os.getenv("SIMULA_LIVE_ENABLED", "false") != "true":
            raise LiveProviderConfigurationError("Live scenario execution is not enabled")
        base_url = os.getenv("SIMULA_LIVE_BASE_URL", "").rstrip("/")
        parsed = urlsplit(base_url)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise LiveProviderConfigurationError(
                "Live provider requires a server-configured HTTPS URL"
            )
        model = os.getenv("SIMULA_LIVE_MODEL", "").strip()
        if not model or len(model) > 120:
            raise LiveProviderConfigurationError("Live provider requires an admitted model")
        api_key = os.getenv("SIMULA_LIVE_API_KEY", "") if require_api_key else ""
        if require_api_key and (not api_key.strip() or any(c in api_key for c in "\r\n")):
            raise LiveProviderConfigurationError("Live provider credentials are unavailable")
        values = {
            "max_agents": _integer("SIMULA_LIVE_MAX_AGENTS", 10, maximum=100),
            "max_rounds": _integer("SIMULA_LIVE_MAX_ROUNDS", 1, maximum=10),
            "max_repetitions": _integer("SIMULA_LIVE_MAX_REPETITIONS", 3, maximum=10),
            "max_calls": _integer("SIMULA_LIVE_MAX_CALLS", 100, maximum=5000),
            "max_cost_microusd": _integer(
                "SIMULA_LIVE_MAX_COST_MICROUSD", 1_000_000, maximum=100_000_000
            ),
        }
        LiveProviderLimits(**values)
        return cls(
            base_url=base_url,
            model=model,
            api_key=api_key,
            input_microusd_per_million_tokens=_integer(
                "SIMULA_LIVE_INPUT_MICROUSD_PER_MILLION_TOKENS", None, maximum=10**12
            ),
            output_microusd_per_million_tokens=_integer(
                "SIMULA_LIVE_OUTPUT_MICROUSD_PER_MILLION_TOKENS", None, maximum=10**12
            ),
            max_input_tokens=_integer("SIMULA_LIVE_MAX_INPUT_TOKENS", 32000, maximum=128000),
            max_output_tokens=_integer("SIMULA_LIVE_MAX_OUTPUT_TOKENS", 4096, maximum=16000),
            **values,
        )

    def validate_request(self, request: CampaignLabSimulationRequest) -> None:
        config = request.configuration
        if config.provider != "openai_compatible" or config.model_name != self.model:
            raise LiveProviderConfigurationError("Requested model is not admitted")
        if config.prompt_version != PROMPT_VERSION or config.model_parameters:
            raise LiveProviderConfigurationError(
                "Live execution uses the server-owned prompt and parameters"
            )
        if request.purpose not in SUPPORTED_PURPOSES:
            raise LiveProviderConfigurationError(
                "Live scenarios support marketing and neutral public-service research"
            )
        if any(variant.language not in SUPPORTED_LANGUAGES for variant in request.variants):
            raise LiveProviderConfigurationError(
                "Live scenarios support Filipino, Taglish, and English"
            )
        if len({variant.language for variant in request.variants}) != 1:
            raise LiveProviderConfigurationError("Use one response language per scenario run")
        if (
            config.panel_size > self.max_agents
            or config.rounds > self.max_rounds
            or config.repetitions > self.max_repetitions
            or not 0 < config.cost_ceiling_microusd <= self.max_cost_microusd
        ):
            raise LiveProviderConfigurationError(
                "Scenario exceeds server agent, round, repetition, or cost limits"
            )
        calls = (
            len(request.variants)
            * config.repetitions
            * (
                config.panel_size * config.rounds
                + (0 if request.purpose == "public_service" else 1)
            )
        )
        if calls > self.max_calls:
            raise LiveProviderConfigurationError("Scenario exceeds the server provider-call limit")
        if not request.research_sources or not request.research_knowledge:
            raise LiveProviderConfigurationError(
                "Live scenarios require admitted research sources and knowledge"
            )
        if request.purpose == "public_service" and request.ranking_metric != "clarity":
            raise LiveProviderConfigurationError(
                "Public-service research does not rank persuasion or preference"
            )

    def capabilities(self) -> LiveProviderCapabilities:
        return LiveProviderCapabilities(
            live_available=True,
            model_name=self.model,
            unavailable_reason=None,
            limits=LiveProviderLimits(
                max_agents=self.max_agents,
                max_rounds=self.max_rounds,
                max_repetitions=self.max_repetitions,
                max_calls=self.max_calls,
                max_cost_microusd=self.max_cost_microusd,
            ),
        )


def live_provider_capabilities() -> LiveProviderCapabilities:
    try:
        return LiveProviderSettings.from_environment().capabilities()
    except ValueError:
        return LiveProviderCapabilities(
            live_available=False,
            model_name=None,
            limits=LiveProviderLimits(),
            unavailable_reason="Live scenario execution is not configured. Demo remains available.",
        )
