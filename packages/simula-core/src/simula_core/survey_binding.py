"""Deterministic binding of an import's bytes, normalization and aggregates."""

from hashlib import sha256
from typing import Any

from simula_core.json_codec import canonical_json_dumps, canonical_json_dumps_bounded
from simula_core.survey_imports import (
    SurveyImportFieldMap,
    SurveyImportFormat,
    SurveyImportMetadata,
    SurveyImportResult,
)


def survey_import_binding(
    imported: SurveyImportResult,
    *,
    import_format: SurveyImportFormat,
    metadata: SurveyImportMetadata,
    field_map: SurveyImportFieldMap,
    source_version_id: str | None,
) -> dict[str, Any]:
    transform = {
        "format": import_format,
        "metadata": metadata.model_dump(mode="json"),
        "field_map": field_map.model_dump(mode="json"),
    }
    return {
        "version": "survey_import_binding_v1",
        "raw_payload_sha256": imported.payload_checksum_sha256,
        "transform_sha256": sha256(canonical_json_dumps(transform)).hexdigest(),
        "aggregate_sha256": sha256(
            canonical_json_dumps(imported.dataset.model_dump(mode="json"))
        ).hexdigest(),
        "source_version_id": source_version_id,
    }


def evidence_digest(value: Any) -> str:
    """Hash a bounded persisted evidence result, including all scientific inputs."""
    return sha256(canonical_json_dumps_bounded(value, maximum_bytes=16_000_000)).hexdigest()


def verify_calibration_binding(
    binding: Any,
    *,
    survey: dict[str, Any],
    synthetic_observations: list[dict[str, Any]],
    calibration_version: str,
    model_version: str,
) -> None:
    if not isinstance(binding, dict) or binding.get("version") != "calibration_from_runs_v1":
        raise ValueError("calibration requires a persisted input-run binding")
    if binding.get("configuration") != {
        "calibration_version": calibration_version,
        "model_version": model_version,
    }:
        raise ValueError("calibration configuration does not match its persisted run binding")
    if binding.get("survey_dataset_sha256") != evidence_digest(survey) or binding.get(
        "synthetic_observations_sha256"
    ) != evidence_digest(synthetic_observations):
        raise ValueError("calibration input digests do not match their persisted run binding")
    survey_binding = binding.get("survey_evidence_binding")
    if (
        not isinstance(survey_binding, dict)
        or survey_binding.get("version") != "survey_import_binding_v1"
        or survey_binding.get("aggregate_sha256") != evidence_digest(survey)
        or survey_binding.get("source_version_id") != binding.get("source_version_id")
        or not binding.get("source_version_id")
        or survey_binding.get("raw_payload_sha256") != binding.get("approved_payload_sha256")
    ):
        raise ValueError("calibration survey is not bound to its admitted source")
