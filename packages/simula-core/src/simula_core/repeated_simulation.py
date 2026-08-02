"""Repeated, seeded methodology runs with explicit stability diagnostics.

This module summarizes variation across synthetic runs. The interval fields are
repeat-dispersion diagnostics; they are not population estimates and must not be
presented as human evidence without observed-survey comparison or backtesting.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from hashlib import sha256
from math import fsum, sqrt
from typing import Literal, Self
from uuid import UUID, uuid5

from pydantic import Field, model_validator

from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import (
    EXPERIMENTAL_LIMITATION,
    AudienceDefinitionVersion,
    FrozenModel,
    Key,
    MethodologyEngine,
    MethodologyRunResult,
    PopulationFrameVersion,
    SamplingConfiguration,
    Sha256,
)

RepeatMetricKey = Literal[
    "clarity",
    "relevance",
    "trust",
    "persuasiveness",
    "consideration",
]
RepeatShareKey = Literal["positive_share"]
StabilityLabel = Literal["stable", "unstable", "insufficient_repetitions"]


class RepeatedSimulationConfiguration(FrozenModel):
    """Controls independent seeded repetitions of one frozen methodology input."""

    repetition_count: int = Field(ge=1, le=500)
    base_seed: int = Field(ge=-(2**63), le=2**63 - 1)
    stability_tolerance: float = Field(gt=0.0, le=100.0)


class RepeatedValueSummary(FrozenModel):
    key: RepeatMetricKey
    mean: float = Field(ge=0.0, le=100.0)
    median: float = Field(ge=0.0, le=100.0)
    standard_deviation: float = Field(ge=0.0, le=100.0)
    confidence_interval_low: float = Field(ge=0.0, le=100.0)
    confidence_interval_high: float = Field(ge=0.0, le=100.0)


class RepeatedShareSummary(FrozenModel):
    key: RepeatShareKey
    mean: float = Field(ge=0.0, le=1.0)
    median: float = Field(ge=0.0, le=1.0)
    standard_deviation: float = Field(ge=0.0, le=1.0)
    confidence_interval_low: float = Field(ge=0.0, le=1.0)
    confidence_interval_high: float = Field(ge=0.0, le=1.0)


class RepeatedVariantRankSummary(FrozenModel):
    variant_key: Key
    mean_rank: float = Field(ge=1.0, le=500.0)
    top_rank_probability: float = Field(ge=0.0, le=1.0)


class RepeatedVariantRankingResult(FrozenModel):
    schema_version: Literal[1] = 1
    metric_key: RepeatMetricKey
    repetition_count: int = Field(ge=1, le=500)
    top_rank_threshold: float = Field(ge=0.5, le=1.0)
    variants: tuple[RepeatedVariantRankSummary, ...] = Field(min_length=2, max_length=500)
    pairwise_rank_agreement: float = Field(ge=0.0, le=1.0)
    top_variant_key: Key | None = None
    stability_label: StabilityLabel
    limitations: tuple[str, ...] = Field(min_length=1, max_length=20)


class RepeatedMethodologyResult(FrozenModel):
    schema_version: Literal[1] = 1
    methodology_version: Key
    population_checksum_sha256: Sha256
    audience_version_id: UUID
    base_seed: int = Field(ge=-(2**63), le=2**63 - 1)
    repetition_count: int = Field(ge=1, le=500)
    runs: tuple[MethodologyRunResult, ...] = Field(min_length=1, max_length=500)
    metric_summaries: tuple[
        RepeatedValueSummary,
        RepeatedValueSummary,
        RepeatedValueSummary,
        RepeatedValueSummary,
        RepeatedValueSummary,
    ]
    positive_share: RepeatedShareSummary
    stability_label: StabilityLabel
    max_interval_half_width: float = Field(ge=0.0, le=100.0)
    evidence_status: Literal["Synthetic-only"] = "Synthetic-only"
    limitations: tuple[str, ...] = Field(min_length=1, max_length=20)
    reproducibility_checksum_sha256: Sha256 = "0" * 64

    @model_validator(mode="after")
    def validate_repetitions(self) -> Self:
        if len(self.runs) != self.repetition_count:
            raise ValueError("repetition count must match returned runs")
        if len({run.run_id for run in self.runs}) != len(self.runs):
            raise ValueError("repeated runs must have unique run ids")
        if len({run.reproducibility.seed for run in self.runs}) != len(self.runs):
            raise ValueError("repeated runs must have unique seeds")
        if any(
            run.reproducibility.population_checksum_sha256 != self.population_checksum_sha256
            for run in self.runs
        ):
            raise ValueError("repeated runs must use one population frame")
        return self


def _derived_seed(base_seed: int, repetition_index: int) -> int:
    digest = sha256(f"simula-repeat-v1:{base_seed}:{repetition_index}".encode()).digest()
    return int.from_bytes(digest[:8], byteorder="big", signed=True)


def _summary(key: RepeatMetricKey, values: Sequence[float]) -> RepeatedValueSummary:
    if not values:
        raise ValueError("cannot summarize an empty repetition set")
    mean = fsum(values) / len(values)
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    median = (
        ordered[midpoint] if len(ordered) % 2 else (ordered[midpoint - 1] + ordered[midpoint]) / 2
    )
    variance = fsum((value - mean) ** 2 for value in values) / len(values)
    standard_deviation = sqrt(max(0.0, variance))
    half_width = 1.96 * standard_deviation / sqrt(len(values)) if len(values) > 1 else 0.0
    return RepeatedValueSummary(
        key=key,
        mean=mean,
        median=median,
        standard_deviation=standard_deviation,
        confidence_interval_low=max(0.0, mean - half_width),
        confidence_interval_high=min(100.0, mean + half_width),
    )


def _share_summary(values: Sequence[float]) -> RepeatedShareSummary:
    if not values:
        raise ValueError("cannot summarize an empty repetition set")
    mean = fsum(values) / len(values)
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    median = (
        ordered[midpoint] if len(ordered) % 2 else (ordered[midpoint - 1] + ordered[midpoint]) / 2
    )
    variance = fsum((value - mean) ** 2 for value in values) / len(values)
    standard_deviation = sqrt(max(0.0, variance))
    half_width = 1.96 * standard_deviation / sqrt(len(values)) if len(values) > 1 else 0.0
    return RepeatedShareSummary(
        key="positive_share",
        mean=mean,
        median=median,
        standard_deviation=standard_deviation,
        confidence_interval_low=max(0.0, mean - half_width),
        confidence_interval_high=min(1.0, mean + half_width),
    )


def summarize_variant_ranking(
    *,
    metric_key: RepeatMetricKey,
    values_by_variant: Mapping[str, Sequence[float]],
    top_rank_threshold: float = 0.8,
) -> RepeatedVariantRankingResult:
    """Measure how often each variant ranks first across matched repetitions."""

    if len(values_by_variant) < 2:
        raise ValueError("variant ranking requires at least two variants")
    if len(values_by_variant) > 500:
        raise ValueError("variant ranking exceeds the maximum variant count")
    if not 0.5 <= top_rank_threshold <= 1.0:
        raise ValueError("top rank threshold must be between 0.5 and 1")
    variant_keys = tuple(sorted(values_by_variant))
    repetition_counts = {len(values_by_variant[key]) for key in variant_keys}
    if len(repetition_counts) != 1 or not repetition_counts or not next(iter(repetition_counts)):
        raise ValueError("all variants must have the same non-empty repetition count")
    repetition_count = next(iter(repetition_counts))
    if repetition_count > 500:
        raise ValueError("variant ranking exceeds the maximum repetition count")

    rank_totals = {key: 0.0 for key in variant_keys}
    top_probabilities = {key: 0.0 for key in variant_keys}
    pairwise_agreements: list[float] = []
    for repetition_index in range(repetition_count):
        values = {key: float(values_by_variant[key][repetition_index]) for key in variant_keys}
        ordered = sorted(values.items(), key=lambda item: (-item[1], item[0]))
        cursor = 0
        while cursor < len(ordered):
            end = cursor + 1
            while end < len(ordered) and ordered[end][1] == ordered[cursor][1]:
                end += 1
            average_rank = (cursor + 1 + end) / 2
            for index in range(cursor, end):
                rank_totals[ordered[index][0]] += average_rank
            cursor = end
        top_value = ordered[0][1]
        top_keys = [key for key, value in ordered if value == top_value]
        for key in top_keys:
            top_probabilities[key] += 1.0 / len(top_keys)

        for index, first in enumerate(variant_keys):
            for second in variant_keys[index + 1 :]:
                difference = values[first] - values[second]
                pairwise_agreements.append(
                    1.0 if difference > 0 else 0.0 if difference < 0 else 0.5
                )

    pairwise_rank_agreement = 0.0
    if pairwise_agreements:
        pairwise_by_pair: list[float] = []
        pair_count = len(variant_keys) * (len(variant_keys) - 1) // 2
        for pair_index in range(pair_count):
            observations = pairwise_agreements[pair_index::pair_count]
            direction = fsum(observations) / len(observations)
            pairwise_by_pair.append(max(direction, 1.0 - direction))
        pairwise_rank_agreement = fsum(pairwise_by_pair) / len(pairwise_by_pair)
    candidate_top_variant_key = max(
        variant_keys,
        key=lambda key: (top_probabilities[key], -variant_keys.index(key)),
    )
    top_probability = top_probabilities[candidate_top_variant_key] / repetition_count
    top_variant_key: str | None = (
        candidate_top_variant_key if top_probability >= top_rank_threshold else None
    )
    if repetition_count < 3:
        stability_label: StabilityLabel = "insufficient_repetitions"
    elif top_variant_key is not None and pairwise_rank_agreement >= top_rank_threshold:
        stability_label = "stable"
    else:
        stability_label = "unstable"
    return RepeatedVariantRankingResult(
        metric_key=metric_key,
        repetition_count=repetition_count,
        top_rank_threshold=top_rank_threshold,
        variants=tuple(
            RepeatedVariantRankSummary(
                variant_key=key,
                mean_rank=rank_totals[key] / repetition_count,
                top_rank_probability=top_probabilities[key] / repetition_count,
            )
            for key in variant_keys
        ),
        pairwise_rank_agreement=pairwise_rank_agreement,
        top_variant_key=top_variant_key,
        stability_label=stability_label,
        limitations=(
            "Ranking stability describes repeated synthetic runs; it is not evidence of human "
            "preference or electoral outcome.",
            "Ties receive fractional top-rank probability and half-credit in pairwise direction "
            "checks.",
        ),
    )


def run_repeated_methodology(
    engine: MethodologyEngine,
    *,
    run_group_id: UUID,
    stimulus: str,
    population: PopulationFrameVersion,
    audience: AudienceDefinitionVersion,
    configuration: SamplingConfiguration,
    methodology_version: Key,
    cost_ceiling_microusd: int,
    repetition_configuration: RepeatedSimulationConfiguration,
) -> RepeatedMethodologyResult:
    """Run one frozen input repeatedly with derived seeds and summarize dispersion."""

    runs: list[MethodologyRunResult] = []
    for repetition_index in range(repetition_configuration.repetition_count):
        seed = _derived_seed(repetition_configuration.base_seed, repetition_index)
        run_configuration = configuration.model_copy(update={"seed": seed})
        runs.append(
            engine.run(
                run_id=uuid5(run_group_id, f"repetition:{repetition_index}:seed:{seed}"),
                stimulus=stimulus,
                population=population,
                audience=audience,
                configuration=run_configuration,
                methodology_version=methodology_version,
                cost_ceiling_microusd=cost_ceiling_microusd,
            )
        )

    metric_keys: tuple[RepeatMetricKey, ...] = (
        "clarity",
        "relevance",
        "trust",
        "persuasiveness",
        "consideration",
    )
    metric_summaries = tuple(
        _summary(
            key,
            [
                next(metric.value for metric in run.report.metrics if metric.key == key)
                for run in runs
            ],
        )
        for key in metric_keys
    )
    positive_share = _share_summary([run.report.distribution.categories[0].value for run in runs])
    max_interval_half_width = max(
        [
            max(
                summary.mean - summary.confidence_interval_low,
                summary.confidence_interval_high - summary.mean,
            )
            for summary in metric_summaries
        ]
        + [
            100
            * max(
                positive_share.mean - positive_share.confidence_interval_low,
                positive_share.confidence_interval_high - positive_share.mean,
            )
        ]
    )
    if repetition_configuration.repetition_count < 3:
        stability_label: StabilityLabel = "insufficient_repetitions"
    elif max_interval_half_width <= repetition_configuration.stability_tolerance:
        stability_label = "stable"
    else:
        stability_label = "unstable"

    result = RepeatedMethodologyResult(
        methodology_version=methodology_version,
        population_checksum_sha256=population.checksum_sha256,
        audience_version_id=audience.id,
        base_seed=repetition_configuration.base_seed,
        repetition_count=repetition_configuration.repetition_count,
        runs=tuple(runs),
        metric_summaries=metric_summaries,  # type: ignore[arg-type]
        positive_share=positive_share,
        stability_label=stability_label,
        max_interval_half_width=max_interval_half_width,
        limitations=(
            EXPERIMENTAL_LIMITATION,
            "Repeat interval is a Monte Carlo stability diagnostic, not a population estimate.",
            "No consented survey comparison or held-out historical outcome evidence is attached.",
        ),
    )
    checksum = sha256(
        canonical_json_dumps(
            result.model_dump(mode="json", exclude={"reproducibility_checksum_sha256"})
        )
    ).hexdigest()
    return result.model_copy(update={"reproducibility_checksum_sha256": checksum})
