from __future__ import annotations

import pytest
from simula_core.cultural_evaluation import (
    REQUIRED_DIMENSIONS,
    CulturalDimensionRating,
    CulturalEvaluationSuite,
    HumanReviewedLanguageExample,
    evaluate_cultural_suite,
)


def _suite() -> CulturalEvaluationSuite:
    examples = tuple(
        HumanReviewedLanguageExample(
            case_id=f"{language}_case",
            language=language,
            stimulus="A community message for review.",
            model_output="A reviewed language-model response.",
            expected_interpretation="The message is clear and respectful.",
            model_version="fixture-model-v1",
            prompt_version="fixture-prompt-v1",
            reviewer="Human reviewer",
            ratings=tuple(
                CulturalDimensionRating(
                    dimension=dimension,
                    rating=rating,
                    reviewer_note="Reviewed against the declared language rubric.",
                )
                for dimension in REQUIRED_DIMENSIONS
            ),
        )
        for language, rating in (("english", 5), ("filipino", 4), ("taglish", 3))
    )
    return CulturalEvaluationSuite(
        suite_id="philippine_language_suite",
        suite_version="v1",
        examples=examples,
    )


def test_cultural_suite_requires_reviewed_language_coverage_and_reports_dimensions() -> None:
    result = evaluate_cultural_suite(_suite())

    assert result.status == "Human-reviewed"
    assert result.case_count == 3
    assert result.overall_mean_rating == pytest.approx(4.0)
    assert [item.language for item in result.language_summaries] == [
        "english",
        "filipino",
        "taglish",
    ]
    assert len(result.dimension_summaries) == len(REQUIRED_DIMENSIONS)
    assert result.low_scoring_dimensions == ()
    assert len(result.reproducibility_checksum_sha256) == 64


def test_cultural_suite_rejects_missing_language_coverage() -> None:
    suite = _suite()
    examples = (
        suite.examples[0],
        suite.examples[1],
        suite.examples[0].model_copy(update={"case_id": "english_case_2"}),
    )
    with pytest.raises(ValueError, match="required language"):
        CulturalEvaluationSuite(
            suite_id=suite.suite_id,
            suite_version=suite.suite_version,
            examples=examples,
        )


def test_cultural_suite_rejects_unreviewed_examples() -> None:
    suite = _suite()
    payload = suite.examples[0].model_dump(mode="json")
    payload["reviewed_by_human"] = False
    with pytest.raises(ValueError, match="Input should be True"):
        HumanReviewedLanguageExample.model_validate(payload)
