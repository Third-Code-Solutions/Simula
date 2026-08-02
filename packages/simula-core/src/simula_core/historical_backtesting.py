"""Held-out historical backtesting contracts.

Prediction sets and observed outcomes are separate types so the blind-run
boundary is explicit. Backtests report scoped historical error only; they do not
authorize a universal accuracy or campaign-winner claim.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from hashlib import sha256
from math import fsum, isclose, sqrt
from typing import Literal, Self

from pydantic import Field, model_validator

from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import FrozenModel, Key, Label, Sha256, ShortText
from simula_core.survey_calibration import CalibrationStatus


class HistoricalBacktestProvenance(FrozenModel):
    evidence_class: Literal["observed_historical_outcome"] = "observed_historical_outcome"
    source_id: Key
    source_version: Label
    owner: Label
    license: Label
    allowed_uses: tuple[ShortText, ...] = Field(min_length=1)
    observation_period: ShortText
    geography: Label
    outcome_definition: ShortText
    held_out: bool
    authorized_for_evaluation: bool
    checksum_sha256: Sha256
    known_biases: tuple[ShortText, ...] = Field(min_length=1)
    coverage_limitations: tuple[ShortText, ...] = Field(min_length=1)


class HistoricalBacktestProtocol(FrozenModel):
    protocol_id: Key
    protocol_version: Label
    model_version: Label
    methodology_version: Key
    outcome_metric: Key
    development_campaign_ids: tuple[Key, ...] = Field(min_length=1, max_length=100_000)
    holdout_campaign_ids: tuple[Key, ...] = Field(min_length=1, max_length=100_000)
    minimum_campaigns: int = Field(ge=1, le=100_000)

    @model_validator(mode="after")
    def disjoint_campaign_splits(self) -> Self:
        if len(set(self.development_campaign_ids)) != len(self.development_campaign_ids):
            raise ValueError("development campaign ids must be unique")
        if len(set(self.holdout_campaign_ids)) != len(self.holdout_campaign_ids):
            raise ValueError("holdout campaign ids must be unique")
        if set(self.development_campaign_ids) & set(self.holdout_campaign_ids):
            raise ValueError("development and holdout campaigns must be disjoint")
        return self


class BlindBacktestPrediction(FrozenModel):
    campaign_key: Key
    variant_key: Key
    predicted_value: float = Field(ge=0.0, le=100.0)


class BlindBacktestPredictionSet(FrozenModel):
    protocol_id: Key
    protocol_version: Label
    model_version: Label
    methodology_version: Key
    predictions: tuple[BlindBacktestPrediction, ...] = Field(min_length=1, max_length=100_000)
    predictions_are_blind: Literal[True] = True

    @model_validator(mode="after")
    def unique_predictions(self) -> Self:
        keys = [(item.campaign_key, item.variant_key) for item in self.predictions]
        if len(keys) != len(set(keys)):
            raise ValueError("blind predictions must have unique campaign/variant keys")
        return self


class HistoricalOutcome(FrozenModel):
    campaign_key: Key
    variant_key: Key
    outcome_metric: Key
    observed_value: float = Field(ge=0.0, le=100.0)


class HistoricalOutcomeDataset(FrozenModel):
    provenance: HistoricalBacktestProvenance
    outcomes: tuple[HistoricalOutcome, ...] = Field(min_length=1, max_length=100_000)

    @model_validator(mode="after")
    def unique_outcomes(self) -> Self:
        keys = [(item.campaign_key, item.variant_key) for item in self.outcomes]
        if len(keys) != len(set(keys)):
            raise ValueError("historical outcomes must have unique campaign/variant keys")
        return self


class HistoricalCampaignResult(FrozenModel):
    campaign_key: Key
    variant_count: int = Field(ge=2)
    mae: float = Field(ge=0.0, le=100.0)
    rmse: float = Field(ge=0.0, le=100.0)
    pairwise_rank_accuracy: float = Field(ge=0.0, le=1.0)
    predicted_top_variant: Key
    observed_top_variant: Key
    top_variant_correct: float = Field(ge=0.0, le=1.0)
    rank_correlation: float | None = Field(default=None, ge=-1.0, le=1.0)


class HistoricalBacktestResult(FrozenModel):
    schema_version: Literal[1] = 1
    status: CalibrationStatus
    protocol_id: Key
    protocol_version: Label
    model_version: Label
    methodology_version: Key
    outcome_metric: Key
    outcome_source_id: Key
    outcome_source_version: Label
    campaign_count: int = Field(ge=0)
    prediction_count: int = Field(ge=0)
    campaigns: tuple[HistoricalCampaignResult, ...]
    mae: float | None = Field(default=None, ge=0.0, le=100.0)
    rmse: float | None = Field(default=None, ge=0.0, le=100.0)
    pairwise_rank_accuracy: float | None = Field(default=None, ge=0.0, le=1.0)
    top_variant_accuracy: float | None = Field(default=None, ge=0.0, le=1.0)
    rank_correlation: float | None = Field(default=None, ge=-1.0, le=1.0)
    baseline_mae: float | None = Field(default=None, ge=0.0, le=100.0)
    mae_improvement_vs_baseline: float | None = Field(default=None, ge=-100.0, le=100.0)
    predictions_were_blind: Literal[True] = True
    outcomes_revealed: Literal[True] = True
    limitations: tuple[ShortText, ...] = Field(min_length=1, max_length=20)
    reproducibility_checksum_sha256: Sha256 = "0" * 64


@dataclass(frozen=True)
class _CampaignValues:
    predicted: dict[str, float]
    observed: dict[str, float]


def _rank_correlation(left: Mapping[str, float], right: Mapping[str, float]) -> float | None:
    keys = tuple(sorted(set(left) & set(right)))
    if len(keys) < 2:
        return None
    left_order = sorted(keys, key=lambda key: (-left[key], key))
    right_order = sorted(keys, key=lambda key: (-right[key], key))
    left_rank = {key: float(index + 1) for index, key in enumerate(left_order)}
    right_rank = {key: float(index + 1) for index, key in enumerate(right_order)}
    left_mean = fsum(left_rank.values()) / len(left_rank)
    right_mean = fsum(right_rank.values()) / len(right_rank)
    numerator = fsum((left_rank[key] - left_mean) * (right_rank[key] - right_mean) for key in keys)
    denominator = sqrt(
        fsum((left_rank[key] - left_mean) ** 2 for key in keys)
        * fsum((right_rank[key] - right_mean) ** 2 for key in keys)
    )
    return None if denominator == 0 else numerator / denominator


def _pairwise_rank_accuracy(left: Mapping[str, float], right: Mapping[str, float]) -> float:
    keys = tuple(sorted(set(left) & set(right)))
    if len(keys) < 2:
        return 0.0
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


def _top_variant(values: Mapping[str, float]) -> str:
    if not values:
        raise ValueError("campaign must contain at least one variant")
    return sorted(values.items(), key=lambda item: (-item[1], item[0]))[0][0]


def _validate_prediction_set(
    *,
    protocol: HistoricalBacktestProtocol,
    prediction_set: BlindBacktestPredictionSet,
    expected_model_version: str | None,
) -> dict[tuple[str, str], BlindBacktestPrediction]:
    if prediction_set.protocol_id != protocol.protocol_id:
        raise ValueError("prediction protocol id mismatch")
    if prediction_set.protocol_version != protocol.protocol_version:
        raise ValueError("prediction protocol version mismatch")
    if prediction_set.methodology_version != protocol.methodology_version:
        raise ValueError("prediction methodology version mismatch")
    if (
        expected_model_version is not None
        and prediction_set.model_version != expected_model_version
    ):
        raise ValueError("prediction model version mismatch")
    if not prediction_set.predictions_are_blind:
        raise ValueError("historical backtest requires a blind prediction set")
    campaign_keys = {item.campaign_key for item in prediction_set.predictions}
    if campaign_keys != set(protocol.holdout_campaign_ids):
        raise ValueError("predictions may only cover the declared holdout campaigns")
    return {(item.campaign_key, item.variant_key): item for item in prediction_set.predictions}


def _validate_outcomes(
    *,
    protocol: HistoricalBacktestProtocol,
    outcomes: HistoricalOutcomeDataset,
) -> dict[tuple[str, str], HistoricalOutcome]:
    if not outcomes.provenance.held_out:
        raise ValueError("historical outcome dataset must be held out")
    if not outcomes.provenance.authorized_for_evaluation:
        raise ValueError("historical outcome source is not authorized for evaluation")
    if outcomes.provenance.evidence_class != "observed_historical_outcome":
        raise ValueError("historical backtest requires observed outcome evidence")
    if {item.outcome_metric for item in outcomes.outcomes} != {protocol.outcome_metric}:
        raise ValueError("historical outcome metric mismatch")
    campaign_keys = {item.campaign_key for item in outcomes.outcomes}
    if campaign_keys != set(protocol.holdout_campaign_ids):
        raise ValueError("outcomes must cover the declared holdout campaigns")
    return {(item.campaign_key, item.variant_key): item for item in outcomes.outcomes}


def _campaign_results(
    predictions: Mapping[tuple[str, str], BlindBacktestPrediction],
    outcomes: Mapping[tuple[str, str], HistoricalOutcome],
) -> tuple[HistoricalCampaignResult, ...]:
    campaign_values: dict[str, _CampaignValues] = {}
    for (campaign_key, variant_key), prediction in predictions.items():
        outcome = outcomes.get((campaign_key, variant_key))
        if outcome is None:
            raise ValueError("prediction and outcome variant coverage mismatch")
        campaign_values.setdefault(
            campaign_key, _CampaignValues(predicted={}, observed={})
        ).predicted[variant_key] = prediction.predicted_value
        campaign_values[campaign_key].observed[variant_key] = outcome.observed_value
    if set(predictions) != set(outcomes):
        raise ValueError("prediction and outcome variant coverage mismatch")

    results: list[HistoricalCampaignResult] = []
    for campaign_key in sorted(campaign_values):
        values = campaign_values[campaign_key]
        if len(values.predicted) < 2:
            raise ValueError("historical backtest requires at least two variants per campaign")
        errors = [values.predicted[key] - values.observed[key] for key in values.predicted]
        rank_correlation = _rank_correlation(values.predicted, values.observed)
        results.append(
            HistoricalCampaignResult(
                campaign_key=campaign_key,
                variant_count=len(values.predicted),
                mae=fsum(abs(error) for error in errors) / len(errors),
                rmse=sqrt(fsum(error * error for error in errors) / len(errors)),
                pairwise_rank_accuracy=_pairwise_rank_accuracy(values.predicted, values.observed),
                predicted_top_variant=_top_variant(values.predicted),
                observed_top_variant=_top_variant(values.observed),
                top_variant_correct=float(
                    _top_variant(values.predicted) == _top_variant(values.observed)
                ),
                rank_correlation=rank_correlation,
            )
        )
    return tuple(results)


def evaluate_historical_backtest(
    *,
    protocol: HistoricalBacktestProtocol,
    prediction_set: BlindBacktestPredictionSet,
    outcomes: HistoricalOutcomeDataset,
    baseline_prediction_set: BlindBacktestPredictionSet | None = None,
) -> HistoricalBacktestResult:
    """Reveal held-out outcomes only after validating a frozen blind prediction set."""

    predictions = _validate_prediction_set(
        protocol=protocol,
        prediction_set=prediction_set,
        expected_model_version=protocol.model_version,
    )
    outcome_values = _validate_outcomes(protocol=protocol, outcomes=outcomes)
    campaign_results = _campaign_results(predictions, outcome_values)
    prediction_errors = [
        predictions[key].predicted_value - outcome_values[key].observed_value for key in predictions
    ]
    mae = fsum(abs(error) for error in prediction_errors) / len(prediction_errors)
    rmse = sqrt(fsum(error * error for error in prediction_errors) / len(prediction_errors))
    rank_correlations = [
        result.rank_correlation
        for result in campaign_results
        if result.rank_correlation is not None
    ]
    pairwise_rank_accuracy = fsum(
        result.pairwise_rank_accuracy for result in campaign_results
    ) / len(campaign_results)
    top_variant_accuracy = fsum(result.top_variant_correct for result in campaign_results) / len(
        campaign_results
    )

    baseline_mae: float | None = None
    if baseline_prediction_set is not None:
        baseline = _validate_prediction_set(
            protocol=protocol,
            prediction_set=baseline_prediction_set,
            expected_model_version=None,
        )
        if set(baseline) != set(outcome_values):
            raise ValueError("baseline prediction and outcome coverage mismatch")
        baseline_mae = fsum(
            abs(baseline[key].predicted_value - outcome_values[key].observed_value)
            for key in baseline
        ) / len(baseline)

    status: CalibrationStatus = (
        "Historically backtested"
        if len(campaign_results) >= protocol.minimum_campaigns
        else "Insufficient evidence"
    )
    result = HistoricalBacktestResult(
        status=status,
        protocol_id=protocol.protocol_id,
        protocol_version=protocol.protocol_version,
        model_version=prediction_set.model_version,
        methodology_version=prediction_set.methodology_version,
        outcome_metric=protocol.outcome_metric,
        outcome_source_id=outcomes.provenance.source_id,
        outcome_source_version=outcomes.provenance.source_version,
        campaign_count=len(campaign_results),
        prediction_count=len(predictions),
        campaigns=campaign_results,
        mae=mae,
        rmse=rmse,
        pairwise_rank_accuracy=pairwise_rank_accuracy,
        top_variant_accuracy=top_variant_accuracy,
        rank_correlation=(
            fsum(rank_correlations) / len(rank_correlations) if rank_correlations else None
        ),
        baseline_mae=baseline_mae,
        mae_improvement_vs_baseline=(baseline_mae - mae if baseline_mae is not None else None),
        limitations=(
            "Held-out backtesting measures historical error under the declared outcome definition; "
            "it is not universal accuracy.",
            "The prediction set is required to be frozen before observed outcomes are revealed.",
            "Results are scoped to the declared geography, campaign mix, outcome source, and "
            "model version.",
        ),
    )
    checksum = sha256(
        canonical_json_dumps(
            result.model_dump(mode="json", exclude={"reproducibility_checksum_sha256"})
        )
    ).hexdigest()
    return result.model_copy(update={"reproducibility_checksum_sha256": checksum})
