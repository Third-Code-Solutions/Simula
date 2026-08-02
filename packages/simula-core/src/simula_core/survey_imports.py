"""Provider-neutral, aggregate-only survey import adapters.

Adapters normalize CSV, Formbricks, ODK, and generic JSON exports into the
aggregate ``SurveyDataset`` contract. Individual response values are consumed
in memory, never returned, and identity/political-targeting fields are rejected.
"""

from __future__ import annotations

import csv
import json
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from hashlib import sha256
from io import StringIO
from typing import Any, Literal, Protocol, cast

from pydantic import Field

from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import (
    FrozenModel,
    Key,
    Label,
    MetricKey,
    MetricScore,
    ReactionDistribution,
    ReactionKey,
    ReactionShare,
    Sha256,
    ShortText,
)
from simula_core.survey_calibration import (
    SurveyDataset,
    SurveyProvenance,
    SurveyVariantObservation,
)

SurveyImportFormat = Literal["csv", "formbricks", "odk", "generic_json"]
SurveyImportPayload = str | bytes | Mapping[str, object] | Sequence[Mapping[str, object]]

_REACTION_KEYS: tuple[ReactionKey, ...] = ("positive", "neutral", "negative", "mixed")
_METRIC_KEYS: tuple[MetricKey, ...] = (
    "clarity",
    "relevance",
    "trust",
    "persuasiveness",
    "consideration",
)
_PROHIBITED_FIELD_PARTS = (
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
)


class SurveyImportMetadata(FrozenModel):
    source_id: Key
    source_version: Label
    owner: Label
    license: Label
    allowed_uses: tuple[ShortText, ...] = Field(min_length=1)
    collection_period: ShortText
    geography: Label
    methodology: ShortText
    consent_recorded: bool
    authorized_for_calibration: bool
    quality_filter_version: Key
    known_biases: tuple[ShortText, ...] = Field(min_length=1)
    coverage_limitations: tuple[ShortText, ...] = Field(min_length=1)


class SurveyImportFieldMap(FrozenModel):
    variant_key: str = Field(default="variant_key", min_length=1, max_length=120)
    cohort_key: str = Field(default="cohort_key", min_length=1, max_length=120)
    reaction_positive: str = Field(default="reaction_positive", min_length=1, max_length=120)
    reaction_neutral: str = Field(default="reaction_neutral", min_length=1, max_length=120)
    reaction_negative: str = Field(default="reaction_negative", min_length=1, max_length=120)
    reaction_mixed: str = Field(default="reaction_mixed", min_length=1, max_length=120)
    metric_clarity: str = Field(default="clarity", min_length=1, max_length=120)
    metric_relevance: str = Field(default="relevance", min_length=1, max_length=120)
    metric_trust: str = Field(default="trust", min_length=1, max_length=120)
    metric_persuasiveness: str = Field(default="persuasiveness", min_length=1, max_length=120)
    metric_consideration: str = Field(default="consideration", min_length=1, max_length=120)
    share_intent: str | None = Field(default=None, max_length=120)
    post_stratification_weight: str | None = Field(default=None, max_length=120)
    respondent_key: str | None = Field(default=None, max_length=120)
    quality_score: str | None = Field(default=None, max_length=120)
    bot_flag: str | None = Field(default=None, max_length=120)
    completed_flag: str | None = Field(default=None, max_length=120)

    def reaction_fields(self) -> tuple[str, str, str, str]:
        return (
            self.reaction_positive,
            self.reaction_neutral,
            self.reaction_negative,
            self.reaction_mixed,
        )

    def metric_fields(self) -> tuple[tuple[MetricKey, str], ...]:
        return (
            ("clarity", self.metric_clarity),
            ("relevance", self.metric_relevance),
            ("trust", self.metric_trust),
            ("persuasiveness", self.metric_persuasiveness),
            ("consideration", self.metric_consideration),
        )


