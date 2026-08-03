"""Versioned calibration history and transparent model-drift monitoring."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from hashlib import sha256
from typing import Literal

from pydantic import Field, model_validator

from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import FrozenModel, Key, Label, Sha256, ShortText
from simula_core.survey_calibration import SurveyCalibrationResult

DriftStatus = Literal["stable", "monitor", "review", "unavailable"]
DriftMetricStatus = Literal["stable", "monitor", "review", "unavailable"]
DriftMetricKey = Literal[
    "distribution_total_variation_distance",
    "aggregate_metric_mae",
    "aggregate_metric_rmse",
    "variant_rank_correlation",
    "pairwise_rank_agreement",
]

DRIFT_THRESHOLD_VERSION = "calibration_drift_thresholds_v1"
DRIFT_THRESHOLDS: Mapping[DriftMetricKey, float] = {
    "distribution_total_variation_distance": 0.10,
    "aggregate_metric_mae": 5.0,
    "aggregate_metric_rmse": 5.0,
    "variant_rank_correlation": 0.15,
    "pairwise_rank_agreement": 0.15,
}


class CalibrationSnapshot(FrozenModel):
    """One immutable aggregate calibration observation."""

    calibration_version: Label
    model_version: Label
    survey_source_id: Key
    survey_source_version: Label
    observed_at: datetime
    survey_sample_size: int = Field(ge=0)
    aggregate_distribution_total_variation_distance: float | None = Field(
        default=None, ge=0.0, le=1.0
    )
    aggregate_metric_mae: float | None = Field(default=None, ge=0.0, le=100.0)
    aggregate_metric_rmse: float | None = Field(default=None, ge=0.0, le=100.0)
    variant_rank_correlation: float | None = Field(default=None, ge=-1.0, le=1.0)
    pairwise_rank_agreement: float | None = Field(default=None, ge=0.0, le=1.0)
    result_checksum_sha256: Sha256


class CalibrationDriftMetric(FrozenModel):
    metric: DriftMetricKey
    baseline_value: float | None
    current_value: float | None
    absolute_delta: float | None = Field(default=None, ge=0.0)
    review_threshold: float
    status: DriftMetricStatus


class CalibrationDriftReport(FrozenModel):
    schema_version: Literal[1] = 1
    monitor_type: Literal["calibration_model_drift"] = "calibration_model_drift"
    threshold_version: Label = DRIFT_THRESHOLD_VERSION
    baseline_calibration_version: Label | None
    current_calibration_version: Label
    metrics: tuple[CalibrationDriftMetric, ...] = Field(min_length=1, max_length=20)
    drift_detected: bool
    status: DriftStatus
    limitations: tuple[ShortText, ...] = Field(min_length=1, max_length=10)
    reproducibility_checksum_sha256: Sha256 = "0" * 64

    @model_validator(mode="after")
    def bind_checksum(self) -> CalibrationDriftReport:
        expected = sha256(
            canonical_json_dumps(
                self.model_dump(mode="json", exclude={"reproducibility_checksum_sha256"})
            )
        ).hexdigest()
        if self.reproducibility_checksum_sha256 == "0" * 64:
            object.__setattr__(self, "reproducibility_checksum_sha256", expected)
        elif self.reproducibility_checksum_sha256 != expected:
            raise ValueError("calibration drift checksum mismatch")
        return self


class CalibrationVersionHistory(FrozenModel):
    schema_version: Literal[1] = 1
    current_calibration_version: Label
    snapshots: tuple[CalibrationSnapshot, ...] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def versions_are_unique_and_ordered(self) -> CalibrationVersionHistory:
        versions = [snapshot.calibration_version for snapshot in self.snapshots]
        if len(versions) != len(set(versions)):
            raise ValueError("calibration versions must be unique")
        if self.current_calibration_version not in versions:
            raise ValueError("calibration history must contain the current version")
        if tuple(snapshot.observed_at for snapshot in self.snapshots) != tuple(
            sorted(snapshot.observed_at for snapshot in self.snapshots)
        ):
            raise ValueError("calibration history must be ordered by observation time")
        return self


def snapshot_from_calibration(
    result: SurveyCalibrationResult,
    *,
    observed_at: datetime,
) -> CalibrationSnapshot:
    """Project a calibration result into immutable drift-monitoring metadata."""

    return CalibrationSnapshot(
        calibration_version=result.calibration_version,
        model_version=result.model_version,
        survey_source_id=result.survey_source_id,
        survey_source_version=result.survey_source_version,
        observed_at=observed_at,
        survey_sample_size=result.survey_sample_size,
        aggregate_distribution_total_variation_distance=(
            result.aggregate_distribution_total_variation_distance
        ),
        aggregate_metric_mae=result.aggregate_metric_mae,
        aggregate_metric_rmse=result.aggregate_metric_rmse,
        variant_rank_correlation=result.variant_rank_correlation,
        pairwise_rank_agreement=result.pairwise_rank_agreement,
        result_checksum_sha256=result.reproducibility_checksum_sha256,
    )


def build_calibration_version_history(
    snapshots: Sequence[CalibrationSnapshot],
    *,
    current_calibration_version: str,
) -> CalibrationVersionHistory:
    """Validate and retain a bounded, ordered version history."""

    ordered = tuple(sorted(snapshots, key=lambda snapshot: snapshot.observed_at))
    return CalibrationVersionHistory(
        current_calibration_version=current_calibration_version,
        snapshots=ordered,
    )


def _metric_delta(
    metric: DriftMetricKey,
    baseline_value: float | None,
    current_value: float | None,
) -> CalibrationDriftMetric:
    threshold = DRIFT_THRESHOLDS[metric]
    if baseline_value is None or current_value is None:
        return CalibrationDriftMetric(
            metric=metric,
            baseline_value=baseline_value,
            current_value=current_value,
            review_threshold=threshold,
            status="unavailable",
        )
    delta = abs(current_value - baseline_value)
    status: DriftMetricStatus = (
        "review" if delta >= threshold else "monitor" if delta >= threshold / 2 else "stable"
    )
    return CalibrationDriftMetric(
        metric=metric,
        baseline_value=baseline_value,
        current_value=current_value,
        absolute_delta=delta,
        review_threshold=threshold,
        status=status,
    )


def monitor_calibration_drift(
    *,
    baseline: CalibrationSnapshot,
    current: CalibrationSnapshot,
) -> CalibrationDriftReport:
    """Compare adjacent calibration versions with fixed, reviewable thresholds."""

    limitation = (
        (
            "Model versions differ; metric shifts are reported as drift diagnostics, not causal "
            "model attribution.",
        )
        if baseline.model_version != current.model_version
        else ()
    )
    pairs: tuple[tuple[DriftMetricKey, float | None, float | None], ...] = (
        (
            "distribution_total_variation_distance",
            baseline.aggregate_distribution_total_variation_distance,
            current.aggregate_distribution_total_variation_distance,
        ),
        ("aggregate_metric_mae", baseline.aggregate_metric_mae, current.aggregate_metric_mae),
        ("aggregate_metric_rmse", baseline.aggregate_metric_rmse, current.aggregate_metric_rmse),
        (
            "variant_rank_correlation",
            baseline.variant_rank_correlation,
            current.variant_rank_correlation,
        ),
        (
            "pairwise_rank_agreement",
            baseline.pairwise_rank_agreement,
            current.pairwise_rank_agreement,
        ),
    )
    metrics = tuple(_metric_delta(metric, previous, latest) for metric, previous, latest in pairs)
    comparable = tuple(metric for metric in metrics if metric.status != "unavailable")
    if not comparable:
        status: DriftStatus = "unavailable"
    elif any(metric.status == "review" for metric in comparable):
        status = "review"
    elif any(metric.status == "monitor" for metric in comparable):
        status = "monitor"
    else:
        status = "stable"
    return CalibrationDriftReport(
        baseline_calibration_version=baseline.calibration_version,
        current_calibration_version=current.calibration_version,
        metrics=metrics,
        drift_detected=status in {"monitor", "review"},
        status=status,
        limitations=(
            "Drift thresholds are monitoring triggers, not accuracy guarantees or population "
            "confidence intervals.",
            "A review is required before treating a shifted calibration as validated evidence.",
            *limitation,
        ),
    )
