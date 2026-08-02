from __future__ import annotations

import pytest
from simula_core.historical_backtesting import (
    BlindBacktestPrediction,
    BlindBacktestPredictionSet,
    HistoricalBacktestProtocol,
    HistoricalBacktestProvenance,
    HistoricalOutcome,
    HistoricalOutcomeDataset,
    evaluate_historical_backtest,
)


def _protocol(*, minimum_campaigns: int = 2) -> HistoricalBacktestProtocol:
    return HistoricalBacktestProtocol(
        protocol_id="message_outcome_protocol",
        protocol_version="v1",
        model_version="repeated_methodology_v1",
        methodology_version="phase3_method_v1",
        outcome_metric="observed_positive_share_percent",
        development_campaign_ids=("development_campaign",),
        holdout_campaign_ids=("holdout_campaign_a", "holdout_campaign_b"),
        minimum_campaigns=minimum_campaigns,
    )


def _prediction_set(
    *,
    model_version: str = "repeated_methodology_v1",
    include_development_campaign: bool = False,
) -> BlindBacktestPredictionSet:
    campaign_ids = ("development_campaign",) if include_development_campaign else ()
    predictions = [
        BlindBacktestPrediction(
            campaign_key=campaign_key,
            variant_key=variant_key,
            predicted_value=value,
        )
        for campaign_key in ("holdout_campaign_a", "holdout_campaign_b")
        for variant_key, value in (("variant_a", 68.0), ("variant_b", 35.0))
    ]
    predictions.extend(
        BlindBacktestPrediction(
            campaign_key="development_campaign",
            variant_key="variant_a",
            predicted_value=50.0,
        )
        for _ in campaign_ids
    )
    return BlindBacktestPredictionSet(
        protocol_id="message_outcome_protocol",
        protocol_version="v1",
        model_version=model_version,
        methodology_version="phase3_method_v1",
        predictions=tuple(predictions),
    )


def _outcomes(*, held_out: bool = True) -> HistoricalOutcomeDataset:
    provenance = HistoricalBacktestProvenance(
        evidence_class="observed_historical_outcome",
        source_id="historical_fixture_v1",
        source_version="2026-08-01",
        owner="SIMULA test suite",
        license="Repository test fixture",
        allowed_uses=("Backtest tests only.",),
        observation_period="Authored fixture period.",
        geography="Fictional test geography",
        outcome_definition="Observed aggregate positive share percentage.",
        held_out=held_out,
        authorized_for_evaluation=True,
        checksum_sha256="b" * 64,
        known_biases=("Authored and non-representative.",),
        coverage_limitations=("Covers no real campaign.",),
    )
    return HistoricalOutcomeDataset(
        provenance=provenance,
        outcomes=tuple(
            HistoricalOutcome(
                campaign_key=campaign_key,
                variant_key=variant_key,
                outcome_metric="observed_positive_share_percent",
                observed_value=value,
            )
            for campaign_key in ("holdout_campaign_a", "holdout_campaign_b")
            for variant_key, value in (("variant_a", 70.0), ("variant_b", 30.0))
        ),
    )


def test_historical_backtest_requires_blind_predictions_and_reports_held_out_metrics() -> None:
    result = evaluate_historical_backtest(
        protocol=_protocol(),
        prediction_set=_prediction_set(),
        outcomes=_outcomes(),
        baseline_prediction_set=BlindBacktestPredictionSet(
            protocol_id="message_outcome_protocol",
            protocol_version="v1",
            model_version="baseline_v1",
            methodology_version="phase3_method_v1",
            predictions=tuple(
                BlindBacktestPrediction(
                    campaign_key=campaign_key,
                    variant_key=variant_key,
                    predicted_value=50.0,
                )
                for campaign_key in ("holdout_campaign_a", "holdout_campaign_b")
                for variant_key in ("variant_a", "variant_b")
            ),
        ),
    )

    assert result.status == "Historically backtested"
    assert result.campaign_count == 2
    assert result.mae == pytest.approx(3.5)
    assert result.pairwise_rank_accuracy == pytest.approx(1.0)
    assert result.top_variant_accuracy == pytest.approx(1.0)
    assert result.baseline_mae == pytest.approx(20.0)
    assert result.mae_improvement_vs_baseline == pytest.approx(16.5)
    assert result.predictions_were_blind is True
    assert "viral_score" not in result.model_dump(mode="json")


def test_historical_backtest_rejects_development_leakage_and_nonheldout_outcomes() -> None:
    with pytest.raises(ValueError, match="holdout"):
        evaluate_historical_backtest(
            protocol=_protocol(),
            prediction_set=_prediction_set(include_development_campaign=True),
            outcomes=_outcomes(),
        )

    with pytest.raises(ValueError, match="held out"):
        evaluate_historical_backtest(
            protocol=_protocol(),
            prediction_set=_prediction_set(),
            outcomes=_outcomes(held_out=False),
        )


def test_historical_backtest_downgrades_status_below_declared_campaign_minimum() -> None:
    result = evaluate_historical_backtest(
        protocol=_protocol(minimum_campaigns=3),
        prediction_set=_prediction_set(),
        outcomes=_outcomes(),
    )

    assert result.status == "Insufficient evidence"
    assert result.campaign_count == 2


def test_historical_backtest_reports_weighted_cohort_slices_and_campaign_aggregates() -> None:
    predictions = BlindBacktestPredictionSet(
        protocol_id="message_outcome_protocol",
        protocol_version="v1",
        model_version="repeated_methodology_v1",
        methodology_version="phase3_method_v1",
        predictions=tuple(
            BlindBacktestPrediction(
                campaign_key=campaign_key,
                cohort_key=cohort_key,
                variant_key=variant_key,
                predicted_value=predicted_value,
            )
            for campaign_key in ("holdout_campaign_a", "holdout_campaign_b")
            for cohort_key, values in (
                ("rural", (("variant_a", 60.0), ("variant_b", 40.0))),
                ("urban", (("variant_a", 80.0), ("variant_b", 20.0))),
            )
            for variant_key, predicted_value in values
        ),
    )
    outcomes = _outcomes_with_cohorts()

    result = evaluate_historical_backtest(
        protocol=_protocol(),
        prediction_set=predictions,
        outcomes=outcomes,
    )

    assert result.schema_version == 2
    assert len(result.subgroups) == 4
    assert {(item.campaign_key, item.cohort_key) for item in result.subgroups} == {
        (campaign_key, cohort_key)
        for campaign_key in ("holdout_campaign_a", "holdout_campaign_b")
        for cohort_key in ("rural", "urban")
    }
    assert result.subgroups[0].variant_count == 2
    assert result.campaigns[0].mae == pytest.approx(3.2)
    assert result.campaigns[0].predicted_top_variant == "variant_a"


def _outcomes_with_cohorts() -> HistoricalOutcomeDataset:
    base = _outcomes().provenance
    return HistoricalOutcomeDataset(
        provenance=base,
        outcomes=tuple(
            HistoricalOutcome(
                campaign_key=campaign_key,
                cohort_key=cohort_key,
                cohort_weight=cohort_weight,
                variant_key=variant_key,
                outcome_metric="observed_positive_share_percent",
                observed_value=observed_value,
            )
            for campaign_key in ("holdout_campaign_a", "holdout_campaign_b")
            for cohort_key, cohort_weight, values in (
                ("rural", 0.4, (("variant_a", 55.0), ("variant_b", 45.0))),
                ("urban", 0.6, (("variant_a", 78.0), ("variant_b", 22.0))),
            )
            for variant_key, observed_value in values
        ),
    )
