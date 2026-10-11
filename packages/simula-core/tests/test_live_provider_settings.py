from __future__ import annotations

from types import SimpleNamespace

import pytest
from simula_core.live_provider_settings import (
    LiveProviderConfigurationError,
    LiveProviderSettings,
    live_provider_capabilities,
)

_LIVE_ENVIRONMENT = (
    "SIMULA_LIVE_ENABLED",
    "SIMULA_LIVE_BASE_URL",
    "SIMULA_LIVE_MODEL",
    "SIMULA_LIVE_API_KEY",
    "SIMULA_LIVE_INPUT_MICROUSD_PER_MILLION_TOKENS",
    "SIMULA_LIVE_OUTPUT_MICROUSD_PER_MILLION_TOKENS",
    "SIMULA_LIVE_MAX_INPUT_TOKENS",
    "SIMULA_LIVE_MAX_OUTPUT_TOKENS",
    "SIMULA_LIVE_MAX_AGENTS",
    "SIMULA_LIVE_MAX_ROUNDS",
    "SIMULA_LIVE_MAX_REPETITIONS",
    "SIMULA_LIVE_MAX_CALLS",
    "SIMULA_LIVE_MAX_COST_MICROUSD",
)


@pytest.fixture(autouse=True)
def isolated_live_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in _LIVE_ENVIRONMENT:
        monkeypatch.delenv(name, raising=False)


def _configure(monkeypatch: pytest.MonkeyPatch) -> None:
    values = {
        "SIMULA_LIVE_ENABLED": "true",
        "SIMULA_LIVE_BASE_URL": "https://provider.test/v1/",
        "SIMULA_LIVE_MODEL": "admitted-model",
        "SIMULA_LIVE_API_KEY": "test-secret-key",
        "SIMULA_LIVE_INPUT_MICROUSD_PER_MILLION_TOKENS": "1000",
        "SIMULA_LIVE_OUTPUT_MICROUSD_PER_MILLION_TOKENS": "2000",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)


def _request(**overrides: object) -> SimpleNamespace:
    values: dict[str, object] = {
        "purpose": "commercial_marketing",
        "ranking_metric": "clarity",
        "variants": (SimpleNamespace(language="en"), SimpleNamespace(language="en")),
        "research_sources": (object(),),
        "research_knowledge": ({"source_id": "source"},),
        "configuration": SimpleNamespace(
            provider="openai_compatible",
            model_name="admitted-model",
            prompt_version="philippine_scenario_v1",
            model_parameters={},
            panel_size=10,
            rounds=1,
            repetitions=3,
            cost_ceiling_microusd=1000,
        ),
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_live_provider_is_disabled_by_default() -> None:
    with pytest.raises(LiveProviderConfigurationError, match="not enabled"):
        LiveProviderSettings.from_environment()

    capabilities = live_provider_capabilities()
    assert capabilities.live_available is False
    assert capabilities.model_name is None


@pytest.mark.parametrize(
    ("missing", "message"),
    [
        ("SIMULA_LIVE_BASE_URL", "HTTPS URL"),
        ("SIMULA_LIVE_MODEL", "admitted model"),
        ("SIMULA_LIVE_API_KEY", "credentials"),
    ],
)
def test_live_provider_requires_server_fields_and_worker_key(
    monkeypatch: pytest.MonkeyPatch, missing: str, message: str
) -> None:
    _configure(monkeypatch)
    monkeypatch.delenv(missing)

    with pytest.raises(LiveProviderConfigurationError, match=message):
        LiveProviderSettings.from_environment(require_api_key=missing == "SIMULA_LIVE_API_KEY")


@pytest.mark.parametrize(
    "url",
    [
        "http://provider.test/v1",
        "https://user:password@provider.test/v1",
        "https://provider.test/v1?token=secret",
        "https://provider.test/v1#secret",
    ],
)
def test_live_provider_url_requires_https_without_credentials(
    monkeypatch: pytest.MonkeyPatch, url: str
) -> None:
    _configure(monkeypatch)
    monkeypatch.setenv("SIMULA_LIVE_BASE_URL", url)

    with pytest.raises(LiveProviderConfigurationError, match="HTTPS URL"):
        LiveProviderSettings.from_environment()


def test_capabilities_expose_limits_but_never_url_or_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure(monkeypatch)
    monkeypatch.setenv("SIMULA_LIVE_MAX_CALLS", "42")

    settings = LiveProviderSettings.from_environment(require_api_key=True)
    payload = settings.capabilities().model_dump(mode="json")

    assert settings.base_url == "https://provider.test/v1"
    assert "test-secret-key" not in repr(settings)
    assert payload["limits"]["max_calls"] == 42
    assert "api_key" not in payload
    assert "base_url" not in payload


@pytest.mark.parametrize(
    ("simulation", "message"),
    [
        (
            _request(
                configuration=SimpleNamespace(
                    provider="openai_compatible",
                    model_name="other-model",
                    prompt_version="philippine_scenario_v1",
                    model_parameters={},
                    panel_size=10,
                    rounds=1,
                    repetitions=3,
                    cost_ceiling_microusd=1000,
                )
            ),
            "model is not admitted",
        ),
        (
            _request(
                configuration=SimpleNamespace(
                    provider="openai_compatible",
                    model_name="admitted-model",
                    prompt_version="philippine_scenario_v1",
                    model_parameters={},
                    panel_size=11,
                    rounds=1,
                    repetitions=3,
                    cost_ceiling_microusd=1000,
                )
            ),
            "exceeds server",
        ),
        (_request(research_sources=()), "require admitted research"),
        (_request(purpose="political_persuasion"), "marketing and neutral"),
        (_request(purpose="public_service", ranking_metric="preference_share"), "does not rank"),
    ],
)
def test_live_provider_enforces_model_limits_sources_and_purpose(
    monkeypatch: pytest.MonkeyPatch, simulation: SimpleNamespace, message: str
) -> None:
    _configure(monkeypatch)
    settings = LiveProviderSettings.from_environment()

    with pytest.raises(LiveProviderConfigurationError, match=message):
        settings.validate_request(simulation)  # type: ignore[arg-type]
