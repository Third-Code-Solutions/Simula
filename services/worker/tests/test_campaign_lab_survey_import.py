from __future__ import annotations

from collections.abc import Mapping
from uuid import UUID

from simula_worker.campaign_lab import evaluate_campaign_lab_claim
from simula_worker.database import CampaignLabClaim


def test_campaign_lab_survey_import_is_worker_only_and_aggregate() -> None:
    claim = CampaignLabClaim(
        run_id=UUID("40000000-0000-4000-8000-000000000001"),
        run_type="survey_import",
        request={
            "format": "csv",
            "metadata": {
                "source_id": "survey_source_v1",
                "source_version": "v1",
                "owner": "research-team",
                "license": "consented-internal",
                "allowed_uses": ["campaign calibration"],
                "collection_period": "2026-Q1",
                "geography": "Philippines",
                "methodology": "consented aggregate survey",
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
        },
        secret_payload={
            "payload": (
                "variant_key,cohort_key,positive,neutral,negative,mixed,"
                "clarity,relevance,trust,persuasiveness,consideration\n"
                "variant_a,metro,60,20,15,5,70,71,72,73,74\n"
                "variant_b,metro,30,20,15,35,40,41,42,43,44"
            )
        },
        lease_token=UUID("40000000-0000-4000-8000-000000000002"),
        attempt_count=1,
    )

    result = evaluate_campaign_lab_claim(claim)

    summary = result["summary"]
    dataset = result["dataset"]
    assert isinstance(summary, Mapping)
    assert isinstance(dataset, Mapping)
    provenance = dataset["provenance"]
    assert isinstance(provenance, Mapping)
    assert summary["accepted_response_count"] == 2
    assert provenance["authorized_for_calibration"] is True
    assert "payload" not in result
