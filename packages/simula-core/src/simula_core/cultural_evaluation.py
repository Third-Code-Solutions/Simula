"""Human-reviewed Philippine language and cultural evaluation contracts.

The suite evaluates language-model outputs against reviewed examples. It is a
benchmark of translation and cultural-risk dimensions, not a campaign score or
evidence that a model understands every Philippine context.
"""

from __future__ import annotations

from collections.abc import Mapping
from hashlib import sha256
from math import fsum
from typing import Literal, Self

from pydantic import Field, model_validator

from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import FrozenModel, Key, Label, Sha256, ShortText

LanguageVariant = Literal["english", "filipino", "taglish"]
CulturalDimension = Literal[
    "translation_accuracy",
    "naturalness",
    "formality",
    "respect_markers",
    "local_idioms",
    "ambiguous_wording",
    "class_coded_language",
    "regional_sensitivity",
    "religious_sensitivity",
    "historical_sensitivity",
    "humor_interpretation",
    "sarcasm_interpretation",
    "potential_insult",
    "potential_stereotyping",
    "misleading_translation",
    "cultural_mismatch",
]

SUPPORTED_LANGUAGES: tuple[LanguageVariant, ...] = ("english", "filipino", "taglish")
REQUIRED_DIMENSIONS: tuple[CulturalDimension, ...] = (
    "translation_accuracy",
    "naturalness",
    "formality",
    "respect_markers",
    "local_idioms",
    "ambiguous_wording",
    "class_coded_language",
    "regional_sensitivity",
    "religious_sensitivity",
    "historical_sensitivity",
    "humor_interpretation",
    "sarcasm_interpretation",
    "potential_insult",
    "potential_stereotyping",
    "misleading_translation",
    "cultural_mismatch",
)


class CulturalDimensionRating(FrozenModel):
    dimension: CulturalDimension
    rating: int = Field(ge=1, le=5)
    reviewer_note: ShortText


class HumanReviewedLanguageExample(FrozenModel):
    case_id: Key
    language: LanguageVariant
    stimulus: ShortText
    model_output: ShortText
    expected_interpretation: ShortText
    model_version: Label
    prompt_version: Label
    reviewer: Label
    ratings: tuple[CulturalDimensionRating, ...] = Field(min_length=1, max_length=16)
    reviewed_by_human: Literal[True] = True

    @model_validator(mode="after")
    def unique_ratings(self) -> Self:
        dimensions = tuple(item.dimension for item in self.ratings)
        if len(dimensions) != len(set(dimensions)):
            raise ValueError("cultural evaluation dimensions must be unique per example")
        return self


class CulturalEvaluationSuite(FrozenModel):
    suite_id: Key
    suite_version: Label
    examples: tuple[HumanReviewedLanguageExample, ...] = Field(min_length=3, max_length=10_000)
    required_languages: tuple[LanguageVariant, ...] = SUPPORTED_LANGUAGES
    required_dimensions: tuple[CulturalDimension, ...] = REQUIRED_DIMENSIONS
    checksum_sha256: Sha256 = "0" * 64

    @model_validator(mode="after")
    def valid_coverage(self) -> Self:
        languages = {example.language for example in self.examples}
        if set(self.required_languages) != set(SUPPORTED_LANGUAGES):
            raise ValueError("the suite must cover English, Filipino, and Taglish")
        if not set(self.required_languages).issubset(languages):
            raise ValueError("cultural evaluation suite is missing a required language")
        dimensions = {rating.dimension for example in self.examples for rating in example.ratings}
        if not set(self.required_dimensions).issubset(dimensions):
            raise ValueError("cultural evaluation suite is missing a required dimension")
        case_ids = [example.case_id for example in self.examples]
        if len(case_ids) != len(set(case_ids)):
            raise ValueError("cultural evaluation case ids must be unique")
        expected = self.compute_checksum(self.model_dump(mode="json", exclude={"checksum_sha256"}))
        if self.checksum_sha256 == "0" * 64:
            object.__setattr__(self, "checksum_sha256", expected)
        elif self.checksum_sha256 != expected:
            raise ValueError("cultural evaluation suite checksum mismatch")
        return self

    @staticmethod
    def compute_checksum(payload: Mapping[str, object]) -> str:
        return sha256(canonical_json_dumps(payload)).hexdigest()