class SurveyImportSummary(FrozenModel):
    format: SurveyImportFormat
    input_response_count: int = Field(ge=0)
    accepted_response_count: int = Field(ge=0)
    duplicate_response_count: int = Field(ge=0)
    low_quality_response_count: int = Field(ge=0)
    bot_response_count: int = Field(ge=0)
    malformed_response_count: int = Field(ge=0)
    warnings: tuple[ShortText, ...] = Field(default=(), max_length=20)


class SurveyImportResult(FrozenModel):
    dataset: SurveyDataset
    summary: SurveyImportSummary
    payload_checksum_sha256: Sha256


class SurveyImportAdapter(Protocol):
    format: SurveyImportFormat

    def import_dataset(
        self,
        payload: SurveyImportPayload,
        *,
        metadata: SurveyImportMetadata,
        field_map: SurveyImportFieldMap,
    ) -> SurveyImportResult: ...


@dataclass
class _Group:
    count: int = 0
    total_weight: float = 0.0
    quality_total: float = 0.0
    reactions: list[float] | None = None
    metrics: list[float] | None = None
    share_intent_total: float = 0.0
    share_intent_count: int = 0


def _payload_bytes(payload: SurveyImportPayload) -> bytes:
    if isinstance(payload, bytes):
        return payload
    if isinstance(payload, str):
        return payload.encode("utf-8")
    return canonical_json_dumps(payload)


def _is_prohibited_field(field: str) -> bool:
    normalized = field.casefold().replace("-", "_").replace(" ", "_")
    return any(part in normalized for part in _PROHIBITED_FIELD_PARTS)


def _check_field_map(field_map: SurveyImportFieldMap) -> None:
    fields = [
        field_map.variant_key,
        field_map.cohort_key,
        *field_map.reaction_fields(),
        *(field for _, field in field_map.metric_fields()),
        field_map.share_intent,
        field_map.post_stratification_weight,
        field_map.respondent_key,
        field_map.quality_score,
        field_map.bot_flag,
        field_map.completed_flag,
    ]
    for field in fields:
        allowed_opaque_key = field in {
            "id",
            "response_id",
            "responseId",
            "respondent_id",
            "__provider_respondent_key",
        }
        if field is not None and _is_prohibited_field(field) and not allowed_opaque_key:
            raise ValueError("survey import contains an unauthorized identity or political field")


def _allowed_opaque_field(field: str, respondent_key: str | None) -> bool:
    return field == respondent_key or field in {
        "id",
        "response_id",
        "responseId",
        "respondent_id",
        "__provider_respondent_key",
    }


def _normalized_key(value: object, field: str) -> str:
    raw = str(value or "").strip().casefold()
    normalized = "".join(character if character.isalnum() else "_" for character in raw)
    normalized = normalized.strip("_")[:64]
    if not normalized:
        raise ValueError(f"survey field {field} must contain a key")
    if not normalized[0].isalpha():
        normalized = f"key_{normalized}"[:64]
    return normalized


def _rows_from_json_payload(
    payload: Mapping[str, object] | Sequence[Mapping[str, object]],
    import_format: SurveyImportFormat,
) -> list[dict[str, object]]:
    def rows(value: object) -> list[dict[str, object]]:
        if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
            flattened_rows: list[dict[str, object]] = []
            for item in value:
                if not isinstance(item, Mapping):
                    continue
                nested_item = item.get("data")
                if isinstance(nested_item, Mapping) and import_format in {"formbricks", "odk"}:
                    flattened = dict(nested_item)
                    for key in ("id", "responseId", "response_id", "_id"):
                        if key in item and "__provider_respondent_key" not in flattened:
                            flattened["__provider_respondent_key"] = item[key]
                    flattened_rows.append(flattened)
                else:
                    flattened_rows.append(dict(item))
            return flattened_rows
        if not isinstance(value, Mapping):
            return []
        for key in ("responses", "items", "value"):
            nested = value.get(key)
            if nested is not None:
                nested_rows = rows(nested)
                if nested_rows:
                    return nested_rows
        nested_data = value.get("data")
        if isinstance(nested_data, Sequence) and not isinstance(
            nested_data, (str, bytes, bytearray)
        ):
            return rows(nested_data)
        if isinstance(nested_data, Mapping) and import_format in {"formbricks", "odk"}:
            flattened = dict(nested_data)
            for key in ("id", "responseId", "response_id", "_id"):
                if key in value and "__provider_respondent_key" not in flattened:
                    flattened["__provider_respondent_key"] = value[key]
            return [flattened]
        return [dict(value)]

    return rows(payload)


