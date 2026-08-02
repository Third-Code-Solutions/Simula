"""Aggregate observed-survey comparison contracts for the campaign simulation lab.

Only aggregate, consented observations are accepted. Observed-survey comparison measures
agreement with observed survey data; it does not tune the model or manufacture a
single campaign score.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from hashlib import sha256
from math import fsum, isclose, sqrt
from typing import Literal, Self, cast

from pydantic import Field, model_validator

from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import (
    FrozenModel,
    Key,
    Label,
    MetricKey,
    MetricScore,
    ReactionDistribution,
    ReactionKey,
    ReactionShare,
    Sha256,
    ShortText,
)
from simula_core.repeated_simulation import RepeatedMethodologyResult

CalibrationStatus = Literal[
    "Synthetic-only",
    "Partially calibrated",
    "Survey-calibrated",
    "Historically backtested",
    "Insufficient evidence",
]

METRIC_KEYS: tuple[MetricKey, ...] = (
    "clarity",
    "relevance",
    "trust",
    "persuasiveness",
    "consideration",
)


class SurveyProvenance(FrozenModel):
    evidence_class: Literal["observed_survey"] = "observed_survey"
    source_id: Key
    source_version: Label
    owner: Label
    license: Label
    allowed_uses: tuple[ShortText, ...] = Field(min_length=1)
    collection_period: ShortText
    geography: Label
    methodology: ShortText
    consent_recorded: bool
    authorized_for_calibration: bool
    quality_filter_version: Key
    sample_size: int = Field(ge=1)
    checksum_sha256: Sha256
    known_biases: tuple[ShortText, ...] = Field(min_length=1)
    coverage_limitations: tuple[ShortText, ...] = Field(min_length=1)


class SurveyVariantObservation(FrozenModel):
    variant_key: Key
    cohort_key: Key
    respondent_count: int = Field(ge=1)
    post_stratification_weight: float = Field(gt=0.0)
    reaction_distribution: ReactionDistribution
    metrics: tuple[MetricScore, MetricScore, MetricScore, MetricScore, MetricScore]
    share_intent: float | None = Field(default=None, ge=0.0, le=1.0)
    quality_pass_rate: float = Field(default=1.0, gt=0.0, le=1.0)

    @model_validator(mode="after")
    def canonical_metrics(self) -> Self:
        if tuple(metric.key for metric in self.metrics) != METRIC_KEYS:
            raise ValueError("survey metrics must use canonical order")
        return self


class SurveyDataset(FrozenModel):
    provenance: SurveyProvenance
    observations: tuple[SurveyVariantObservation, ...] = Field(min_length=1, max_length=100_000)

    @model_validator(mode="after")
    def unique_variant_cohorts(self) -> Self:
        keys = [(item.variant_key, item.cohort_key) for item in self.observations]
        if len(keys) != len(set(keys)):
            raise ValueError("survey variant/cohort observations must be unique")
        return self


class SyntheticVariantObservation(FrozenModel):
    variant_key: Key
    cohort_key: Key
    population_weight: float = Field(gt=0.0, le=1.0)
    effective_sample_size: float = Field(gt=0.0)
    distribution: ReactionDistribution
    metrics: tuple[MetricScore, MetricScore, MetricScore, MetricScore, MetricScore]

    @model_validator(mode="after")
    def canonical_metrics(self) -> Self:
        if tuple(metric.key for metric in self.metrics) != METRIC_KEYS:
            raise ValueError("synthetic metrics must use canonical order")
        return self


class SurveyCalibrationComparison(FrozenModel):
    variant_key: Key
    matched_cohort_count: int = Field(ge=1)
    synthetic_effective_sample_size: float = Field(gt=0.0)
    survey_effective_respondents: float = Field(gt=0.0)
    distribution_total_variation_distance: float = Field(ge=0.0, le=1.0)
    distribution_brier_score: float = Field(ge=0.0, le=1.0)
    metric_mae: float = Field(ge=0.0, le=100.0)
    metric_rmse: float = Field(ge=0.0, le=100.0)
    synthetic_positive_share: float = Field(ge=0.0, le=1.0)
    survey_positive_share: float = Field(ge=0.0, le=1.0)


class SurveyCalibrationResult(FrozenModel):
    schema_version: Literal[1] = 1
    status: CalibrationStatus
    survey_source_id: Key
    survey_source_version: Label
    matched_observations: int = Field(ge=0)
    matched_variants: int = Field(ge=0)
    comparisons: tuple[SurveyCalibrationComparison, ...]
    aggregate_distribution_total_variation_distance: float | None = Field(
        default=None, ge=0.0, le=1.0
    )
    aggregate_metric_mae: float | None = Field(default=None, ge=0.0, le=100.0)
    aggregate_metric_rmse: float | None = Field(default=None, ge=0.0, le=100.0)
    variant_rank_correlation: float | None = Field(default=None, ge=-1.0, le=1.0)
    pairwise_rank_agreement: float | None = Field(default=None, ge=0.0, le=1.0)
    limitations: tuple[ShortText, ...] = Field(min_length=1, max_length=20)
    reproducibility_checksum_sha256: Sha256 = "0" * 64


@dataclass(frozen=True)
class _Aggregate:
    distribution: tuple[float, float, float, float]
    metrics: tuple[float, float, float, float, float]
    effective_sample_size: float
    effective_observations: float


def _aggregate(
    observations: Sequence[tuple[float, ReactionDistribution, tuple[MetricScore, ...], float]],
) -> _Aggregate:
    if not observations:
        raise ValueError("cannot aggregate an empty observed-survey panel")
    total_weight = fsum(item[0] for item in observations)
    weights = [item[0] / total_weight for item in observations]
    distribution_values = [
        fsum(
            weight * item[1].categories[index].value
            for weight, item in zip(weights, observations, strict=True)
        )
        for index in range(4)
    ]
    distribution_values[-1] = 1.0 - fsum(distribution_values[:-1])
    metric_values = tuple(
        fsum(
            weight * item[2][index].value
            for weight, item in zip(weights, observations, strict=True)
        )
        for index in range(5)
    )
    effective_sample_size = 1.0 / fsum(weight * weight for weight in weights)
    effective_observations = fsum(item[3] for item in observations)
    return _Aggregate(
        distribution=tuple(distribution_values),  # type: ignore[arg-type]
        metrics=cast(tuple[float, float, float, float, float], metric_values),
        effective_sample_size=effective_sample_size,
        effective_observations=effective_observations,
    )


def _distribution(values: tuple[float, float, float, float]) -> ReactionDistribution:
    reaction_keys: tuple[ReactionKey, ...] = (
        "positive",
        "neutral",
        "negative",
        "mixed",
    )
    return ReactionDistribution(
        categories=tuple(  # type: ignore[arg-type]
            ReactionShare(key=key, value=value)
            for key, value in zip(reaction_keys, values, strict=True)
        )
    )


def _rank_map(values: Mapping[str, float]) -> dict[str, float]:
    ordered = sorted(values.items(), key=lambda item: (-item[1], item[0]))
    ranks: dict[str, float] = {}
    cursor = 0
    while cursor < len(ordered):
        end = cursor + 1
        while end < len(ordered) and isclose(ordered[end][1], ordered[cursor][1], abs_tol=1e-12):
            end += 1
        average_rank = (cursor + 1 + end) / 2
        for index in range(cursor, end):
            ranks[ordered[index][0]] = average_rank
        cursor = end
    return ranks


def _pearson(left: Mapping[str, float], right: Mapping[str, float]) -> float | None:
    keys = tuple(sorted(set(left) & set(right)))
    if len(keys) < 2:
        return None
    left_mean = fsum(left[key] for key in keys) / len(keys)
    right_mean = fsum(right[key] for key in keys) / len(keys)
    numerator = fsum((left[key] - left_mean) * (right[key] - right_mean) for key in keys)
    left_denominator = sqrt(fsum((left[key] - left_mean) ** 2 for key in keys))
    right_denominator = sqrt(fsum((right[key] - right_mean) ** 2 for key in keys))
    if left_denominator == 0 or right_denominator == 0:
        return None
    return numerator / (left_denominator * right_denominator)


def _pairwise_rank_agreement(left: Mapping[str, float], right: Mapping[str, float]) -> float | None:
    keys = tuple(sorted(set(left) & set(right)))
    if len(keys) < 2:
        return None
    agreements: list[float] = []
    for index, first in enumerate(keys):
        for second in keys[index + 1 :]:
            left_difference = left[first] - left[second]
            right_difference = right[first] - right[second]
            if isclose(left_difference, 0.0, abs_tol=1e-12) and isclose(
                right_difference, 0.0, abs_tol=1e-12
            ):
                agreements.append(1.0)
            elif isclose(left_difference, 0.0, abs_tol=1e-12) or isclose(
                right_difference, 0.0, abs_tol=1e-12
            ):
                agreements.append(0.5)
            else:
                agreements.append(float(left_difference * right_difference > 0))
    return fsum(agreements) / len(agreements)


def synthetic_observation_from_repeated_result(
    repeated_result: RepeatedMethodologyResult,
    *,
    variant_key: Key,
    cohort_key: Key,
    population_weight: float,
) -> SyntheticVariantObservation:
    """Convert repeated aggregate output into a survey-comparable observation."""

    runs = repeated_result.runs
    category_values = tuple(
        fsum(run.report.distribution.categories[index].value for run in runs) / len(runs)
        for index in range(4)
    )
    metric_values = tuple(summary.mean for summary in repeated_result.metric_summaries)
    return SyntheticVariantObservation(
        variant_key=variant_key,
        cohort_key=cohort_key,
        population_weight=population_weight,
        effective_sample_size=fsum(run.report.effective_sample_size for run in runs) / len(runs),
        distribution=_distribution(cast(tuple[float, float, float, float], category_values)),
        metrics=tuple(  # type: ignore[arg-type]
            MetricScore(key=key, value=value)
            for key, value in zip(METRIC_KEYS, metric_values, strict=True)
        ),
    )


def _comparison(
    variant_key: Key,
    synthetic_rows: Sequence[SyntheticVariantObservation],
    survey_rows: Sequence[SurveyVariantObservation],
) -> SurveyCalibrationComparison:
    synthetic = _aggregate(
        [
            (row.population_weight, row.distribution, row.metrics, row.effective_sample_size)
            for row in synthetic_rows
        ]
    )
    survey = _aggregate(
        [
            (
                row.respondent_count * row.quality_pass_rate * row.post_stratification_weight,
                row.reaction_distribution,
                row.metrics,
                row.respondent_count * row.quality_pass_rate,
            )
            for row in survey_rows
        ]
    )
    distribution_tvd = 0.5 * fsum(
        abs(synthetic.distribution[index] - survey.distribution[index]) for index in range(4)
    )
    distribution_brier = 0.5 * fsum(
        (synthetic.distribution[index] - survey.distribution[index]) ** 2 for index in range(4)
    )
    metric_errors = [synthetic.metrics[index] - survey.metrics[index] for index in range(5)]
    return SurveyCalibrationComparison(
        variant_key=variant_key,
        matched_cohort_count=len(set(row.cohort_key for row in synthetic_rows)),
        synthetic_effective_sample_size=synthetic.effective_sample_size,
        survey_effective_respondents=survey.effective_observations,
        distribution_total_variation_distance=distribution_tvd,
        distribution_brier_score=distribution_brier,
        metric_mae=fsum(abs(error) for error in metric_errors) / len(metric_errors),
        metric_rmse=sqrt(fsum(error * error for error in metric_errors) / len(metric_errors)),
        synthetic_positive_share=synthetic.distribution[0],
        survey_positive_share=survey.distribution[0],
    )


def calibrate_synthetic_panel(
    *,
    synthetic_observations: Sequence[SyntheticVariantObservation],
    survey: SurveyDataset,
) -> SurveyCalibrationResult:
    """Compare synthetic weighted variants with consented aggregate survey data."""

    if not survey.provenance.consent_recorded:
        raise ValueError("survey comparison requires recorded consent")
    if not survey.provenance.authorized_for_calibration:
        raise ValueError("survey source is not authorized for comparison")
    if survey.provenance.evidence_class != "observed_survey":
        raise ValueError("survey comparison requires observed survey evidence")

    synthetic_rows = tuple(synthetic_observations)
    synthetic_keys = [(row.variant_key, row.cohort_key) for row in synthetic_rows]
    if len(synthetic_keys) != len(set(synthetic_keys)):
        raise ValueError("synthetic variant/cohort observations must be unique")
    synthetic_by_variant: dict[str, list[SyntheticVariantObservation]] = {}
    survey_by_variant: dict[str, list[SurveyVariantObservation]] = {}
    for synthetic_row in synthetic_rows:
        synthetic_by_variant.setdefault(synthetic_row.variant_key, []).append(synthetic_row)
    for survey_row in survey.observations:
        survey_by_variant.setdefault(survey_row.variant_key, []).append(survey_row)

    matched_variants = tuple(sorted(set(synthetic_by_variant) & set(survey_by_variant)))
    comparisons: list[SurveyCalibrationComparison] = []
    matched_observations = 0
    for variant_key in matched_variants:
        synthetic_variant_rows = synthetic_by_variant[variant_key]
        survey_variant_rows = survey_by_variant[variant_key]
        survey_by_cohort = {row.cohort_key: row for row in survey_variant_rows}
        matched_synthetic_rows = [
            row for row in synthetic_variant_rows if row.cohort_key in survey_by_cohort
        ]
        matched_survey_rows = [survey_by_cohort[row.cohort_key] for row in matched_synthetic_rows]
        if not matched_synthetic_rows:
            continue
        matched_observations += len(matched_synthetic_rows)
        comparisons.append(_comparison(variant_key, matched_synthetic_rows, matched_survey_rows))

    if not comparisons:
        status: CalibrationStatus = "Insufficient evidence"
    elif (
        len(comparisons) >= 2
        and set(synthetic_by_variant) == set(survey_by_variant)
        and all(
            set(row.cohort_key for row in synthetic_by_variant[key])
            == set(row.cohort_key for row in survey_by_variant[key])
            for key in (item.variant_key for item in comparisons)
        )
    ):
        status = "Survey-calibrated"
    else:
        status = "Partially calibrated"

    aggregate_tvd = (
        fsum(item.distribution_total_variation_distance for item in comparisons) / len(comparisons)
        if comparisons
        else None
    )
    aggregate_mae = (
        fsum(item.metric_mae for item in comparisons) / len(comparisons) if comparisons else None
    )
    aggregate_rmse = (
        fsum(item.metric_rmse for item in comparisons) / len(comparisons) if comparisons else None
    )
    synthetic_rank_values = {
        item.variant_key: item.synthetic_positive_share for item in comparisons
    }
    survey_rank_values = {item.variant_key: item.survey_positive_share for item in comparisons}
    result = SurveyCalibrationResult(
        status=status,
        survey_source_id=survey.provenance.source_id,
        survey_source_version=survey.provenance.source_version,
        matched_observations=matched_observations,
        matched_variants=len(comparisons),
        comparisons=tuple(comparisons),
        aggregate_distribution_total_variation_distance=aggregate_tvd,
        aggregate_metric_mae=aggregate_mae,
        aggregate_metric_rmse=aggregate_rmse,
        variant_rank_correlation=_pearson(
            _rank_map(synthetic_rank_values), _rank_map(survey_rank_values)
        ),
        pairwise_rank_agreement=_pairwise_rank_agreement(synthetic_rank_values, survey_rank_values),
        limitations=(
            "Observed-survey comparison measures synthetic aggregate outputs against observed "
            "survey aggregates; "
            "it does not retune or overwrite the model.",
            "Observed-survey agreement is not election-outcome evidence and does not establish "
            "universal "
            "accuracy.",
            "No individual respondent records or identifiable political profiles are accepted by "
            "this contract.",
        ),
    )
    checksum = sha256(
        canonical_json_dumps(
            result.model_dump(mode="json", exclude={"reproducibility_checksum_sha256"})
        )
    ).hexdigest()
    return result.model_copy(update={"reproducibility_checksum_sha256": checksum})
