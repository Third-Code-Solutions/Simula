from __future__ import annotations

import pytest
from simula_ai_engine.registry import (
    BehavioralProviderRegistry,
    ProviderNotAdmittedError,
    VisualProviderNotAdmittedError,
    VisualProviderRegistry,
)
from simula_core.behavioral_engine import DeterministicTieredProvider
from simula_core.visual_analysis import TechnicalImageSignalProvider


def test_registry_resolves_only_the_exact_admitted_descriptor() -> None:
    registry = BehavioralProviderRegistry.experimental_deterministic_only()
    descriptor = DeterministicTieredProvider.descriptor

    assert registry.resolve(descriptor).descriptor == descriptor
    with pytest.raises(ProviderNotAdmittedError):
        registry.resolve(descriptor.model_copy(update={"provider_version": "2"}))


def test_visual_registry_resolves_only_the_exact_admitted_descriptor() -> None:
    registry = VisualProviderRegistry.experimental_technical_only()
    descriptor = TechnicalImageSignalProvider.descriptor

    assert registry.resolve(descriptor).descriptor == descriptor
    with pytest.raises(VisualProviderNotAdmittedError):
        registry.resolve(descriptor.model_copy(update={"provider_version": "2"}))