def _rows_from_payload(
    payload: SurveyImportPayload, import_format: SurveyImportFormat
) -> list[dict[str, object]]:
    if import_format == "csv":
        if isinstance(payload, bytes):
            text = payload.decode("utf-8-sig")
        elif isinstance(payload, str):
            text = payload
        else:
            raise ValueError("CSV survey import payload must be text")
        reader = csv.DictReader(StringIO(text, newline=""))
        if reader.fieldnames is None or any(not field for field in reader.fieldnames):
            raise ValueError("CSV survey import requires a non-empty header")
        return [dict(row) for row in reader]
    if isinstance(payload, (str, bytes)):
        try:
            decoded = json.loads(payload.decode("utf-8") if isinstance(payload, bytes) else payload)
        except json.JSONDecodeError as error:
            raise ValueError("JSON survey import payload is malformed") from error
        if not isinstance(decoded, (Mapping, list)):
            raise ValueError("JSON survey import payload must contain response rows")
        return _rows_from_json_payload(cast(Any, decoded), import_format)
    return _rows_from_json_payload(payload, import_format)


def _field_value(row: Mapping[str, object], field: str) -> object:
    current: object = row
    for part in field.split("."):
        if not isinstance(current, Mapping) or part not in current:
            return None
        current = current[part]
    return current


def _number(value: object, field: str) -> float:
    if isinstance(value, bool) or value is None:
        raise ValueError(f"survey field {field} must be numeric")
    try:
        parsed = float(str(value).strip().replace(",", ""))
    except (TypeError, ValueError) as error:
        raise ValueError(f"survey field {field} must be numeric") from error
    if not math.isfinite(parsed):
        raise ValueError(f"survey field {field} must be finite")
    return parsed


def _probability(value: object, field: str) -> float:
    parsed = _number(value, field)
    if parsed < 0 or parsed > 100:
        raise ValueError(f"survey field {field} must be between zero and one hundred")
    return parsed / 100 if parsed > 1 else parsed


def _boolean(value: object, field: str) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().casefold()
    if normalized in {"1", "true", "yes", "y", "bot", "incomplete"}:
        return True
    if normalized in {"0", "false", "no", "n", "not_bot", "complete", "completed"}:
        return False
    raise ValueError(f"survey field {field} must be boolean")


def _normalized_distribution(
    row: Mapping[str, object], field_map: SurveyImportFieldMap
) -> list[float]:
    values = [_number(_field_value(row, field), field) for field in field_map.reaction_fields()]
    if any(value < 0 for value in values):
        raise ValueError("reaction shares must be non-negative")
    total = sum(values)
    if total <= 0:
        raise ValueError("reaction shares must contain a positive total")
    if total > 100.000001 and total <= 10_000.000001:
        values = [value / 100 for value in values]
        total = sum(values)
    return [value / total for value in values]


