from __future__ import annotations

import inspect
from uuid import UUID

import pytest
from fastapi.routing import APIRoute
from simula_api.campaign_lab_routes import BacktestCreate, CalibrationCreate, ReportCreate, router


def test_campaign_lab_exposes_stage_read_endpoints() -> None:
    paths = {route.path for route in router.routes if isinstance(route, APIRoute)}

    assert "/api/v1/campaign-lab/campaigns/{campaign_id}/research" in paths
    assert "/api/v1/campaign-lab/campaigns/{campaign_id}/cohorts" in paths
    assert "/api/v1/campaign-lab/campaigns/{campaign_id}/variants" in paths
    assert "/api/v1/campaign-lab/research/runs/{run_id}" in paths
    assert "/api/v1/campaign-lab/interviews/runs/{run_id}" in paths
    assert "/api/v1/campaign-lab/surveys/runs/{run_id}" in paths
    assert "/api/v1/campaign-lab/campaigns/{campaign_id}/compliance/runs/{run_id}" in paths
    assert "/api/v1/campaign-lab/reports/runs/{run_id}" in paths


def test_report_can_bind_calibration_and_backtest_evidence_runs() -> None:
    body = ReportCreate(
        run_id=UUID("30000000-0000-4000-8000-000000000001"),
        calibration_run_id=UUID("30000000-0000-4000-8000-000000000002"),
        historical_backtest_run_id=UUID("30000000-0000-4000-8000-000000000003"),
    )

    assert body.calibration_run_id is not None
    assert body.historical_backtest_run_id is not None


def test_approved_report_requires_compliance_run_and_human_reviewer() -> None:
    with pytest.raises(ValueError):
        ReportCreate(
            run_id=UUID("30000000-0000-0000-0000-000000000001"),
            approval_status="approved_experimental",
        )

    body = ReportCreate(
        run_id=UUID("30000000-0000-0000-0000-000000000001"),
        compliance_review_run_id=UUID("30000000-0000-0000-0000-000000000002"),
        human_reviewer="research-lead",
        approval_status="approved_experimental",
    )
    assert body.compliance_review_run_id is not None


def test_calibration_requires_one_observed_survey_input() -> None:
    with pytest.raises(ValueError, match="observed survey"):
        CalibrationCreate(synthetic_observations=[{"variant_key": "control"}])

    with pytest.raises(ValueError, match="exactly one"):
        CalibrationCreate(
            synthetic_observations=[{"variant_key": "control"}],
            survey={},
            survey_import={},
        )


def test_calibration_import_keeps_raw_payload_in_worker_secret() -> None:
    with pytest.raises(ValueError, match="worker-only"):
        CalibrationCreate(
            synthetic_observations=[{"variant_key": "control"}],
            survey_import={"format": "csv", "metadata": {}},
        )

    body = CalibrationCreate(
        synthetic_observations=[{"variant_key": "control"}],
        survey_import={"format": "csv", "metadata": {}},
        secret_payload={"survey_import": {"payload": "csv"}},
    )
    assert body.survey_import is not None


def test_backtest_requires_an_object_outcome_envelope() -> None:
    with pytest.raises(ValueError, match="outcomes must be an object"):
        BacktestCreate(
            protocol={},
            prediction_set={},
            secret_payload={"outcomes": []},
        )


def test_mutating_campaign_lab_commands_require_idempotency_keys() -> None:
    endpoints = {
        route.operation_id: route.endpoint for route in router.routes if isinstance(route, APIRoute)
    }

    assert (
        "idempotency_key" in inspect.signature(endpoints["update_campaign_lab_campaign"]).parameters
    )
    assert (
        "idempotency_key"
        in inspect.signature(endpoints["cancel_campaign_lab_simulation"]).parameters
    )
