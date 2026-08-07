from __future__ import annotations

from collections.abc import Mapping
from typing import cast
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


def test_campaign_lab_native_survey_import_normalizes_and_discards_rows() -> None:
    form = {
        "version": 1,
        "title": "Native message calibration",
        "description": "Aggregate native survey.",
        "language": "taglish",
        "consent_text": "I agree.",
        "privacy_notice": "No identity fields.",
        "provenance": {
            "source_id": "simula_native_survey",
            "source_version": "v1",
            "owner": "SIMULA test team",
            "license": "consented internal research",
            "allowed_uses": ["survey calibration"],
            "collection_period": "2026-Q3",
            "geography": "Philippines",
            "methodology": "Consented aggregate message test.",
            "known_biases": ["Opt-in sample."],
            "coverage_limitations": ["Not a population estimate."],
        },
        "questions": [
            {
                "key": "variant_key",
                "kind": "variant",
                "label": "Variant",
                "options": ["control", "variant_a"],
            },
            {
                "key": "cohort_key",
                "kind": "cohort",
                "label": "Cohort",
                "options": ["metro", "visayas"],
            },
            {
                "key": "reaction",
                "kind": "reaction",
                "label": "Reaction",
                "options": ["positive", "neutral", "negative", "mixed"],
            },
            {"key": "clarity", "kind": "metric", "label": "Clarity"},
            {"key": "relevance", "kind": "metric", "label": "Relevance"},
            {"key": "trust", "kind": "metric", "label": "Trust"},
            {"key": "persuasiveness", "kind": "metric", "label": "Persuasiveness"},
            {"key": "consideration", "kind": "metric", "label": "Consideration"},
            {"key": "consent", "kind": "consent", "label": "Consent"},
        ],
    }
    claim = CampaignLabClaim(
        run_id=UUID("40000000-0000-4000-8000-000000000011"),
        run_type="survey_import",
        request={"collection_mode": "simula_native"},
        secret_payload={
            "native_form": form,
            "responses": [
                {
                    "response_id": "opaque-1",
                    "answers": {
                        "variant_key": "variant_a",
                        "cohort_key": "metro",
                        "reaction": "positive",
                        "clarity": 80,
                        "relevance": 81,
                        "trust": 82,
                        "persuasiveness": 83,
                        "consideration": 84,
                        "consent": True,
                    },
                }
            ],
        },
        lease_token=UUID("40000000-0000-4000-8000-000000000012"),
        attempt_count=1,
    )

    result = evaluate_campaign_lab_claim(claim)

    summary = cast(Mapping[str, object], result["summary"])
    dataset = cast(Mapping[str, object], result["dataset"])
    provenance = cast(Mapping[str, object], dataset["provenance"])
    assert summary["accepted_response_count"] == 1
    assert provenance["source_id"] == "simula_native_survey"
    assert "responses" not in result
    assert "native_form" not in result