def _dataset_from_rows(
    rows: Sequence[Mapping[str, object]],
    *,
    import_format: SurveyImportFormat,
    metadata: SurveyImportMetadata,
    field_map: SurveyImportFieldMap,
    payload_checksum_sha256: Sha256,
) -> SurveyImportResult:
    _check_field_map(field_map)
    for row in rows[:100_000]:
        if any(
            _is_prohibited_field(field)
            and not _allowed_opaque_field(field, field_map.respondent_key)
            for field in row
        ):
            raise ValueError("survey import contains an unauthorized identity or political field")
    groups: dict[tuple[str, str], _Group] = {}
    seen_keys: set[str] = set()
    duplicate_count = 0
    low_quality_count = 0
    bot_count = 0
    malformed_count = 0

    for row in rows[:100_000]:
        try:
            respondent_key = (
                _field_value(row, field_map.respondent_key)
                if field_map.respondent_key is not None
                else _field_value(row, "__provider_respondent_key")
            )
            if respondent_key is not None and str(respondent_key).strip():
                normalized_key = str(respondent_key).strip()
                if normalized_key in seen_keys:
                    duplicate_count += 1
                    continue
                seen_keys.add(normalized_key)
            if field_map.bot_flag is not None and _boolean(
                _field_value(row, field_map.bot_flag), field_map.bot_flag
            ):
                bot_count += 1
                continue
            if field_map.completed_flag is not None and not _boolean(
                _field_value(row, field_map.completed_flag), field_map.completed_flag
            ):
                low_quality_count += 1
                continue
            quality = 1.0
            if field_map.quality_score is not None:
                quality = _probability(
                    _field_value(row, field_map.quality_score), field_map.quality_score
                )
                if quality < 0.5:
                    low_quality_count += 1
                    continue
            variant_key = _normalized_key(
                _field_value(row, field_map.variant_key), field_map.variant_key
            )
            cohort_key = _normalized_key(
                _field_value(row, field_map.cohort_key), field_map.cohort_key
            )
            weight = (
                _number(
                    _field_value(row, field_map.post_stratification_weight),
                    field_map.post_stratification_weight,
                )
                if field_map.post_stratification_weight is not None
                else 1.0
            )
            if weight <= 0:
                raise ValueError("post-stratification weight must be positive")
            reactions = _normalized_distribution(row, field_map)
            metrics = [
                _number(_field_value(row, field), field) for _, field in field_map.metric_fields()
            ]
            if any(value < 0 or value > 100 for value in metrics):
                raise ValueError("survey metrics must be between zero and one hundred")
            share_intent = (
                _probability(_field_value(row, field_map.share_intent), field_map.share_intent)
                if field_map.share_intent is not None
                else None
            )
            group = groups.setdefault((variant_key, cohort_key), _Group())
            group.count += 1
            group.total_weight += weight
            group.quality_total += quality
            if group.reactions is None:
                group.reactions = [0.0] * 4
                group.metrics = [0.0] * 5
            if group.metrics is None or group.reactions is None:
                raise RuntimeError("survey import accumulator initialization failed")
            for index, value in enumerate(reactions):
                group.reactions[index] += weight * value
            for index, value in enumerate(metrics):
                group.metrics[index] += weight * value
            if share_intent is not None:
                group.share_intent_total += weight * share_intent
                group.share_intent_count += 1
        except TypeError, ValueError:
            malformed_count += 1

    observations: list[SurveyVariantObservation] = []
    for (variant_key, cohort_key), group in sorted(groups.items()):
        if group.count == 0 or group.reactions is None or group.metrics is None:
            continue
        weight = group.total_weight
        observations.append(
            SurveyVariantObservation(
                variant_key=variant_key,
                cohort_key=cohort_key,
                respondent_count=group.count,
                post_stratification_weight=weight / group.count,
                reaction_distribution=ReactionDistribution(
                    categories=tuple(  # type: ignore[arg-type]
                        ReactionShare(key=key, value=value / weight)
                        for key, value in zip(_REACTION_KEYS, group.reactions, strict=True)
                    )
                ),
                metrics=tuple(  # type: ignore[arg-type]
                    MetricScore(key=key, value=value / weight)
                    for (key, _), value in zip(
                        field_map.metric_fields(), group.metrics, strict=True
                    )
                ),
                share_intent=(
                    group.share_intent_total / weight if group.share_intent_count > 0 else None
                ),
                quality_pass_rate=group.quality_total / group.count,
            )
        )
    if not observations:
        raise ValueError("survey import contains no valid aggregate observations")

    accepted_count = sum(item.respondent_count for item in observations)
    provenance = SurveyProvenance(
        source_id=metadata.source_id,
        source_version=metadata.source_version,
        owner=metadata.owner,
        license=metadata.license,
        allowed_uses=metadata.allowed_uses,
        collection_period=metadata.collection_period,
        geography=metadata.geography,
        methodology=metadata.methodology,
        consent_recorded=metadata.consent_recorded,
        authorized_for_calibration=metadata.authorized_for_calibration,
        quality_filter_version=metadata.quality_filter_version,
        sample_size=accepted_count,
        checksum_sha256=payload_checksum_sha256,
        known_biases=metadata.known_biases,
        coverage_limitations=metadata.coverage_limitations,
    )
    return SurveyImportResult(
        dataset=SurveyDataset(provenance=provenance, observations=tuple(observations)),
        summary=SurveyImportSummary(
            format=import_format,
            input_response_count=min(len(rows), 100_000),
            accepted_response_count=accepted_count,
            duplicate_response_count=duplicate_count,
            low_quality_response_count=low_quality_count,
            bot_response_count=bot_count,
            malformed_response_count=malformed_count + max(0, len(rows) - 100_000),
            warnings=(
                "Individual response records are consumed in memory and are not retained.",
                "Import output is aggregate-only and requires separate rights admission.",
            ),
        ),
        payload_checksum_sha256=payload_checksum_sha256,
    )


