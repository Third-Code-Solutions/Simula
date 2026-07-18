"""Deterministic, no-egress Phase 2 simulation provider and result contract."""

from __future__ import annotations

from datetime import datetime
from hashlib import sha256
from math import fsum, isclose
from typing import Annotated, Literal, Protocol
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from simula_core.json_codec import canonical_json_dumps

Sha256 = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
FixtureKey = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,63}$")]
CanonicalSignedInt64 = Annotated[str, StringConstraints(pattern=r"^(?:0|-?[1-9][0-9]{0,18})$")]
SIGNED_INT64_MIN = -(2**63)
SIGNED_INT64_MAX = 2**63 - 1
NonRepresentativeLimitation = Literal[
    "Estimates nobody and is not representative of any population."
]
HumanResearchText = Literal[
    "Verify wording with appropriately recruited human participants before acting."
]
NON_REPRESENTATIVE_LIMITATION: NonRepresentativeLimitation = (
    "Estimates nobody and is not representative of any population."
)
HUMAN_RESEARCH_RECOMMENDATION: HumanResearchText = (
    "Verify wording with appropriately recruited human participants before acting."
)


class ProviderPreflightUnavailableError(RuntimeError):
    """A provider adapter failed before it could submit any provider work."""


class ProviderRateLimitedError(RuntimeError):
    """A provider explicitly rejected the request before provider work began."""


