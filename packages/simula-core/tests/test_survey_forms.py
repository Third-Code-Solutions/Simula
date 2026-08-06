from __future__ import annotations

import pytest
from simula_core.survey_forms import (
    NativeSurveyForm,
    NativeSurveyProvenance,
    NativeSurveyQuestion,
    native_survey_rows,
)


def _form() -> NativeSurveyForm:
    return NativeSurveyForm(
        version=1,
        title="Message calibration",
        description="Aggregate message-testing survey.",
        language="taglish",
        consent_text="I agree to aggregate research use.",
        privacy_notice="No identity or contact fields are collected.",
        provenance=NativeSurveyProvenance(
            source_id="simula_native_survey",
            source_version="v1",
            owner="SIMULA test team",
            license="consented internal research",
            allowed_uses=("survey calibration",),
            collection_period="2026-Q3",
            geography="Philippines",
            methodology="Consented aggregate message test.",
            known_biases=("Opt-in sample.",),
            coverage_limitations=("Not a population estimate.",),
        ),
        questions=(
            NativeSurveyQuestion(
                key="variant_key",
                kind="variant",
                label="Which message did you see?",
                options=("control", "variant_a"),
            ),
            NativeSurveyQuestion(
                key="cohort_key",
                kind="cohort",
                label="Aggregate cohort",
                options=("metro", "visayas"),
            ),
            NativeSurveyQuestion(
                key="reaction",
                kind="reaction",
                label="Initial reaction",
                options=("positive", "neutral", "negative", "mixed"),
            ),
            *(
                NativeSurveyQuestion(
                    key=key,
                    kind="metric",
                    label=f"{key} rating",
                )
                for key in ("clarity", "relevance", "trust", "persuasiveness", "consideration")
            ),
            NativeSurveyQuestion(
                key="share_intent",
                kind="share_intent",
                label="Share intent",
                required=False,
            ),
            NativeSurveyQuestion(
                key="consent",
                kind="consent",
                label="Consent",
            ),
        ),
    )


def test_native_form_compiles_to_existing_aggregate_import_schema() -> None:
    rows = native_survey_rows(
        _form(),
        [
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
                    "share_intent": 0.7,
                    "consent": True,
                },
            }
        ],
    )

    assert rows[0]["variant_key"] == "variant_a"
    assert rows[0]["positive"] == 100
    assert rows[0]["negative"] == 0
    assert rows[0]["share_intent"] == pytest.approx(0.7)
    assert rows[0]["quality"] == 1.0
    assert rows[0]["completed"] is True


def test_native_form_rejects_missing_consent_and_duplicate_ids() -> None:
    form = _form()
    answers_without_consent: dict[str, object] = {
        "variant_key": "control",
        "cohort_key": "metro",
        "reaction": "neutral",
        "clarity": 50,
        "relevance": 50,
        "trust": 50,
        "persuasiveness": 50,
        "consideration": 50,
        "consent": False,
    }
    response_without_consent: dict[str, object] = {
        "response_id": "opaque-1",
        "answers": answers_without_consent,
    }
    with pytest.raises(ValueError, match="affirmative consent"):
        native_survey_rows(form, [response_without_consent])

    response_with_consent = {
        **response_without_consent,
        "answers": {
            **answers_without_consent,
            "consent": True,
        },
    }
    with pytest.raises(ValueError, match="unique within a batch"):
        native_survey_rows(form, [response_with_consent, response_with_consent])


def test_native_form_rejects_identity_and_political_answers() -> None:
    form = _form()
    with pytest.raises(ValueError, match="identity or political"):
        native_survey_rows(
            form,
            [
                {
                    "response_id": "opaque-1",
                    "answers": {"email": "not-collected"},
                }
            ],
        )
