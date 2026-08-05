from __future__ import annotations

from datetime import UTC, datetime

import pytest
from simula_core.calibration_monitoring import (
    build_calibration_version_history,
    monitor_calibration_drift,
    snapshot_from_calibration,
)
from simula_core.survey_calibration import SurveyCalibrationResult


def _result(*, version: str, mae: float, model: str = "model_v1") -> SurveyCalibrationResult:
    return SurveyCalibrationResult(
        status="Survey-calibrated",
        calibration_version=version,
        model_version=model,
        survey_source_id="survey_fixture",
        survey_source_version="source_v1",
        survey_sample_size=100,
        matched_observations=2,
        matched_variants=2,
        comparisons=(),
        aggregate_distribution_total_variation_distance=0.1,
        aggregate_metric_mae=mae,
        aggregate_metric_rmse=mae,
        variant_rank_correlation=0.9,
        pairwise_rank_agreement=0.9,
        limitations=("Fixture only.",),
        reproducibility_checksum_sha256="a" * 64,
    )


def test_calibration_history_is_versioned_and_drift_is_reviewable() -> None:
    baseline = snapshot_from_calibration(
        _result(version="calibration_v1", mae=2.0),
        observed_at=datetime(2026, 8, 1, tzinfo=UTC),
    )
    current = snapshot_from_calibration(
        _result(version="calibration_v2", mae=12.0),
        observed_at=datetime(2026, 8, 2, tzinfo=UTC),
    )

    history = build_calibration_version_history(
        (current, baseline), current_calibration_version="calibration_v2"
    )
    report = monitor_calibration_drift(baseline=baseline, current=current)

    assert history.snapshots[0].calibration_version == "calibration_v1"
    assert report.status == "review"
    assert report.drift_detected is True
    assert report.reproducibility_checksum_sha256


def test_calibration_history_rejects_duplicate_versions() -> None:
    snapshot = snapshot_from_calibration(
        _result(version="calibration_v1", mae=2.0),
        observed_at=datetime(2026, 8, 1, tzinfo=UTC),
    )
    with pytest.raises(ValueError, match="unique"):
        build_calibration_version_history(
            (snapshot, snapshot), current_calibration_version="calibration_v1"
        )
