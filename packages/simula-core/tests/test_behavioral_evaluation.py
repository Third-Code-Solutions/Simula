from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from uuid import UUID

import pytest
from simula_core.behavioral_evaluation import (
    BehavioralEvaluationObservation,
    BehavioralEvaluationProtocol,
    OutcomeProvenance,
    evaluate_behavioral_holdout,
)
from simula_core.json_codec import canonical_json_dumps

CAMPAIGNS = tuple(UUID(f"00000000-0000-4000-8000-{index:012d}") for index in range(1, 7))


def _protocol() -> BehavioralEvaluationProtocol:
    return BehavioralEvaluationProtocol(
        protocol_id=UUID("00000000-0000-4000-8000-000000000100"),
        version=1,
        methodology_version="behavioral_engine_v1",
        registered_at=datetime(2026, 7, 29, tzinfo=UTC),
        development_campaign_ids=CAMPAIGNS[:2],
        holdout_campaign_ids=CAMPAIGNS[2:],
        minimum_subgroup_size=3,
    )


def _observation(
    campaign_id: UUID,
    predicted_score: float,
    observed_score: float,
    *,
    baseline_score: float | None = 50.0,
    subgroup_keys: tuple[str, ...] = (),
    methodology_version: str = "behavioral_engine_v1",
) -> BehavioralEvaluationObservation:
    return BehavioralEvaluationObservation(
        campaign_id=campaign_id,
        methodology_version=methodology_version,
        predicted_score=predicted_score,
        observed_score=observed_score,
        baseline_score=baseline_score,
        subgroup_keys=subgroup_keys,
        outcome_provenance=OutcomeProvenance(
            source_id="heldout_fixture",
            source_version="v1",
            owner="SIMULA repository",
            license="Repository fixture",
            allowed_use="Deterministic evaluation test.",
            observed_at=datetime(2026, 7, 1, tzinfo=UTC),
            checksum_sha256="a" * 64,
        ),
    )


def _observations() -> tuple[BehavioralEvaluationObservation, ...]:
    return (
        _observation(CAMPAIGNS[2], 10, 20, subgroup_keys=("all", "small")),
        _observation(CAMPAIGNS[3], 30, 40, subgroup_keys=("all",)),
        _observation(CAMPAIGNS[4], 70, 80, subgroup_keys=("all",)),
        _observation(CAMPAIGNS[5], 90, 100, subgroup_keys=("all",)),
    )


def test_holdout_evaluation_is_prespecified_replayable_and_baseline_aware() -> None:
    report = evaluate_behavioral_holdout(_protocol(), tuple(reversed(_observations())))

    assert report.validation_label == "benchmark_only"
    assert report.metrics.sample_size == 4
    assert report.metrics.mean_absolute_error == 10
    assert report.metrics.pearson_correlation == pytest.approx(1.0)
    assert report.metrics.baseline_mean_absolute_error == 30
    assert report.subgroups[0].subgroup_key == "all"
    assert report.subgroups[0].status == "reported"
    assert report.subgroups[1].subgroup_key == "small"
    assert report.subgroups[1].status == "suppressed"
    assert report.subgroups[1].metrics is None
    assert (
        report.observation_sha256
        == sha256(
            canonical_json_dumps(
                [observation.model_dump(mode="json") for observation in _observations()]
            )
        ).hexdigest()
    )


@pytest.mark.parametrize(
    ("observations", "message"),
    [
        (_observations()[:-1], "exactly match"),
        (
            (*_observations()[:-1], _observations()[0]),
            "unique",
        ),
        (
            tuple(
                observation.model_copy(update={"methodology_version": "behavioral_engine_v2"})
                if index == 0
                else observation
                for index, observation in enumerate(_observations())
            ),
            "version drifted",
        ),
        (
            tuple(
                observation.model_copy(update={"baseline_score": None})
                if index == 0
                else observation
                for index, observation in enumerate(_observations())
            ),
            "every holdout row or none",
        ),
    ],
)
def test_holdout_evaluation_rejects_selection_binding_and_baseline_drift(
    observations: tuple[BehavioralEvaluationObservation, ...],
    message: str,
) -> None:
    with pytest.raises(ValueError, match=message):
        evaluate_behavioral_holdout(_protocol(), observations)


def test_holdout_evaluation_discloses_constant_score_correlation_as_unavailable() -> None:
    observations = tuple(
        observation.model_copy(update={"observed_score": 50.0}) for observation in _observations()
    )

    report = evaluate_behavioral_holdout(_protocol(), observations)

    assert report.metrics.pearson_correlation is None
    assert report.metrics.correlation_unavailable_reason == "constant_scores"


def test_evaluation_protocol_rejects_split_leakage() -> None:
    with pytest.raises(ValueError, match="disjoint"):
        BehavioralEvaluationProtocol(
            protocol_id=UUID("00000000-0000-4000-8000-000000000100"),
            version=1,
            methodology_version="behavioral_engine_v1",
            registered_at=datetime(2026, 7, 29, tzinfo=UTC),
            development_campaign_ids=CAMPAIGNS[:2],
            holdout_campaign_ids=(CAMPAIGNS[1], CAMPAIGNS[2]),
            minimum_subgroup_size=2,
        )


def test_evaluation_observation_rejects_non_finite_scores() -> None:
    with pytest.raises(ValueError, match="finite number"):
        _observation(CAMPAIGNS[2], float("nan"), 50)


def test_evaluation_protocol_requires_timezone_aware_registration() -> None:
    with pytest.raises(ValueError, match="timezone"):
        BehavioralEvaluationProtocol(
            protocol_id=UUID("00000000-0000-4000-8000-000000000100"),
            version=1,
            methodology_version="behavioral_engine_v1",
            registered_at=datetime(2026, 7, 29),
            development_campaign_ids=CAMPAIGNS[:2],
            holdout_campaign_ids=CAMPAIGNS[2:],
            minimum_subgroup_size=2,
        )
