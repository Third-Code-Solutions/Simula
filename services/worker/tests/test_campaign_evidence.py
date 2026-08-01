from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from uuid import UUID

import pytest
from simula_core.historical_backtesting import (
    BlindBacktestPrediction,
    BlindBacktestPredictionSet,
    HistoricalBacktestProtocol,
    HistoricalBacktestProvenance,
    HistoricalOutcome,
    HistoricalOutcomeDataset,
)
from simula_core.methodology import MetricScore, ReactionDistribution, ReactionShare
from simula_core.survey_calibration import (
    SurveyDataset,
    SurveyProvenance,
    SurveyVariantObservation,
    SyntheticVariantObservation,
)
from simula_worker.campaign_evidence import (
    evaluate_campaign_evidence_claim,
    process_campaign_evidence_claim,
)
from simula_worker.database import CampaignEvidenceClaim


def _distribution(positive: float) -> dict[str, Any]:
    return {
        "categories": [
            {"key": "positive", "value": positive},
            {"key": "neutral", "value": 0.2},
            {"key": "negative", "value": 0.15},
            {"key": "mixed", "value": 0.65 - positive},
        ]
    }


def _metrics(start: float) -> list[dict[str, Any]]:
    return [
        {"key": key, "value": start + index}
        for index, key in enumerate(
            ("clarity", "relevance", "trust", "persuasiveness", "consideration")
        )
    ]


def _survey_claim() -> CampaignEvidenceClaim:
    synthetic = [
        SyntheticVariantObservation(
            variant_key=variant,
            cohort_key=cohort,
            population_weight=weight,
            effective_sample_size=50,
            distribution=ReactionDistribution(
                categories=tuple(  # type: ignore[arg-type]
                    ReactionShare(key=key, value=value)  # type: ignore[arg-type]
                    for key, value in (
                        ("positive", positive),
                        ("neutral", 0.2),
                        ("negative", 0.15),
                        ("mixed", 0.65 - positive),
                    )
                )
            ),
            metrics=tuple(  # type: ignore[arg-type]
                MetricScore(key=key, value=value)  # type: ignore[arg-type]
                for key, value in zip(
                    ("clarity", "relevance", "trust", "persuasiveness", "consideration"),
                    (70, 71, 72, 73, 74) if variant == "variant_a" else (40, 41, 42, 43, 44),
                    strict=True,
                )
            ),
        ).model_dump(mode="json")
        for variant, positive, cohort, weight in (
            ("variant_a", 0.6, "metro", 0.7),
            ("variant_b", 0.3, "metro", 0.3),
        )
    ]
    survey = SurveyDataset(
        provenance=SurveyProvenance(
            source_id="survey_source_v1",
            source_version="v1",
            owner="test",
            license="test",
            allowed_uses=("calibration",),
            collection_period="2026-Q1",
            geography="Philippines",
            methodology="aggregate survey",
            consent_recorded=True,
            authorized_for_calibration=True,
            quality_filter_version="quality_v1",
            sample_size=100,
            checksum_sha256="a" * 64,
            known_biases=("voluntary response",),
            coverage_limitations=("aggregate only",),
        ),
        observations=tuple(
            SurveyVariantObservation(
                variant_key=variant,
                cohort_key="metro",
                respondent_count=100,
                post_stratification_weight=1,
                reaction_distribution=ReactionDistribution(
                    categories=tuple(  # type: ignore[arg-type]
                        ReactionShare(key=key, value=value)  # type: ignore[arg-type]
                        for key, value in (
                            ("positive", positive),
                            ("neutral", 0.2),
                            ("negative", 0.15),
                            ("mixed", 0.65 - positive),
                        )
                    )
                ),
                metrics=tuple(  # type: ignore[arg-type]
                    MetricScore(key=key, value=value)  # type: ignore[arg-type]
                    for key, value in zip(
                        ("clarity", "relevance", "trust", "persuasiveness", "consideration"),
                        (69, 70, 71, 72, 73) if variant == "variant_a" else (39, 40, 41, 42, 43),
                        strict=True,
                    )
                ),
            )
            for variant, positive in (("variant_a", 0.55), ("variant_b", 0.25))
        ),
    ).model_dump(mode="json")
    return CampaignEvidenceClaim(
        evidence_id=UUID("00000000-0000-4000-8000-000000000001"),
        kind="survey_calibration",
        request={"synthetic_observations": synthetic, "survey": survey},
        secret_payload=None,
        lease_token=UUID("00000000-0000-4000-8000-000000000002"),
        attempt_count=1,
    )