def import_survey(
    payload: SurveyImportPayload,
    *,
    import_format: SurveyImportFormat,
    metadata: SurveyImportMetadata,
    field_map: SurveyImportFieldMap | None = None,
) -> SurveyImportResult:
    """Normalize an external survey export without persisting respondent rows."""

    selected_field_map = field_map or SurveyImportFieldMap()
    checksum = sha256(_payload_bytes(payload)).hexdigest()
    rows = _rows_from_payload(payload, import_format)
    return _dataset_from_rows(
        rows,
        import_format=import_format,
        metadata=metadata,
        field_map=selected_field_map,
        payload_checksum_sha256=checksum,
    )


class CsvSurveyAdapter:
    format: Literal["csv"] = "csv"

    def import_dataset(
        self,
        payload: SurveyImportPayload,
        *,
        metadata: SurveyImportMetadata,
        field_map: SurveyImportFieldMap,
    ) -> SurveyImportResult:
        return import_survey(
            payload, import_format=self.format, metadata=metadata, field_map=field_map
        )


class FormbricksSurveyAdapter:
    format: Literal["formbricks"] = "formbricks"

    def import_dataset(
        self,
        payload: SurveyImportPayload,
        *,
        metadata: SurveyImportMetadata,
        field_map: SurveyImportFieldMap,
    ) -> SurveyImportResult:
        return import_survey(
            payload, import_format=self.format, metadata=metadata, field_map=field_map
        )


class OdkSurveyAdapter:
    format: Literal["odk"] = "odk"

    def import_dataset(
        self,
        payload: SurveyImportPayload,
        *,
        metadata: SurveyImportMetadata,
        field_map: SurveyImportFieldMap,
    ) -> SurveyImportResult:
        return import_survey(
            payload, import_format=self.format, metadata=metadata, field_map=field_map
        )


class GenericSurveyAdapter:
    format: Literal["generic_json"] = "generic_json"

    def import_dataset(
        self,
        payload: SurveyImportPayload,
        *,
        metadata: SurveyImportMetadata,
        field_map: SurveyImportFieldMap,
    ) -> SurveyImportResult:
        return import_survey(
            payload, import_format=self.format, metadata=metadata, field_map=field_map
        )
