from __future__ import annotations

import pytest
from simula_core.survey_imports import (
    CsvSurveyAdapter,
    FormbricksSurveyAdapter,
    SurveyImportFieldMap,
    SurveyImportMetadata,
)


def _metadata() -> SurveyImportMetadata:
    return SurveyImportMetadata(
        source_id="survey_import_v1",
        source_version="v1",
        owner="SIMULA test",
        license="test-only",
        allowed_uses=("calibration",),
        collection_period="2026-Q1",
        geography="Philippines",
        methodology="consented aggregate test survey",
        consent_recorded=True,
        authorized_for_calibration=True,
        quality_filter_version="quality_v1",
        known_biases=("test sample",),
        coverage_limitations=("aggregate fixture",),
    )


def _field_map() -> SurveyImportFieldMap:
    return SurveyImportFieldMap(
        variant_key="variant",
        cohort_key="cohort",
        reaction_positive="positive",
        reaction_neutral="neutral",
        reaction_negative="negative",
        reaction_mixed="mixed",
        metric_clarity="clarity",
        metric_relevance="relevance",
        metric_trust="trust",
        metric_persuasiveness="persuasiveness",
        metric_consideration="consideration",
        share_intent="share",
        post_stratification_weight="weight",
        respondent_key="respondent_id",
        quality_score="quality",
        bot_flag="bot",
    )


def test_csv_adapter_aggregates_weights_and_reports_quality_filters() -> None:
    csv_payload = "\n".join(
        (
            "respondent_id,variant,cohort,positive,neutral,negative,mixed,clarity,relevance,trust,persuasiveness,consideration,share,weight,quality,bot",
            "r1,A,metro,60,20,10,10,80,81,82,83,84,80,2,1,false",
            "r1,A,metro,60,20,10,10,80,81,82,83,84,80,2,1,false",
            "r2,A,metro,50,20,10,20,70,71,72,73,74,70,1,0.4,false",
            "r3,A,metro,50,20,10,20,70,71,72,73,74,70,1,1,true",
        )
    )

    result = CsvSurveyAdapter().import_dataset(
        csv_payload,
        metadata=_metadata(),
        field_map=_field_map(),
    )

    assert result.dataset.provenance.sample_size == 1
    assert result.dataset.observations[0].respondent_count == 1
    assert result.dataset.observations[0].post_stratification_weight == 2
    assert result.summary.duplicate_response_count == 1
    assert result.summary.low_quality_response_count == 1
    assert result.summary.bot_response_count == 1
    assert result.summary.accepted_response_count == 1


def test_formbricks_adapter_flattens_response_data_and_deduplicates_provider_ids() -> None:
    payload = {
        "data": [
            {
                "id": "response-1",
                "data": {
                    "variant": "A",
                    "cohort": "visayas",
                    "positive": 0.7,
                    "neutral": 0.1,
                    "negative": 0.1,
                    "mixed": 0.1,
                    "clarity": 70,
                    "relevance": 70,
                    "trust": 70,
                    "persuasiveness": 70,
                    "consideration": 70,
                },
            },
            {
                "id": "response-1",
                "data": {
                    "variant": "A",
                    "cohort": "visayas",
                    "positive": 0.7,
                    "neutral": 0.1,
                    "negative": 0.1,
                    "mixed": 0.1,
                    "clarity": 70,
                    "relevance": 70,
                    "trust": 70,
                    "persuasiveness": 70,
                    "consideration": 70,
                },
            },
        ]
    }

    result = FormbricksSurveyAdapter().import_dataset(
        payload,
        metadata=_metadata(),
        field_map=SurveyImportFieldMap(
            variant_key="variant",
            cohort_key="cohort",
            reaction_positive="positive",
            reaction_neutral="neutral",
            reaction_negative="negative",
            reaction_mixed="mixed",
            metric_clarity="clarity",
            metric_relevance="relevance",
            metric_trust="trust",
            metric_persuasiveness="persuasiveness",
            metric_consideration="consideration",
        ),
    )

    assert result.dataset.provenance.sample_size == 1
    assert result.summary.duplicate_response_count == 1
    assert result.summary.accepted_response_count == 1


def test_import_rejects_individual_political_fields() -> None:
    with pytest.raises(ValueError, match="identity or political"):
        CsvSurveyAdapter().import_dataset(
            "respondent_id,email,variant,cohort\nr1,a@example.com,A,metro\n",
            metadata=_metadata(),
            field_map=_field_map(),
        )
