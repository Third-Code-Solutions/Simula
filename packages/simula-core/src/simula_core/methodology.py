"""Versioned Phase 3 methodology engine and evaluation primitives.

The engine operates on weighted cohort cells. It never creates fictional people and
never turns model variation into population uncertainty.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from hashlib import sha256
from math import fsum, isclose
from typing import Annotated, Literal, Protocol, Self
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

Key = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,63}$")]
Sha256 = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
Label = Annotated[str, StringConstraints(min_length=1, max_length=120)]
ShortText = Annotated[str, StringConstraints(min_length=1, max_length=500)]
ReactionKey = Literal["positive", "neutral", "negative", "mixed"]
MetricKey = Literal["clarity", "relevance", "trust", "persuasiveness", "consideration"]
EmotionKey = Literal["hopeful", "confused", "skeptical", "concerned"]
RiskKey = Literal["controversy", "backlash", "cultural"]
UncertaintyComponentName = Literal[
    "frame_coverage",
    "sampling",
    "measurement",
    "model",
    "held_out_adjustment",
    "run_stability",
    "missingness",
    "dataset_shift",
]

EXPERIMENTAL_LIMITATION = (
    "Experimental synthetic-cohort output. It is not a population estimate or human evidence."
)


class FrozenModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class DimensionValue(FrozenModel):
    dimension: Key
    value: Annotated[str, StringConstraints(min_length=1, max_length=80)]


class SourceProvenance(FrozenModel):
    source_id: Key
    source_version: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    owner: Label
    license: Label
    allowed_uses: tuple[ShortText, ...]
    collection_period: ShortText
    sampling_frame: ShortText
    transformations: tuple[ShortText, ...] = ()
    known_biases: tuple[ShortText, ...]
    coverage_limitations: tuple[ShortText, ...]
    validation_status: Literal["experimental", "benchmarked", "retired"] = "experimental"


class PopulationCell(FrozenModel):
    key: Key
    weight: float = Field(gt=0.0, le=1.0)
    dimensions: tuple[DimensionValue, ...]

    @model_validator(mode="after")
    def unique_dimensions(self) -> Self:
        names = [item.dimension for item in self.dimensions]
        if len(names) != len(set(names)):
            raise ValueError("population cell dimensions must be unique")
        if tuple(sorted(names)) != tuple(names):
            raise ValueError("population cell dimensions must use canonical order")
        return self

    def dimension_map(self) -> dict[str, str]:
        return {item.dimension: item.value for item in self.dimensions}


class PopulationFrameVersion(FrozenModel):
    id: UUID
    frame_id: UUID
    version: int = Field(ge=1)
    name: Label
    geography: Label
    target_population: ShortText
    inclusion: tuple[ShortText, ...]
    exclusion: tuple[ShortText, ...]
    provenance: tuple[SourceProvenance, ...]
    cells: tuple[PopulationCell, ...] = Field(min_length=1, max_length=500)
    validation_status: Literal["experimental", "benchmarked", "retired"]
    limitations: tuple[ShortText, ...] = Field(min_length=1)
    checksum_sha256: Sha256 = "0" * 64

    @model_validator(mode="after")
    def valid_frame(self) -> Self:
        keys = [cell.key for cell in self.cells]
        if len(keys) != len(set(keys)):
            raise ValueError("population cell keys must be unique")
        if tuple(sorted(keys)) != tuple(keys):
            raise ValueError("population cells must use canonical order")
        if not isclose(fsum(cell.weight for cell in self.cells), 1.0, abs_tol=1e-9):
            raise ValueError("population cell weights must sum to one")
        expected = self.compute_checksum(self.model_dump(mode="json", exclude={"checksum_sha256"}))
        if self.checksum_sha256 == "0" * 64:
            object.__setattr__(self, "checksum_sha256", expected)
            return self
        if self.checksum_sha256 != expected:
            raise ValueError("population frame checksum mismatch")
        return self

    @staticmethod
    def compute_checksum(payload: Mapping[str, object]) -> str:
        return sha256(canonical_json_dumps(payload)).hexdigest()


class AudienceCriterion(FrozenModel):
    dimension: Key
    allowed_values: tuple[Annotated[str, StringConstraints(min_length=1, max_length=80)], ...] = (
        Field(min_length=1, max_length=50)
    )

    @field_validator("allowed_values")
    @classmethod
    def canonical_values(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(value) != len(set(value)) or tuple(sorted(value)) != value:
            raise ValueError("audience criterion values must be unique and sorted")
        return value


class AudienceDefinitionVersion(FrozenModel):
    id: UUID
    audience_id: UUID
    version: int = Field(ge=1)
    name: Label
    criteria: tuple[AudienceCriterion, ...] = Field(max_length=20)
    minimum_cell_weight: float = Field(default=0.0, ge=0.0, le=1.0)
    provenance_status: Literal["verified", "demo"]
    limitations: tuple[ShortText, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_criteria(self) -> Self:
        dimensions = [criterion.dimension for criterion in self.criteria]
        if len(dimensions) != len(set(dimensions)):
            raise ValueError("audience criteria dimensions must be unique")
        if tuple(sorted(dimensions)) != tuple(dimensions):
            raise ValueError("audience criteria must use canonical order")
        return self

    def admits(self, cell: PopulationCell) -> bool:
        dimensions = cell.dimension_map()
        return cell.weight >= self.minimum_cell_weight and all(
            dimensions.get(criterion.dimension) in criterion.allowed_values
            for criterion in self.criteria
        )


class SamplingConfiguration(FrozenModel):
    sample_size: int = Field(ge=10, le=5000)
    minimum_per_cell: int = Field(default=1, ge=1, le=100)
    maximum_cells: int = Field(default=100, ge=1, le=500)
    seed: int = Field(ge=-(2**63), le=2**63 - 1)
    sparse_cell_threshold: int = Field(default=5, ge=1, le=100)


class SampledCell(FrozenModel):
    key: Key
    population_weight: float = Field(gt=0.0, le=1.0)
    audience_weight: float = Field(gt=0.0, le=1.0)
    sample_count: int = Field(ge=1)
    dimensions: tuple[DimensionValue, ...]


class AudienceSample(FrozenModel):
    population_version_id: UUID
    audience_version_id: UUID
    configuration: SamplingConfiguration
    cells: tuple[SampledCell, ...] = Field(min_length=1)
    excluded_population_weight: float = Field(ge=0.0, lt=1.0)
    checksum_sha256: Sha256


def _rotated_rank(key: str, seed: int) -> bytes:
    return sha256(f"{seed}:{key}".encode()).digest()


def sample_population(
    population: PopulationFrameVersion,
    audience: AudienceDefinitionVersion,
    configuration: SamplingConfiguration,
) -> AudienceSample:
    """Deterministically allocate a bounded sample across eligible weighted cells."""

    eligible = [cell for cell in population.cells if audience.admits(cell)]
    if not eligible:
        raise ValueError("audience definition admits no population cells")
    eligible.sort(key=lambda cell: (-cell.weight, _rotated_rank(cell.key, configuration.seed)))
    eligible = eligible[: configuration.maximum_cells]
    eligible.sort(key=lambda cell: cell.key)
    minimum_required = len(eligible) * configuration.minimum_per_cell
    if configuration.sample_size < minimum_required:
        raise ValueError("sample size cannot satisfy minimum per eligible cell")

    admitted_weight = fsum(cell.weight for cell in eligible)
    normalized = [cell.weight / admitted_weight for cell in eligible]
    remaining = configuration.sample_size - minimum_required
    exact_extras = [weight * remaining for weight in normalized]
    extras = [int(value) for value in exact_extras]
    unallocated = remaining - sum(extras)
    remainder_order = sorted(
        range(len(eligible)),
        key=lambda index: (
            -(exact_extras[index] - extras[index]),
            _rotated_rank(eligible[index].key, configuration.seed),
        ),
    )
    for index in remainder_order[:unallocated]:
        extras[index] += 1

    cells = tuple(
        SampledCell(
            key=cell.key,
            population_weight=cell.weight,
            audience_weight=normalized[index],
            sample_count=configuration.minimum_per_cell + extras[index],
            dimensions=cell.dimensions,
        )
        for index, cell in enumerate(eligible)
    )
    excluded_population_weight = max(0.0, 1.0 - admitted_weight)
    payload = {
        "audience_version_id": str(audience.id),
        "cells": [cell.model_dump(mode="json") for cell in cells],
        "configuration": configuration.model_dump(mode="json"),
        "excluded_population_weight": excluded_population_weight,
        "population_version_id": str(population.id),
    }
    return AudienceSample(
        population_version_id=population.id,
        audience_version_id=audience.id,
        configuration=configuration,
        cells=cells,
        excluded_population_weight=excluded_population_weight,
        checksum_sha256=sha256(canonical_json_dumps(payload)).hexdigest(),
    )


class ReactionShare(FrozenModel):
    key: ReactionKey
    value: float = Field(ge=0.0, le=1.0)


class ReactionDistribution(FrozenModel):
    categories: tuple[ReactionShare, ReactionShare, ReactionShare, ReactionShare]

    @model_validator(mode="after")
    def valid_distribution(self) -> Self:
        keys = tuple(category.key for category in self.categories)
        if keys != ("positive", "neutral", "negative", "mixed"):
            raise ValueError("reaction categories must use canonical order")
        if not isclose(fsum(category.value for category in self.categories), 1.0, abs_tol=1e-9):
            raise ValueError("reaction distribution must sum to one")
        return self

    def values(self) -> tuple[float, float, float, float]:
        return tuple(category.value for category in self.categories)  # type: ignore[return-value]


class MetricScore(FrozenModel):
    key: MetricKey
    value: float = Field(ge=0.0, le=100.0)


class EmotionShare(FrozenModel):
    key: EmotionKey
    value: float = Field(ge=0.0, le=1.0)


class EmotionDistribution(FrozenModel):
    categories: tuple[EmotionShare, EmotionShare, EmotionShare, EmotionShare]

    @model_validator(mode="after")
    def valid_distribution(self) -> Self:
        keys = tuple(category.key for category in self.categories)
        if keys != ("hopeful", "confused", "skeptical", "concerned"):
            raise ValueError("emotion categories must use canonical order")
        if not isclose(fsum(category.value for category in self.categories), 1.0, abs_tol=1e-9):
            raise ValueError("emotion distribution must sum to one")
        return self


class RiskScore(FrozenModel):
    key: RiskKey
    value: float = Field(ge=0.0, le=100.0)


class CohortResponse(FrozenModel):
    cell_key: Key
    sample_count: int = Field(ge=1)
    distribution: ReactionDistribution
    emotions: EmotionDistribution
    metrics: tuple[MetricScore, MetricScore, MetricScore, MetricScore, MetricScore]
    risks: tuple[RiskScore, RiskScore, RiskScore]
    disagreement: float = Field(ge=0.0, le=1.0)
    rationale: Annotated[str, StringConstraints(min_length=1, max_length=1000)]
    rationale_is_synthetic: Literal[True] = True

    @model_validator(mode="after")
    def canonical_metrics(self) -> Self:
        keys = tuple(metric.key for metric in self.metrics)
        if keys != ("clarity", "relevance", "trust", "persuasiveness", "consideration"):
            raise ValueError("response metrics must use canonical order")
        risk_keys = tuple(risk.key for risk in self.risks)
        if risk_keys != ("controversy", "backlash", "cultural"):
            raise ValueError("response risks must use canonical order")
        return self


class ProviderUsage(FrozenModel):
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    cost_microusd: int = Field(ge=0)


class MethodologyProviderRequest(FrozenModel):
    run_id: UUID
    stimulus: Annotated[str, StringConstraints(min_length=1, max_length=5000)]
    sample: AudienceSample
    methodology_version: Key
    response_schema_version: Literal[2] = 2
    cost_ceiling_microusd: int = Field(ge=0, le=100_000_000)


class MethodologyProviderResponse(FrozenModel):
    provider_id: Key
    provider_version: Label
    model_id: Label
    template_id: Key
    responses: tuple[CohortResponse, ...]
    usage: ProviderUsage

    @model_validator(mode="after")
    def unique_cells(self) -> Self:
        keys = [response.cell_key for response in self.responses]
        if len(keys) != len(set(keys)):
            raise ValueError("provider responses must have unique cell keys")
        return self


class MethodologyProvider(Protocol):
    def run(self, request: MethodologyProviderRequest) -> MethodologyProviderResponse: ...


def _distribution_from_basis_points(values: Sequence[int]) -> ReactionDistribution:
    total = sum(values)
    shares = [value / total for value in values]
    shares[-1] = 1.0 - fsum(shares[:-1])
    keys: tuple[ReactionKey, ...] = ("positive", "neutral", "negative", "mixed")
    return ReactionDistribution(
        categories=tuple(  # type: ignore[arg-type]
            ReactionShare(key=key, value=shares[index]) for index, key in enumerate(keys)
        )
    )


class DeterministicCohortProvider(MethodologyProvider):
    """Zero-cost provider used for exact repeatability and property tests."""

    def run(self, request: MethodologyProviderRequest) -> MethodologyProviderResponse:
        responses: list[CohortResponse] = []
        for cell in request.sample.cells:
            digest = sha256(
                canonical_json_dumps(
                    {
                        "cell": cell.model_dump(mode="json"),
                        "methodology_version": request.methodology_version,
                        "schema_version": request.response_schema_version,
                        "seed": request.sample.configuration.seed,
                        "stimulus": request.stimulus,
                    }
                )
            ).digest()
            basis = [1200 + digest[0], 900 + digest[1], 700 + digest[2], 500 + digest[3]]
            metric_keys: tuple[MetricKey, ...] = (
                "clarity",
                "relevance",
                "trust",
                "persuasiveness",
                "consideration",
            )
            metrics = tuple(
                MetricScore(key=key, value=float(30 + digest[index + 4] % 61))
                for index, key in enumerate(metric_keys)
            )
            distribution = _distribution_from_basis_points(basis)
            emotions = EmotionDistribution(
                categories=(
                    EmotionShare(key="hopeful", value=distribution.categories[0].value),
                    EmotionShare(key="confused", value=distribution.categories[1].value),
                    EmotionShare(key="skeptical", value=distribution.categories[2].value),
                    EmotionShare(key="concerned", value=distribution.categories[3].value),
                )
            )
            risks = (
                RiskScore(key="controversy", value=float(20 + digest[9] % 61)),
                RiskScore(key="backlash", value=float(20 + digest[10] % 61)),
                RiskScore(key="cultural", value=float(20 + digest[11] % 61)),
            )
            responses.append(
                CohortResponse(
                    cell_key=cell.key,
                    sample_count=cell.sample_count,
                    distribution=distribution,
                    emotions=emotions,
                    metrics=metrics,  # type: ignore[arg-type]
                    risks=risks,
                    disagreement=1.0 - max(distribution.values()),
                    rationale=(
                        "Synthetic cohort diagnostic generated by deterministic fixture; "
                        "verify interpretation with human research."
                    ),
                )
            )
        return MethodologyProviderResponse(
            provider_id="deterministic_cohort",
            provider_version="1",
            model_id="deterministic_cohort_fixture_v1",
            template_id="phase3_cohort_v1",
            responses=tuple(responses),
            usage=ProviderUsage(input_tokens=0, output_tokens=0, cost_microusd=0),
        )


class ExternalProviderPricing(FrozenModel):
    input_microusd_per_million_tokens: int = Field(ge=0)
    output_microusd_per_million_tokens: int = Field(ge=0)
    maximum_input_tokens: int = Field(ge=1, le=1_000_000)
    maximum_output_tokens: int = Field(ge=1, le=1_000_000)


ProviderTransport = Callable[[dict[str, object]], Mapping[str, object]]


class ExternalStructuredProviderAdapter(MethodologyProvider):
    """Schema-constrained adapter around an explicitly injected real-provider transport.

    Network ownership, credentials, retries, and timeout live in the injected transport.
    This adapter owns minimization, schema validation, identity binding, and cost limits.
    """

    def __init__(
        self,
        *,
        provider_id: Key,
        provider_version: str,
        model_id: str,
        template_id: Key,
        pricing: ExternalProviderPricing,
        transport: ProviderTransport,
    ) -> None:
        self.provider_id = provider_id
        self.provider_version = provider_version
        self.model_id = model_id
        self.template_id = template_id
        self.pricing = pricing
        self.transport = transport

    def run(self, request: MethodologyProviderRequest) -> MethodologyProviderResponse:
        minimized = {
            "request_id": str(request.run_id),
            "stimulus": request.stimulus,
            "methodology_version": request.methodology_version,
            "response_schema_version": request.response_schema_version,
            "cohorts": [
                {
                    "cell_key": cell.key,
                    "dimensions": [
                        dimension.model_dump(mode="json") for dimension in cell.dimensions
                    ],
                    "sample_count": cell.sample_count,
                }
                for cell in request.sample.cells
            ],
        }
        estimated_input_tokens = max(1, len(canonical_json_dumps(minimized)) // 4)
        if estimated_input_tokens > self.pricing.maximum_input_tokens:
            raise ValueError("provider input token ceiling exceeded")
        estimated_cost = (
            estimated_input_tokens * self.pricing.input_microusd_per_million_tokens
            + self.pricing.maximum_output_tokens * self.pricing.output_microusd_per_million_tokens
        ) // 1_000_000
        if estimated_cost > request.cost_ceiling_microusd:
            raise ValueError("provider estimated cost ceiling exceeded")

        raw = self.transport(minimized)
        response = MethodologyProviderResponse.model_validate(raw)
        if (
            response.provider_id != self.provider_id
            or response.provider_version != self.provider_version
            or response.model_id != self.model_id
            or response.template_id != self.template_id
        ):
            raise ValueError("provider response identity mismatch")
        if response.usage.input_tokens > self.pricing.maximum_input_tokens:
            raise ValueError("provider input usage ceiling exceeded")
        if response.usage.output_tokens > self.pricing.maximum_output_tokens:
            raise ValueError("provider output usage ceiling exceeded")
        computed_cost = (
            response.usage.input_tokens * self.pricing.input_microusd_per_million_tokens
            + response.usage.output_tokens * self.pricing.output_microusd_per_million_tokens
        ) // 1_000_000
        if response.usage.cost_microusd != computed_cost:
            raise ValueError("provider cost does not match approved pricing")
        if computed_cost > request.cost_ceiling_microusd:
            raise ValueError("provider actual cost ceiling exceeded")
        expected_cells = {cell.key for cell in request.sample.cells}
        actual_cells = {item.cell_key for item in response.responses}
        if actual_cells != expected_cells:
            raise ValueError("provider response cohort coverage mismatch")
        return response


class UncertaintyComponent(FrozenModel):
    name: UncertaintyComponentName
    status: Literal["not_estimated", "diagnostic", "suppressed"]
    detail: ShortText
    value: float | None = None

    @model_validator(mode="after")
    def value_matches_status(self) -> Self:
        if (self.status == "diagnostic") != (self.value is not None):
            raise ValueError("only diagnostic uncertainty components carry a value")
        return self


class AggregateReport(FrozenModel):
    distribution: ReactionDistribution
    emotions: EmotionDistribution
    metrics: tuple[MetricScore, MetricScore, MetricScore, MetricScore, MetricScore]
    risks: tuple[RiskScore, RiskScore, RiskScore]
    disagreement: float = Field(ge=0.0, le=1.0)
    effective_sample_size: float = Field(gt=0.0)
    included_cells: tuple[Key, ...]
    suppressed_cells: tuple[Key, ...]
    uncertainty: tuple[UncertaintyComponent, ...]
    limitations: tuple[ShortText, ...]


def aggregate_cohort_responses(
    sample: AudienceSample,
    responses: Sequence[CohortResponse],
) -> AggregateReport:
    response_by_key = {response.cell_key: response for response in responses}
    if set(response_by_key) != {cell.key for cell in sample.cells}:
        raise ValueError("response cohort coverage mismatch")
    included = [
        cell
        for cell in sample.cells
        if cell.sample_count >= sample.configuration.sparse_cell_threshold
    ]
    suppressed = [
        cell.key
        for cell in sample.cells
        if cell.sample_count < sample.configuration.sparse_cell_threshold
    ]
    if not included:
        raise ValueError("every cohort is below sparse-cell threshold")
    included_weight = fsum(cell.audience_weight for cell in included)
    weights = [cell.audience_weight / included_weight for cell in included]
    category_values = []
    for category_index in range(4):
        category_values.append(
            fsum(
                weights[index]
                * response_by_key[cell.key].distribution.categories[category_index].value
                for index, cell in enumerate(included)
            )
        )
    category_values[-1] = 1.0 - fsum(category_values[:-1])
    distribution = ReactionDistribution(
        categories=(
            ReactionShare(key="positive", value=category_values[0]),
            ReactionShare(key="neutral", value=category_values[1]),
            ReactionShare(key="negative", value=category_values[2]),
            ReactionShare(key="mixed", value=category_values[3]),
        )
    )
    emotion_keys: tuple[EmotionKey, ...] = ("hopeful", "confused", "skeptical", "concerned")
    emotion_values = []
    for emotion_index in range(4):
        emotion_values.append(
            fsum(
                weights[index] * response_by_key[cell.key].emotions.categories[emotion_index].value
                for index, cell in enumerate(included)
            )
        )
    emotion_values[-1] = 1.0 - fsum(emotion_values[:-1])
    emotions = EmotionDistribution(
        categories=tuple(  # type: ignore[arg-type]
            EmotionShare(key=key, value=emotion_values[index])
            for index, key in enumerate(emotion_keys)
        )
    )
    metric_keys: tuple[MetricKey, ...] = (
        "clarity",
        "relevance",
        "trust",
        "persuasiveness",
        "consideration",
    )
    metrics = tuple(
        MetricScore(
            key=key,
            value=fsum(
                weights[index] * response_by_key[cell.key].metrics[metric_index].value
                for index, cell in enumerate(included)
            ),
        )
        for metric_index, key in enumerate(metric_keys)
    )
    risk_keys: tuple[RiskKey, ...] = ("controversy", "backlash", "cultural")
    risks = tuple(
        RiskScore(
            key=key,
            value=fsum(
                weights[index] * response_by_key[cell.key].risks[risk_index].value
                for index, cell in enumerate(included)
            ),
        )
        for risk_index, key in enumerate(risk_keys)
    )
    effective_sample_size = 1.0 / fsum(weight * weight for weight in weights)
    disagreement = fsum(
        weights[index] * response_by_key[cell.key].disagreement
        for index, cell in enumerate(included)
    )
    uncertainty = (
        UncertaintyComponent(
            name="frame_coverage",
            status="diagnostic",
            detail="Share of source frame excluded by audience filters or cell cap.",
            value=sample.excluded_population_weight,
        ),
        UncertaintyComponent(
            name="sampling",
            status="not_estimated",
            detail="Synthetic cohort allocation does not justify a population uncertainty range.",
        ),
        UncertaintyComponent(
            name="measurement",
            status="not_estimated",
            detail="No eligible human measurement instrument is attached.",
        ),
        UncertaintyComponent(
            name="model",
            status="not_estimated",
            detail="Model error is unbenchmarked for this configuration.",
        ),
        UncertaintyComponent(
            name="held_out_adjustment",
            status="not_estimated",
            detail="No approved held-out adjustment artifact is attached.",
        ),
        UncertaintyComponent(
            name="run_stability",
            status="not_estimated",
            detail="Use repeated-run evaluation before interpreting stability.",
        ),
        UncertaintyComponent(
            name="missingness",
            status="diagnostic",
            detail="Share of admitted cohort weight suppressed by minimum sample rules.",
            value=1.0 - included_weight,
        ),
        UncertaintyComponent(
            name="dataset_shift",
            status="not_estimated",
            detail="No current ground-truth stream exists for dataset-shift estimation.",
        ),
    )
    return AggregateReport(
        distribution=distribution,
        emotions=emotions,
        metrics=metrics,  # type: ignore[arg-type]
        risks=risks,  # type: ignore[arg-type]
        disagreement=disagreement,
        effective_sample_size=effective_sample_size,
        included_cells=tuple(cell.key for cell in included),
        suppressed_cells=tuple(suppressed),
        uncertainty=uncertainty,
        limitations=(EXPERIMENTAL_LIMITATION,),
    )


class ReproducibilityReceipt(FrozenModel):
    methodology_version: Key
    population_checksum_sha256: Sha256
    audience_version_id: UUID
    sampling_checksum_sha256: Sha256
    provider_id: Key
    provider_version: Label
    model_id: Label
    template_id: Key
    input_sha256: Sha256
    output_sha256: Sha256
    seed: int


class MethodologyRunResult(FrozenModel):
    schema_version: Literal[2] = 2
    run_id: UUID
    validation_label: Literal["experimental", "benchmarked", "calibrated"]
    sample: AudienceSample
    cohort_responses: tuple[CohortResponse, ...]
    report: AggregateReport
    usage: ProviderUsage
    reproducibility: ReproducibilityReceipt


class MethodologyEngine:
    def __init__(self, provider: MethodologyProvider) -> None:
        self.provider = provider

    def run(
        self,
        *,
        run_id: UUID,
        stimulus: str,
        population: PopulationFrameVersion,
        audience: AudienceDefinitionVersion,
        configuration: SamplingConfiguration,
        methodology_version: Key,
        cost_ceiling_microusd: int,
    ) -> MethodologyRunResult:
        sample = sample_population(population, audience, configuration)
        request = MethodologyProviderRequest(
            run_id=run_id,
            stimulus=stimulus,
            sample=sample,
            methodology_version=methodology_version,
            cost_ceiling_microusd=cost_ceiling_microusd,
        )
        response = self.provider.run(request)
        if response.usage.cost_microusd > cost_ceiling_microusd:
            raise ValueError("provider cost ceiling exceeded")
        report = aggregate_cohort_responses(sample, response.responses)
        input_sha256 = sha256(canonical_json_dumps(request.model_dump(mode="json"))).hexdigest()
        output_payload = {
            "cohort_responses": [item.model_dump(mode="json") for item in response.responses],
            "report": report.model_dump(mode="json"),
            "usage": response.usage.model_dump(mode="json"),
        }
        output_sha256 = sha256(canonical_json_dumps(output_payload)).hexdigest()
        return MethodologyRunResult(
            run_id=run_id,
            validation_label="experimental",
            sample=sample,
            cohort_responses=response.responses,
            report=report,
            usage=response.usage,
            reproducibility=ReproducibilityReceipt(
                methodology_version=methodology_version,
                population_checksum_sha256=population.checksum_sha256,
                audience_version_id=audience.id,
                sampling_checksum_sha256=sample.checksum_sha256,
                provider_id=response.provider_id,
                provider_version=response.provider_version,
                model_id=response.model_id,
                template_id=response.template_id,
                input_sha256=input_sha256,
                output_sha256=output_sha256,
                seed=configuration.seed,
            ),
        )


class EvaluationCase(FrozenModel):
    case_id: Key
    predicted: ReactionDistribution
    observed: ReactionDistribution
    slice_key: Key = "overall"


class EvaluationSlice(FrozenModel):
    slice_key: Key
    case_count: int = Field(ge=1)
    mean_absolute_error: float = Field(ge=0.0, le=1.0)
    brier_score: float = Field(ge=0.0, le=2.0)
    maximum_absolute_error: float = Field(ge=0.0, le=1.0)


class EvaluationReport(FrozenModel):
    methodology_version: Key
    benchmark_checksum_sha256: Sha256
    case_count: int = Field(ge=1)
    overall: EvaluationSlice
    slices: tuple[EvaluationSlice, ...]
    promotion_eligible: Literal[False] = False
    limitations: tuple[ShortText, ...]


class EvaluationHarness:
    """Held-out distribution evaluator. Threshold approval remains external governance."""

    @staticmethod
    def _slice(slice_key: Key, cases: Sequence[EvaluationCase]) -> EvaluationSlice:
        absolute_errors: list[float] = []
        brier_terms: list[float] = []
        for case in cases:
            predicted = case.predicted.values()
            observed = case.observed.values()
            absolute_errors.extend(
                abs(left - right) for left, right in zip(predicted, observed, strict=True)
            )
            brier_terms.append(
                fsum((left - right) ** 2 for left, right in zip(predicted, observed, strict=True))
            )
        return EvaluationSlice(
            slice_key=slice_key,
            case_count=len(cases),
            mean_absolute_error=fsum(absolute_errors) / len(absolute_errors),
            brier_score=fsum(brier_terms) / len(brier_terms),
            maximum_absolute_error=max(absolute_errors),
        )

    def evaluate(
        self,
        *,
        methodology_version: Key,
        benchmark_checksum_sha256: Sha256,
        cases: Sequence[EvaluationCase],
    ) -> EvaluationReport:
        if not cases:
            raise ValueError("evaluation requires at least one held-out case")
        ids = [case.case_id for case in cases]
        if len(ids) != len(set(ids)):
            raise ValueError("evaluation case ids must be unique")
        grouped: dict[Key, list[EvaluationCase]] = {}
        for case in cases:
            grouped.setdefault(case.slice_key, []).append(case)
        return EvaluationReport(
            methodology_version=methodology_version,
            benchmark_checksum_sha256=benchmark_checksum_sha256,
            case_count=len(cases),
            overall=self._slice("overall", cases),
            slices=tuple(self._slice(key, grouped[key]) for key in sorted(grouped)),
            promotion_eligible=False,
            limitations=(
                "Metrics cover only this immutable benchmark and do not prove transfer.",
                "Promotion requires prespecified thresholds and independent review.",
            ),
        )