class CulturalDimensionSummary(FrozenModel):
    dimension: CulturalDimension
    case_count: int = Field(ge=1)
    mean_rating: float = Field(ge=1.0, le=5.0)


class CulturalLanguageSummary(FrozenModel):
    language: LanguageVariant
    case_count: int = Field(ge=1)
    mean_rating: float = Field(ge=1.0, le=5.0)


class CulturalEvaluationResult(FrozenModel):
    schema_version: Literal[1] = 1
    status: Literal["Human-reviewed"] = "Human-reviewed"
    suite_id: Key
    suite_version: Label
    model_versions: tuple[Label, ...] = Field(min_length=1)
    case_count: int = Field(ge=3)
    overall_mean_rating: float = Field(ge=1.0, le=5.0)
    language_summaries: tuple[CulturalLanguageSummary, ...]
    dimension_summaries: tuple[CulturalDimensionSummary, ...]
    low_scoring_dimensions: tuple[CulturalDimension, ...]
    limitations: tuple[ShortText, ...] = Field(min_length=1, max_length=10)
    reproducibility_checksum_sha256: Sha256 = "0" * 64


def evaluate_cultural_suite(suite: CulturalEvaluationSuite) -> CulturalEvaluationResult:
    """Summarize reviewed language/cultural cases without inventing a model score."""

    all_ratings = [rating for example in suite.examples for rating in example.ratings]
    by_language: dict[LanguageVariant, list[int]] = {
        language: [] for language in SUPPORTED_LANGUAGES
    }
    by_dimension: dict[CulturalDimension, list[int]] = {
        dimension: [] for dimension in REQUIRED_DIMENSIONS
    }
    for example in suite.examples:
        for rating in example.ratings:
            by_language[example.language].append(rating.rating)
            by_dimension[rating.dimension].append(rating.rating)
    result = CulturalEvaluationResult(
        suite_id=suite.suite_id,
        suite_version=suite.suite_version,
        model_versions=tuple(sorted({example.model_version for example in suite.examples})),
        case_count=len(suite.examples),
        overall_mean_rating=fsum(item.rating for item in all_ratings) / len(all_ratings),
        language_summaries=tuple(
            CulturalLanguageSummary(
                language=language,
                case_count=sum(example.language == language for example in suite.examples),
                mean_rating=fsum(by_language[language]) / len(by_language[language]),
            )
            for language in SUPPORTED_LANGUAGES
        ),
        dimension_summaries=tuple(
            CulturalDimensionSummary(
                dimension=dimension,
                case_count=len(by_dimension[dimension]),
                mean_rating=fsum(by_dimension[dimension]) / len(by_dimension[dimension]),
            )
            for dimension in REQUIRED_DIMENSIONS
        ),
        low_scoring_dimensions=tuple(
            dimension
            for dimension in REQUIRED_DIMENSIONS
            if fsum(by_dimension[dimension]) / len(by_dimension[dimension]) < 3.0
        ),
        limitations=(
            "Human-reviewed examples are benchmark evidence, not universal cultural competence.",
            "Regional-language coverage remains disabled until an admitted evaluation "
            "dataset exists.",
            "Ratings do not establish campaign lift, persuasion, or electoral outcomes.",
        ),
    )
    checksum = sha256(
        canonical_json_dumps(
            result.model_dump(mode="json", exclude={"reproducibility_checksum_sha256"})
        )
    ).hexdigest()
    return result.model_copy(update={"reproducibility_checksum_sha256": checksum})
