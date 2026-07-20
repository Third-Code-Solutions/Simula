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
CodeReleaseSha = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{40}$")]
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
    provider_id: Literal["deterministic_mock"]
    provider_version: Literal[1]
    model_id: Literal["deterministic_fixture_v1"]
    template_id: Literal["phase2_deterministic_mock_v1"]
    code_release_sha: CodeReleaseSha
    configuration_sha256: Sha256
    frozen_manifest_sha256: Sha256
    deadline_at: datetime
    cost_ceiling: Literal[0] = 0

    @model_validator(mode="after")
    def has_aware_deadline(self) -> ProviderRequest:
        if self.deadline_at.utcoffset() is None:
            raise ValueError("provider deadline must be timezone-aware")
        return self


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
    code_release_sha: CodeReleaseSha
    configuration_sha256: Sha256
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


class ProviderUsage(StrictFrozenModel):
    """Measured provider usage; the Phase 2 deterministic adapter is exactly zero-cost."""

    input_tokens: Literal[0]
    output_tokens: Literal[0]
    cost_microusd: Literal[0]


class ProviderMetadata(StrictFrozenModel):
    """Pure provider metadata; no fabricated wall-clock observations."""

    provider_id: Literal["deterministic_mock"]
    provider_version: Literal[1]
    model_id: Literal["deterministic_fixture_v1"]
    template_id: Literal["phase2_deterministic_mock_v1"]
    response_schema_version: Literal[1]
    finish_status: Literal["completed"]
    usage: ProviderUsage
    safe_error_class: None = None


class ProviderResponse(StrictFrozenModel):
    """Typed deterministic output plus pure provider metadata."""

    result: SimulationResultV1
    metadata: ProviderMetadata

    @model_validator(mode="after")
    def metadata_matches_result(self) -> ProviderResponse:
        if self.metadata.provider_id != self.result.provenance.provider_id:
            raise ValueError("provider metadata does not match result provider")
        if self.metadata.provider_version != self.result.provenance.provider_version:
            raise ValueError("provider metadata does not match result version")
        if self.metadata.response_schema_version != self.result.provenance.output_schema_version:
            raise ValueError("provider metadata does not match result schema")
        return self


class ProviderExecutionReceiptV1(StrictFrozenModel):
    """Worker-observed successful-result receipt; not a future billable cost ledger."""

    schema_version: Literal[1]
    receipt_kind: Literal["successful_result"]
    request_id: UUID
    attempt_id: UUID
    run_id: UUID
    provider_id: Literal["deterministic_mock"]
    provider_version: Literal[1]
    model_id: Literal["deterministic_fixture_v1"]
    template_id: Literal["phase2_deterministic_mock_v1"]
    response_schema_version: Literal[1]
    finish_status: Literal["completed"]
    usage: ProviderUsage
    started_at: datetime
    ended_at: datetime
    safe_error_class: None = None

    @model_validator(mode="after")
    def has_bounded_aware_timestamps(self) -> ProviderExecutionReceiptV1:
        if self.started_at.utcoffset() is None or self.ended_at.utcoffset() is None:
            raise ValueError("provider receipt timestamps must be timezone-aware")
        duration = (self.ended_at - self.started_at).total_seconds()
        if duration < 0 or duration > 30:
            raise ValueError("provider receipt duration must be from 0 through 30 seconds")
        return self

    @classmethod
    def from_success(
        cls,
        *,
        request: ProviderRequest,
        response: ProviderResponse,
        started_at: datetime,
        ended_at: datetime,
    ) -> ProviderExecutionReceiptV1:
        result = response.result
        metadata = response.metadata
        if result.run_id != request.run_id:
            raise ValueError("provider result run does not match request")
        if result.provenance.code_release_sha != request.code_release_sha:
            raise ValueError("provider result release does not match request")
        if result.provenance.configuration_sha256 != request.configuration_sha256:
            raise ValueError("provider result configuration does not match request")
        if result.provenance.frozen_manifest_sha256 != request.frozen_manifest_sha256:
            raise ValueError("provider result manifest does not match request")
        if result.provenance.deterministic_seed != str(request.deterministic_seed):
            raise ValueError("provider result seed does not match request")
        expected_identity = (
            request.provider_id,
            request.provider_version,
            request.model_id,
            request.template_id,
            request.output_schema_version,
        )
        actual_identity = (
            metadata.provider_id,
            metadata.provider_version,
            metadata.model_id,
            metadata.template_id,
            metadata.response_schema_version,
        )
        if actual_identity != expected_identity:
            raise ValueError("provider metadata does not match frozen request identity")
        if started_at > request.deadline_at or ended_at > request.deadline_at:
            raise ValueError("provider execution exceeded its frozen deadline")
        return cls(
            schema_version=1,
            receipt_kind="successful_result",
            request_id=request.request_id,
            attempt_id=request.attempt_id,
            run_id=request.run_id,
            provider_id=metadata.provider_id,
            provider_version=metadata.provider_version,
            model_id=metadata.model_id,
            template_id=metadata.template_id,
            response_schema_version=metadata.response_schema_version,
            finish_status=metadata.finish_status,
            usage=metadata.usage,
            started_at=started_at,
            ended_at=ended_at,
            safe_error_class=metadata.safe_error_class,
        )


class SimulationProvider(Protocol):
    """Provider boundary: deterministic input in, schema-validated result out."""

    def run(self, request: ProviderRequest) -> ProviderResponse: ...


class DeterministicMockProvider(SimulationProvider):
    """Pure Phase 2 provider: no clock, network, filesystem, shell, or database access."""

    _DISTRIBUTIONS: tuple[tuple[float, float, float], ...] = (
        (0.40, 0.35, 0.25),
        (0.45, 0.30, 0.25),
        (0.35, 0.40, 0.25),
        (0.30, 0.35, 0.35),
    )

    def run(self, request: ProviderRequest) -> ProviderResponse:
        """Return the one deterministic, explicitly non-representative demo artifact."""

        digest = sha256(
            canonical_json_dumps(
                {
                    "audience_cells": [
                        cell.model_dump(mode="json") for cell in request.audience_cells
                    ],
                    "deterministic_seed": request.deterministic_seed,
                    "code_release_sha": request.code_release_sha,
                    "configuration_sha256": request.configuration_sha256,
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
        result = SimulationResultV1(
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
                code_release_sha=request.code_release_sha,
                configuration_sha256=request.configuration_sha256,
                frozen_manifest_sha256=request.frozen_manifest_sha256,
                deterministic_seed=str(request.deterministic_seed),
                output_schema_version=request.output_schema_version,
            ),
            limitations=(non_representative,),
        )
        return ProviderResponse(
            result=result,
            metadata=ProviderMetadata(
                provider_id="deterministic_mock",
                provider_version=1,
                model_id="deterministic_fixture_v1",
                template_id="phase2_deterministic_mock_v1",
                response_schema_version=request.output_schema_version,
                finish_status="completed",
                usage=ProviderUsage(input_tokens=0, output_tokens=0, cost_microusd=0),
                safe_error_class=None,
            ),
        )
