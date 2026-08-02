from __future__ import annotations

import pytest
from simula_ai_engine.config import EngineConfigurationError, EngineSettings
from simula_core.runtime_admission import REQUIRED_DATABASE_MIGRATION_HEAD


def _base_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "test")
    monkeypatch.setenv("SIMULA_RELEASE_SHA", "a" * 40)
    monkeypatch.setenv("PORT", "8010")


def test_engine_settings_require_strict_rotatable_internal_tokens(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _base_environment(monkeypatch)
    monkeypatch.setenv(
        "SIMULA_AI_ENGINE_INTERNAL_TOKENS",
        '["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]',
    )

    settings = EngineSettings.from_environment()

    assert settings.environment == "test"
    assert settings.release_sha == "a" * 40
    assert settings.port == 8010
    assert len(settings.internal_tokens) == 2
    assert settings.technical_visual_profile_enabled is False


def test_engine_settings_admit_visual_profile_only_with_exact_switch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _base_environment(monkeypatch)
    monkeypatch.setenv(
        "SIMULA_AI_ENGINE_INTERNAL_TOKENS",
        '["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]',
    )
    monkeypatch.setenv("SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED", "true")

    assert EngineSettings.from_environment().technical_visual_profile_enabled is True

    monkeypatch.setenv("SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED", "enabled")
    with pytest.raises(EngineConfigurationError):
        EngineSettings.from_environment()


@pytest.mark.parametrize(
    "tokens",
    (
        "not-json",
        "[]",
        '["short"]',
        '["replace-with-a-local-32-byte-minimum-token"]',
        '["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]',
    ),
)
def test_engine_settings_reject_unsafe_internal_tokens(
    monkeypatch: pytest.MonkeyPatch,
    tokens: str,
) -> None:
    _base_environment(monkeypatch)
    monkeypatch.setenv("SIMULA_AI_ENGINE_INTERNAL_TOKENS", tokens)

    with pytest.raises(EngineConfigurationError):
        EngineSettings.from_environment()


def test_engine_production_requires_release_admission(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _base_environment(monkeypatch)
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "production")
    monkeypatch.setenv(
        "SIMULA_AI_ENGINE_INTERNAL_TOKENS",
        '["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]',
    )

    with pytest.raises(EngineConfigurationError, match="MIGRATION_HEAD is required"):
        EngineSettings.from_environment()

    monkeypatch.setenv("SIMULA_DATABASE_MIGRATION_HEAD", REQUIRED_DATABASE_MIGRATION_HEAD)
    monkeypatch.setenv("SIMULA_PRODUCTION_ADMISSION_ENABLED", "true")
    monkeypatch.setenv("SIMULA_PRODUCTION_ROLLOUT_ID", "018f274b-3c77-4b22-b749-c9274230ef9a")
    monkeypatch.setenv(
        "SIMULA_RELEASE_PROVENANCE_URL",
        "https://github.com/Third-Code-Solutions/Simula/actions/runs/12345678",
    )
    monkeypatch.setenv("SIMULA_RELEASE_BUNDLE_SHA256", "b" * 64)
    monkeypatch.setenv("SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256", "c" * 64)

    settings = EngineSettings.from_environment()

    assert settings.migration_head == REQUIRED_DATABASE_MIGRATION_HEAD
    assert settings.production_admission is not None
