"""Draft reports from immutable run snapshots; approval is a separate DB command."""

from collections.abc import Mapping
from typing import Any

from simula_core.campaign_lab import (
    CampaignLabSimulationRequest,
    CampaignLabSimulationResult,
    build_campaign_lab_report,
)
from simula_core.survey_binding import evidence_digest
from simula_core.survey_calibration import SurveyCalibrationResult


def build_bound_campaign_report(payload: Mapping[str, Any]) -> dict[str, Any]:
    manifest = payload.get("evidence_binding")
    if (
        not isinstance(manifest, dict)
        or manifest.get("version") != "campaign_lab_report_binding_v1"
    ):
        raise ValueError("report requires immutable source-run bindings")
    raw_request = payload.get("simulation_request")
    raw_result = payload.get("simulation_result")
    request = CampaignLabSimulationRequest.model_validate(raw_request)
    result = CampaignLabSimulationResult.model_validate(raw_result)
    if (
        request.campaign_id != result.campaign_id
        or str(request.campaign_id) != manifest.get("campaign_id")
        or evidence_digest(raw_request) != manifest.get("simulation_request_sha256")
        or evidence_digest(raw_result) != manifest.get("simulation_result_sha256")
        or request.configuration != result.configuration
    ):
        raise ValueError("report simulation input does not match its immutable manifest")
    report = build_campaign_lab_report(request, result, approval_status="needs_human_review")
    output = report.model_dump(mode="json")
    comparison = payload.get("survey_calibration")
    if comparison is not None:
        if not isinstance(comparison, dict):
            raise ValueError("report survey comparison is invalid")
        SurveyCalibrationResult.model_validate(
            {
                key: value
                for key, value in comparison.items()
                if key in SurveyCalibrationResult.model_fields
            }
        )
        binding = comparison.get("evidence_binding")
        if (
            not isinstance(binding, dict)
            or binding.get("version") != "calibration_from_runs_v1"
            or binding.get("simulation_run_id") != manifest.get("simulation_run_id")
            or binding.get("simulation_result_sha256") != manifest.get("simulation_result_sha256")
            or evidence_digest(comparison) != manifest.get("calibration_result_sha256")
        ):
            raise ValueError("report comparison does not bind this exact simulation")
        output["survey_calibration"] = comparison
    elif manifest.get("calibration_run_id") is not None:
        raise ValueError("report comparison snapshot is missing")
    return {
        **output,
        "evidence_binding": manifest,
        "scientific_disclosure": (
            "Internal experimental report. Any survey comparison is descriptive; "
            "human approval does not establish independent scientific validation."
        ),
    }