class StrictFrozenModel(BaseModel):
    """Closed immutable model used for frozen provider and result contracts."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class AudienceCell(StrictFrozenModel):
    key: FixtureKey
    weight: float = Field(gt=0.0, le=1.0)


class ProviderRequest(StrictFrozenModel):
    """Minimized provider input; it contains no organization or user identity."""

    request_id: UUID
    attempt_id: UUID
    run_id: UUID
    method_version: Literal["phase2_demo_v1"]
    language: Literal["en"]
    stimulus_content: Annotated[str, StringConstraints(min_length=1, max_length=5000)]
    audience_cells: tuple[AudienceCell, ...] = (AudienceCell(key="authored_demo", weight=1.0),)
    deterministic_seed: int = Field(ge=SIGNED_INT64_MIN, le=SIGNED_INT64_MAX)
    output_schema_version: Literal[1]
    frozen_manifest_sha256: Sha256
    deadline_at: datetime
    cost_ceiling: Literal[0] = 0


class DistributionCategory(StrictFrozenModel):
    key: Literal["clear", "unclear", "needs_human_review"]
    value: float = Field(ge=0.0, le=1.0)


class FixtureDistribution(StrictFrozenModel):
    unit: Literal["share"]
    categories: tuple[DistributionCategory, DistributionCategory, DistributionCategory]

    @model_validator(mode="after")
    def values_sum_to_one(self) -> FixtureDistribution:
        if not isclose(fsum(category.value for category in self.categories), 1.0, abs_tol=1e-9):
            raise ValueError("fixture distribution values must sum to one")
        return self


class NotApplicableUncertainty(StrictFrozenModel):
    status: Literal["not_applicable"]
    reason: Literal["authored deterministic fixture"]


class FixtureResultOutput(StrictFrozenModel):
    output_id: Literal["reaction_fixture"]
    kind: Literal["demo_fixture_distribution"]
    label: Literal["Pipeline demo values"]
    value: FixtureDistribution
    uncertainty: NotApplicableUncertainty
    limitations: tuple[NonRepresentativeLimitation, ...]


class UnavailableResultOutput(StrictFrozenModel):
    """An explicit no-value result; it is never rendered as a numeric estimate."""

    output_id: Literal["reaction_fixture"]
    kind: Literal["unavailable"]
    label: Literal["Pipeline demo values"]
    availability: Literal["unsupported", "suppressed"]
    reason: Literal["This output is unavailable. SIMULA will not substitute a value."]
    limitations: tuple[NonRepresentativeLimitation, ...]


ResultOutput = Annotated[
    FixtureResultOutput | UnavailableResultOutput,
    Field(discriminator="kind"),
]


class QualitativeObservation(StrictFrozenModel):
    kind: Literal["generated_qualitative"]
    synthetic: Literal[True]
    text: Literal["A deterministic mock observation used only to test rendering."]
    source_output_ids: tuple[Literal["reaction_fixture"], ...]


class HumanResearchRecommendation(StrictFrozenModel):
    kind: Literal["recommendation"]
    text: HumanResearchText
    source_output_ids: tuple[Literal["reaction_fixture"], ...]


class ResultProvenance(StrictFrozenModel):
    method_version: Literal["phase2_demo_v1"]
    provider_id: Literal["deterministic_mock"]
    provider_version: Literal[1]
    frozen_manifest_sha256: Sha256
    # JSON numbers cannot preserve every PostgreSQL bigint in browser code.
    # Persist the exact signed decimal representation with the immutable result.
    deterministic_seed: CanonicalSignedInt64
    output_schema_version: Literal[1]

    @field_validator("deterministic_seed")
    @classmethod
    def deterministic_seed_is_signed_int64(cls, value: str) -> str:
        if not SIGNED_INT64_MIN <= int(value) <= SIGNED_INT64_MAX:
            raise ValueError("deterministic seed must fit signed int64")
        return value


class SimulationResultV1(StrictFrozenModel):
    """Persisted terminal artifact for the single Phase 2 output schema."""

    schema_version: Literal["1.0.0"]
    run_id: UUID
    validation_label: Literal["experimental"]
    outputs: tuple[ResultOutput]
    qualitative: tuple[QualitativeObservation, ...]
    recommendations: tuple[HumanResearchRecommendation, ...]
    provenance: ResultProvenance
    limitations: tuple[NonRepresentativeLimitation, ...]


class SimulationProvider(Protocol):
    """Provider boundary: deterministic input in, schema-validated result out."""

    def run(self, request: ProviderRequest) -> SimulationResultV1: ...


class DeterministicMockProvider(SimulationProvider):
    """Pure Phase 2 provider: no clock, network, filesystem, shell, or database access."""

    _DISTRIBUTIONS: tuple[tuple[float, float, float], ...] = (
        (0.40, 0.35, 0.25),
        (0.45, 0.30, 0.25),
        (0.35, 0.40, 0.25),
        (0.30, 0.35, 0.35),
    )

    def run(self, request: ProviderRequest) -> SimulationResultV1:
        """Return the one deterministic, explicitly non-representative demo artifact."""

        digest = sha256(
            canonical_json_dumps(
                {
                    "audience_cells": [
                        cell.model_dump(mode="json") for cell in request.audience_cells
                    ],
                    "deterministic_seed": request.deterministic_seed,
                    "frozen_manifest_sha256": request.frozen_manifest_sha256,
                    "language": request.language,
                    "method_version": request.method_version,
                    "mock_version": 1,
                    "output_schema_version": request.output_schema_version,
                    "stimulus_content": request.stimulus_content,
                }
            )
        ).digest()
        clear, unclear, needs_human_review = self._DISTRIBUTIONS[
            digest[0] % len(self._DISTRIBUTIONS)
        ]
        non_representative: NonRepresentativeLimitation = NON_REPRESENTATIVE_LIMITATION
        return SimulationResultV1(
            schema_version="1.0.0",
            run_id=request.run_id,
            validation_label="experimental",
            outputs=(
                FixtureResultOutput(
                    output_id="reaction_fixture",
                    kind="demo_fixture_distribution",
                    label="Pipeline demo values",
                    value=FixtureDistribution(
                        unit="share",
                        categories=(
                            DistributionCategory(key="clear", value=clear),
                            DistributionCategory(key="unclear", value=unclear),
                            DistributionCategory(
                                key="needs_human_review", value=needs_human_review
                            ),
                        ),
                    ),
                    uncertainty=NotApplicableUncertainty(
                        status="not_applicable", reason="authored deterministic fixture"
                    ),
                    limitations=(non_representative,),
                ),
            ),
            qualitative=(
                QualitativeObservation(
                    kind="generated_qualitative",
                    synthetic=True,
                    text="A deterministic mock observation used only to test rendering.",
                    source_output_ids=("reaction_fixture",),
                ),
            ),
            recommendations=(
                HumanResearchRecommendation(
                    kind="recommendation",
                    text=HUMAN_RESEARCH_RECOMMENDATION,
                    source_output_ids=("reaction_fixture",),
                ),
            ),
            provenance=ResultProvenance(
                method_version=request.method_version,
                provider_id="deterministic_mock",
                provider_version=1,
                frozen_manifest_sha256=request.frozen_manifest_sha256,
                deterministic_seed=str(request.deterministic_seed),
                output_schema_version=request.output_schema_version,
            ),
            limitations=(non_representative,),
        )
