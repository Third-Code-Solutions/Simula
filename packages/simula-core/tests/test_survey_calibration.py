from __future__ import annotations

from typing import cast

import pytest
from simula_core.methodology import MetricKey, MetricScore, ReactionDistribution, ReactionShare
from simula_core.survey_calibration import (
    SurveyDataset,
    SurveyProvenance,
    SurveyVariantObservation,
    SyntheticVariantObservation,
    calibrate_synthetic_panel,
)


def _distribution(positive: float) -> ReactionDistribution:
    return ReactionDistribution(
        categories=(
            ReactionShare(key="positive", value=positive),
            ReactionShare(key="neutral", value=0.20),
            ReactionShare(key="negative", value=0.15),
            ReactionShare(key="mixed", value=0.65 - positive),
        )
    )


MetricTuple = tuple[MetricScore, MetricScore, MetricScore, MetricScore, MetricScore]


def _metrics(start: float) -> MetricTuple:
    keys: tuple[MetricKey, ...] = (
        "clarity",
        "relevance",
        "trust",
        "persuasiveness",
        "consideration",
    )
    return cast(
        MetricTuple,
        tuple(MetricScore(key=key, value=start + index) for index, key in enumerate(keys)),
    )


def _provenance(*, consent_recorded: bool = True) -> SurveyProvenance:
    return SurveyProvenance(
        source_id="survey_fixture_v1",
        source_version="2026-08-01",
        owner="SIMULA test suite",
        license="Repository test fixture",
        allowed_uses=("Calibration tests only.",),
        collection_period="Authored fixture period.",
        geography="Fictional test geography",
        methodology="Aggregate fixture responses; no individual records stored.",
        consent_recorded=consent_recorded,
        authorized_for_calibration=True,
        quality_filter_version="quality_v1",
        sample_size=100,
        checksum_sha256="a" * 64,
        known_biases=("Authored and non-representative.",),
        coverage_limitations=("Covers no real population.",),
    )


def _synthetic() -> tuple[SyntheticVariantObservation, ...]:
    return (
        SyntheticVariantObservation(
            variant_key="variant_a",
            cohort_key="metro",
            population_weight=0.7,
            effective_sample_size=70,
            distribution=_distribution(0.60),
            metrics=_metrics(70),
        ),
        SyntheticVariantObservation(
            variant_key="variant_a",
            cohort_key="regional",
            population_weight=0.3,
            effective_sample_size=30,
            distribution=_distribution(0.40),
            metrics=_metrics(60),
        ),
        SyntheticVariantObservation(
            variant_key="variant_b",
            cohort_key="metro",
            population_weight=0.7,
            effective_sample_size=70,
            distribution=_distribution(0.30),
            metrics=_metrics(40),
        ),
        SyntheticVariantObservation(
            variant_key="variant_b",
            cohort_key="regional",
            population_weight=0.3,
            effective_sample_size=30,
            distribution=_distribution(0.20),
            metrics=_metrics(30),
        ),
    )


def _survey_dataset(*, consent_recorded: bool = True) -> SurveyDataset:
    observations = tuple(
        SurveyVariantObservation(
            variant_key=variant_key,
            cohort_key=cohort_key,
            respondent_count=respondents,
            post_stratification_weight=weight,
            reaction_distribution=_distribution(positive),
            metrics=_metrics(metric_start),
            share_intent=None,
        )
        for variant_key, cohort_key, respondents, weight, positive, metric_start in (
            ("variant_a", "metro", 70, 1.0, 0.55, 68),
            ("variant_a", "regional", 30, 1.0, 0.45, 58),
            ("variant_b", "metro", 70, 1.0, 0.35, 45),
            ("variant_b", "regional", 30, 1.0, 0.25, 35),
        )
    )
    return SurveyDataset(
        provenance=_provenance(consent_recorded=consent_recorded),
        observations=observations,
    )


def test_survey_calibration_reports_weighted_error_and_variant_rank_agreement() -> None:
    result = calibrate_synthetic_panel(
        synthetic_observations=_synthetic(),
        survey=_survey_dataset(),
    )

    assert result.status == "Survey-calibrated"
    assert result.matched_variants == 2
    assert result.matched_observations == 4
    assert result.aggregate_metric_mae is not None
    assert result.aggregate_metric_mae > 0
    assert result.variant_rank_correlation == pytest.approx(1.0)
    assert result.pairwise_rank_agreement == pytest.approx(1.0)
    assert result.comparisons[0].survey_effective_respondents == pytest.approx(100)
    assert "viral_score" not in result.model_dump(mode="json")


def test_survey_calibration_rejects_unconsented_or_unauthorized_evidence() -> None:
    with pytest.raises(ValueError, match="consent"):
        calibrate_synthetic_panel(
            synthetic_observations=_synthetic(),
            survey=_survey_dataset(consent_recorded=False),
        )

    provenance = _provenance()
    unauthorized = SurveyDataset(
        provenance=provenance.model_copy(update={"authorized_for_calibration": False}),
        observations=_survey_dataset().observations,
    )
    with pytest.raises(ValueError, match="authorized"):
        calibrate_synthetic_panel(
            synthetic_observations=_synthetic(),
            survey=unauthorized,
        )


def test_survey_calibration_downgrades_status_when_variant_coverage_is_partial() -> None:
    result = calibrate_synthetic_panel(
        synthetic_observations=_synthetic(),
        survey=SurveyDataset(
            provenance=_provenance(),
            observations=_survey_dataset().observations[:2],
        ),
    )

    assert result.status == "Partially calibrated"
    assert result.matched_variants == 1
    assert result.variant_rank_correlation is None


def test_survey_dataset_rejects_duplicate_variant_cohort_observations() -> None:
    dataset = _survey_dataset()
    with pytest.raises(ValueError, match="unique"):
        SurveyDataset(
            provenance=dataset.provenance,
            observations=(*dataset.observations, dataset.observations[0]),
        )
