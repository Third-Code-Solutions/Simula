"""Exact provider admission. No default provider and no fallback."""

from __future__ import annotations

from dataclasses import dataclass

from simula_core.behavioral_engine import (
    BehavioralDecisionProvider,
    BehavioralProviderDescriptor,
    DeterministicNarrativeSynthesizer,
    DeterministicTieredProvider,
    NarrativeSynthesizer,
)
from simula_core.visual_analysis import (
    TechnicalImageSignalProvider,
    VisualProfileProvider,
    VisualProviderDescriptor,
)


class ProviderNotAdmittedError(ValueError):
    """The command requested a provider descriptor absent from the registry."""


class VisualProviderNotAdmittedError(ValueError):
    """The command requested a visual provider absent from the registry."""


@dataclass(frozen=True, slots=True)
class AdmittedBehavioralProvider:
    provider: BehavioralDecisionProvider
    synthesizer: NarrativeSynthesizer

    @property
    def descriptor(self) -> BehavioralProviderDescriptor:
        return self.provider.descriptor


class BehavioralProviderRegistry:
    def __init__(self, providers: tuple[AdmittedBehavioralProvider, ...]) -> None:
        if not providers:
            raise ValueError("behavioral provider registry cannot be empty")
        by_descriptor = {item.descriptor: item for item in providers}
        if len(by_descriptor) != len(providers):
            raise ValueError("behavioral provider descriptors must be unique")
        self._by_descriptor = by_descriptor

    @classmethod
    def experimental_deterministic_only(cls) -> BehavioralProviderRegistry:
        return cls(
            (
                AdmittedBehavioralProvider(
                    provider=DeterministicTieredProvider(),
                    synthesizer=DeterministicNarrativeSynthesizer(),
                ),
            )
        )

    def resolve(self, descriptor: BehavioralProviderDescriptor) -> AdmittedBehavioralProvider:
        admitted = self._by_descriptor.get(descriptor)
        if admitted is None:
            raise ProviderNotAdmittedError(
                "the exact behavioral provider descriptor is not admitted"
            )
        return admitted

    @property
    def descriptors(self) -> tuple[BehavioralProviderDescriptor, ...]:
        return tuple(
            sorted(
                self._by_descriptor,
                key=lambda item: (
                    item.provider_id,
                    item.provider_version,
                    item.model_id,
                    item.template_id,
                ),
            )
        )


class VisualProviderRegistry:
    def __init__(self, providers: tuple[VisualProfileProvider, ...]) -> None:
        if not providers:
            raise ValueError("visual provider registry cannot be empty")
        by_descriptor = {item.descriptor: item for item in providers}
        if len(by_descriptor) != len(providers):
            raise ValueError("visual provider descriptors must be unique")
        self._by_descriptor = by_descriptor

    @classmethod
    def experimental_technical_only(cls) -> VisualProviderRegistry:
        return cls((TechnicalImageSignalProvider(),))

    def resolve(self, descriptor: VisualProviderDescriptor) -> VisualProfileProvider:
        admitted = self._by_descriptor.get(descriptor)
        if admitted is None:
            raise VisualProviderNotAdmittedError(
                "the exact visual provider descriptor is not admitted"
            )
        return admitted

    @property
    def descriptors(self) -> tuple[VisualProviderDescriptor, ...]:
        return tuple(
            sorted(
                self._by_descriptor,
                key=lambda item: (
                    item.provider_id,
                    item.provider_version,
                    item.model_id,
                    item.template_id,
                ),
            )
        )
