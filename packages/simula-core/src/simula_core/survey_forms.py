"""SIMULA-native, aggregate-only survey forms.

Native forms deliberately expose a small calibration schema instead of a
general-purpose respondent profile builder.  This keeps collection useful for
message testing while preventing free-text identity, political-affiliation,
or vulnerability fields from entering the Campaign Lab pipeline.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from hashlib import sha256
from math import isfinite
from typing import Annotated, Any, Literal, Self

from pydantic import Field, StringConstraints, model_validator

from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import FrozenModel, Key, Label, Sha256, ShortText

NativeSurveyQuestionKey = Literal[
    "variant_key",
    "cohort_key",
    "reaction",
    "clarity",
    "relevance",
    "trust",
    "persuasiveness",
    "consideration",
    "share_intent",
    "consent",
]
NativeSurveyQuestionKind = Literal[
    "variant",
    "cohort",
    "reaction",
    "metric",
    "share_intent",
    "consent",
]
NativeSurveyLanguage = Literal["english", "filipino", "taglish"]

_QUESTION_ORDER: tuple[NativeSurveyQuestionKey, ...] = (
    "variant_key",
    "cohort_key",
    "reaction",
    "clarity",
    "relevance",
    "trust",
    "persuasiveness",
    "consideration",
    "share_intent",
    "consent",
)
_REQUIRED_QUESTION_KEYS = frozenset(
    {
        "variant_key",
        "cohort_key",
        "reaction",
        "clarity",
        "relevance",
        "trust",
        "persuasiveness",
        "consideration",
        "consent",
    }
)
_REACTION_OPTIONS: tuple[Key, ...] = ("positive", "neutral", "negative", "mixed")
_METRIC_KEYS = frozenset({"clarity", "relevance", "trust", "persuasiveness", "consideration"})
_PROHIBITED_ANSWER_KEYS = frozenset(
    {
        "email",
        "phone",
        "mobile",
        "full_name",
        "first_name",
        "last_name",
        "address",
        "street",
        "voter_id",
        "national_id",
        "party_affiliation",
        "political_affiliation",
        "ideology",
        "persuadability",
        "vulnerability",
    }
)


class NativeSurveyProvenance(FrozenModel):
    """Provenance and consent metadata required before collection starts."""

    source_id: Key
    source_version: Label
    owner: Label
    license: Label
    allowed_uses: tuple[ShortText, ...] = Field(min_length=1)
    collection_period: ShortText
    geography: Label
    methodology: ShortText
    consent_recorded: Literal[True] = True
    authorized_for_calibration: Literal[True] = True
    quality_filter_version: Key = "native_response_quality_v1"
    known_biases: tuple[ShortText, ...] = Field(min_length=1)
    coverage_limitations: tuple[ShortText, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def permits_calibration(self) -> Self:
        if not any("calibration" in value.casefold() for value in self.allowed_uses):
            raise ValueError("native survey provenance must permit calibration")
        return self


class NativeSurveyQuestion(FrozenModel):
    key: NativeSurveyQuestionKey
    kind: NativeSurveyQuestionKind
    label: ShortText
    required: bool = True
    options: tuple[Key, ...] = Field(default=(), max_length=100)

    @model_validator(mode="after")
    def matches_calibration_contract(self) -> Self:
        expected_kind: dict[NativeSurveyQuestionKey, NativeSurveyQuestionKind] = {
            "variant_key": "variant",
            "cohort_key": "cohort",
            "reaction": "reaction",
            "clarity": "metric",
            "relevance": "metric",
            "trust": "metric",
            "persuasiveness": "metric",
            "consideration": "metric",
            "share_intent": "share_intent",
            "consent": "consent",
        }
        if self.kind != expected_kind[self.key]:
            raise ValueError(f"native survey question {self.key} has an invalid kind")
        if len(self.options) != len(set(self.options)):
            raise ValueError(f"native survey question {self.key} options must be unique")
        if self.key == "variant_key" and len(self.options) < 2:
            raise ValueError("native survey forms require at least two message variants")
        if self.key == "cohort_key" and not self.options:
            raise ValueError("native survey forms require at least one aggregate cohort")
        if self.key == "reaction" and self.options != _REACTION_OPTIONS:
            raise ValueError(
                "native survey reaction options must use the canonical four categories"
            )
        if self.key != "reaction" and tuple(sorted(self.options)) != self.options:
            raise ValueError(f"native survey question {self.key} options must be sorted")
        if self.key in _METRIC_KEYS or self.key == "share_intent" or self.key == "consent":
            if self.options:
                raise ValueError(f"native survey question {self.key} cannot have options")
        if self.key == "consent" and not self.required:
            raise ValueError("native survey consent must be required")
        return self


class NativeSurveyForm(FrozenModel):
    schema_version: Literal[1] = 1
    version: int = Field(ge=1, le=1000)
    title: Label
    description: ShortText
    language: NativeSurveyLanguage
    collection_purpose: Literal["survey_calibration"] = "survey_calibration"
    consent_text: ShortText
    privacy_notice: ShortText
    provenance: NativeSurveyProvenance
    questions: tuple[NativeSurveyQuestion, ...] = Field(min_length=9, max_length=10)
    max_batch_size: int = Field(default=100, ge=1, le=100)
    checksum_sha256: Sha256 = "0" * 64

    @model_validator(mode="after")
    def valid_form(self) -> Self:
        keys = tuple(question.key for question in self.questions)
        if len(keys) != len(set(keys)):
            raise ValueError("native survey question keys must be unique")
        if not _REQUIRED_QUESTION_KEYS.issubset(keys):
            missing = sorted(_REQUIRED_QUESTION_KEYS.difference(keys))
            raise ValueError(
                f"native survey form is missing required questions: {', '.join(missing)}"
            )
        if keys != tuple(sorted(keys, key=_QUESTION_ORDER.index)):
            raise ValueError("native survey questions must use canonical order")
        expected = self.compute_checksum(self.model_dump(mode="json", exclude={"checksum_sha256"}))
        if self.checksum_sha256 == "0" * 64:
            object.__setattr__(self, "checksum_sha256", expected)
        elif self.checksum_sha256 != expected:
            raise ValueError("native survey form checksum mismatch")
        return self

    @staticmethod
    def compute_checksum(payload: Mapping[str, object]) -> str:
        return sha256(canonical_json_dumps(payload)).hexdigest()

    def question_map(self) -> dict[NativeSurveyQuestionKey, NativeSurveyQuestion]:
        return {question.key: question for question in self.questions}


class NativeSurveyResponse(FrozenModel):
    response_id: Annotated[
        str,
        StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$"),
    ]
    answers: dict[str, Any] = Field(min_length=1, max_length=10)


def _number(value: object, field: str) -> float:
    if isinstance(value, bool) or value is None:
        raise ValueError(f"native survey answer {field} must be numeric")
    try:
        parsed = float(str(value).strip().replace(",", ""))
    except (TypeError, ValueError) as error:
        raise ValueError(f"native survey answer {field} must be numeric") from error
    if not isfinite(parsed):
        raise ValueError(f"native survey answer {field} must be finite")
    if parsed < 0 or parsed > 100:
        raise ValueError(f"native survey answer {field} must be between zero and one hundred")
    return parsed


def _metric(value: object, field: str) -> float:
    return _number(value, field)


def _share(value: object, field: str) -> float:
    parsed = _number(value, field)
    return parsed if parsed <= 1 else parsed / 100


def _answer_key_is_safe(key: str) -> bool:
    normalized = key.casefold().replace("-", "_").replace(" ", "_")
    return not any(part in normalized for part in _PROHIBITED_ANSWER_KEYS)


def native_survey_rows(
    form: NativeSurveyForm,
    responses: Sequence[Mapping[str, object] | NativeSurveyResponse],
) -> tuple[dict[str, object], ...]:
    """Validate native responses and compile them to the worker import schema.

    The returned rows are transient worker input. They must not be returned by
    an API handler or persisted outside ``private.campaign_lab_secrets``.
    """

    if not responses:
        raise ValueError("native survey response batch cannot be empty")
    if len(responses) > form.max_batch_size:
        raise ValueError("native survey response batch exceeds the form limit")
    question_map = form.question_map()
    response_ids: set[str] = set()
    compiled: list[dict[str, object]] = []
    for raw_response in responses:
        response = (
            raw_response
            if isinstance(raw_response, NativeSurveyResponse)
            else NativeSurveyResponse.model_validate(raw_response)
        )
        if response.response_id in response_ids:
            raise ValueError("native survey response ids must be unique within a batch")
        response_ids.add(response.response_id)
        if any(not _answer_key_is_safe(key) for key in response.answers):
            raise ValueError("native survey responses cannot contain identity or political fields")
        unknown = set(response.answers).difference(question_map)
        if unknown:
            raise ValueError("native survey response contains an unsupported question")
        missing = {
            key
            for key, question in question_map.items()
            if question.required and key not in response.answers
        }
        if missing:
            raise ValueError("native survey response is missing a required answer")
        if response.answers.get("consent") is not True:
            raise ValueError("native survey response requires affirmative consent")
        variant = response.answers.get("variant_key")
        cohort = response.answers.get("cohort_key")
        reaction = response.answers.get("reaction")
        if not isinstance(variant, str) or variant not in question_map["variant_key"].options:
            raise ValueError("native survey response has an invalid variant")
        if not isinstance(cohort, str) or cohort not in question_map["cohort_key"].options:
            raise ValueError("native survey response has an invalid cohort")
        if not isinstance(reaction, str) or reaction not in _REACTION_OPTIONS:
            raise ValueError("native survey response has an invalid reaction")
        row: dict[str, object] = {
            "response_id": response.response_id,
            "variant_key": variant,
            "cohort_key": cohort,
            "positive": 100 if reaction == "positive" else 0,
            "neutral": 100 if reaction == "neutral" else 0,
            "negative": 100 if reaction == "negative" else 0,
            "mixed": 100 if reaction == "mixed" else 0,
            "quality": 1.0,
            "completed": True,
        }
        for metric_key in _METRIC_KEYS:
            row[metric_key] = _metric(response.answers.get(metric_key), metric_key)
        if "share_intent" in response.answers:
            row["share_intent"] = _share(response.answers["share_intent"], "share_intent")
        compiled.append(row)
    return tuple(compiled)


__all__ = [
    "NativeSurveyForm",
    "NativeSurveyProvenance",
    "NativeSurveyQuestion",
    "NativeSurveyResponse",
    "native_survey_rows",
]