def _backtest_claim() -> CampaignEvidenceClaim:
    protocol = HistoricalBacktestProtocol(
        protocol_id="protocol_v1",
        protocol_version="v1",
        model_version="simula_v1",
        methodology_version="population_weighted_v1",
        outcome_metric="positive_share",
        development_campaign_ids=("development",),
        holdout_campaign_ids=("holdout",),
        minimum_campaigns=1,
    )
    prediction_set = BlindBacktestPredictionSet(
        protocol_id=protocol.protocol_id,
        protocol_version=protocol.protocol_version,
        model_version=protocol.model_version,
        methodology_version=protocol.methodology_version,
        predictions=tuple(
            BlindBacktestPrediction(
                campaign_key="holdout",
                variant_key=variant,
                predicted_value=value,
            )
            for variant, value in (("variant_a", 70), ("variant_b", 30))
        ),
    )
    outcomes = HistoricalOutcomeDataset(
        provenance=HistoricalBacktestProvenance(
            source_id="outcome_source_v1",
            source_version="v1",
            owner="test",
            license="test",
            allowed_uses=("backtest",),
            observation_period="2025",
            geography="Philippines",
            outcome_definition="positive share",
            held_out=True,
            authorized_for_evaluation=True,
            checksum_sha256="b" * 64,
            known_biases=("coverage",),
            coverage_limitations=("aggregate only",),
        ),
        outcomes=tuple(
            HistoricalOutcome(
                campaign_key="holdout",
                variant_key=variant,
                outcome_metric="positive_share",
                observed_value=value,
            )
            for variant, value in (("variant_a", 68), ("variant_b", 32))
        ),
    )
    return CampaignEvidenceClaim(
        evidence_id=UUID("00000000-0000-4000-8000-000000000003"),
        kind="historical_backtest",
        request={
            "protocol": protocol.model_dump(mode="json"),
            "prediction_set": prediction_set.model_dump(mode="json"),
        },
        secret_payload={"outcomes": outcomes.model_dump(mode="json")},
        lease_token=UUID("00000000-0000-4000-8000-000000000004"),
        attempt_count=1,
    )


class _EvidenceDatabase:
    def __init__(self) -> None:
        self.progress: list[tuple[str, int]] = []
        self.completed: Mapping[str, object] | None = None
        self.failed: list[tuple[str, bool]] = []

    async def expire_campaign_evidence_runs(self, requested_batch_size: int = 50) -> int:
        del requested_batch_size
        return 0

    async def claim_campaign_evidence_runs(
        self, requested_batch_size: int = 5
    ) -> list[CampaignEvidenceClaim]:
        del requested_batch_size
        return []

    async def finalize_canceled_campaign_evidence_run(
        self, evidence_id: UUID, lease_token: UUID
    ) -> bool:
        del evidence_id, lease_token
        return False

    async def update_campaign_evidence_progress(
        self, evidence_id: UUID, lease_token: UUID, stage: str, progress: int, message: str
    ) -> bool:
        del lease_token, message
        self.progress.append((stage, progress))
        return True

    async def complete_campaign_evidence_run(
        self, evidence_id: UUID, lease_token: UUID, result: Mapping[str, object]
    ) -> bool:
        del evidence_id, lease_token
        self.completed = result
        return True

    async def fail_campaign_evidence_run(
        self,
        evidence_id: UUID,
        lease_token: UUID,
        error_code: str,
        error_detail: str,
        retryable: bool,
    ) -> str:
        del evidence_id, lease_token, error_detail
        self.failed.append((error_code, retryable))
        return "failed"


def test_worker_evaluates_survey_calibration_without_a_viral_score() -> None:
    result = evaluate_campaign_evidence_claim(_survey_claim())

    assert result["status"] == "Survey-calibrated"
    assert "viral_score" not in result


def test_worker_accepts_a_governed_csv_survey_import() -> None:
    claim = _survey_claim()
    request = dict(claim.request)
    request.pop("survey")
    survey_import = {
        "format": "csv",
        "payload": "\n".join(
            (
                "variant_key,cohort_key,positive,neutral,negative,mixed,clarity,relevance,trust,persuasiveness,consideration",
                "variant_a,metro,60,20,15,5,70,71,72,73,74",
                "variant_b,metro,30,20,15,35,40,41,42,43,44",
            )
        ),
        "metadata": {
            "source_id": "survey_import_v1",
            "source_version": "v1",
            "owner": "test",
            "license": "test",
            "allowed_uses": ["calibration"],
            "collection_period": "2026-Q1",
            "geography": "Philippines",
            "methodology": "aggregate survey",
            "consent_recorded": True,
            "authorized_for_calibration": True,
            "quality_filter_version": "quality_v1",
            "known_biases": ["coverage"],
            "coverage_limitations": ["aggregate only"],
        },
        "field_map": {
            "variant_key": "variant_key",
            "cohort_key": "cohort_key",
            "reaction_positive": "positive",
            "reaction_neutral": "neutral",
            "reaction_negative": "negative",
            "reaction_mixed": "mixed",
            "metric_clarity": "clarity",
            "metric_relevance": "relevance",
            "metric_trust": "trust",
            "metric_persuasiveness": "persuasiveness",
            "metric_consideration": "consideration",
        },
    }
    request["survey_import"] = {
        "format": survey_import["format"],
        "metadata": survey_import["metadata"],
        "field_map": survey_import["field_map"],
    }

    result = evaluate_campaign_evidence_claim(
        CampaignEvidenceClaim(
            evidence_id=claim.evidence_id,
            kind=claim.kind,
            request=request,
            secret_payload={"survey_import": survey_import},
            lease_token=claim.lease_token,
            attempt_count=claim.attempt_count,
        )
    )

    assert result["status"] == "Survey-calibrated"


def test_worker_keeps_historical_outcomes_out_of_public_request() -> None:
    claim = _backtest_claim()
    result = evaluate_campaign_evidence_claim(claim)

    assert result["status"] == "Historically backtested"
    assert "outcomes" not in claim.request
    assert "outcomes" not in result


@pytest.mark.asyncio
async def test_worker_persists_progress_and_completion() -> None:
    database = _EvidenceDatabase()

    state = await process_campaign_evidence_claim(database, _backtest_claim())

    assert state == "completed"
    assert database.progress == [
        ("validating", 15),
        ("evaluating", 55),
        ("persisting", 90),
    ]
    assert database.completed is not None
    assert database.failed == []
