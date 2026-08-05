from __future__ import annotations

import inspect
from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi.routing import APIRoute
from simula_api.campaign_lab_routes import (
    BacktestCreate,
    CalibrationCreate,
    ReportCreate,
    _registry_population_frame,
    _registry_source_matches,
    _source_matches_population_frame,
    router,
)
from simula_core.campaign_lab import CampaignLabResearchSource
from simula_core.methodology import PopulationFrameVersion
from simula_core.population_sources import psa_2020_regional_population_frame


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


def test_population_registry_projection_matches_the_cited_psa_frame() -> None:
    cited = psa_2020_regional_population_frame()
    cited_payload = cited.model_dump(mode="json", exclude={"checksum_sha256"})
    cited_payload["id"] = "7d279ac6-d8fb-4be9-890b-a41395cfd7d8"
    cited_payload["frame_id"] = "695719b1-bdc4-4ff4-9cfc-291bbf4fc190"
    expected = PopulationFrameVersion.model_validate(cited_payload)
    manifest = expected.model_dump(mode="json", exclude={"checksum_sha256"})
    manifest["cells"] = [
        {
            **cell,
            "dimensions": {item["dimension"]: item["value"] for item in cell["dimensions"]},
        }
        for cell in manifest["cells"]
    ]
    manifest["source_export_sha256"] = (
        "31bba5110897c5f60b907cfa7b53a7e7ea33bae701f7413e825a5b90ff5159d1"
    )
    projected = _registry_population_frame(
        {
            "id": "7d279ac6-d8fb-4be9-890b-a41395cfd7d8",
            "population_frame_id": "695719b1-bdc4-4ff4-9cfc-291bbf4fc190",
            "version": 1,
            "validation_status": "experimental",
            "manifest": manifest,
            "limitations": list(expected.limitations),
            "frame_name": expected.name,
        }
    )

    assert projected.model_dump(mode="json", exclude={"checksum_sha256"}) == expected.model_dump(
        mode="json", exclude={"checksum_sha256"}
    )


def test_population_registry_source_match_requires_the_cited_export_checksum() -> None:
    source = CampaignLabResearchSource(
        source_id="psa_openstat_cph_2020",
        title="PSA 2020 regional population frame",
        source_type="public_dataset",
        source_organization="Philippine Statistics Authority (PSA)",
        dataset_version="table_1_9_2020",
        geography="Philippines (17 regions)",
        collection_methodology="2020 Census enumeration.",
        license_or_usage_rights="CC BY 4.0 for PSA/GOVPH content unless otherwise stated",
        processing_date=datetime(2026, 8, 4, tzinfo=UTC),
        transformation="Normalized regional counts into population weights.",
        known_limitations=("Historical frame.",),
        checksum_sha256="31bba5110897c5f60b907cfa7b53a7e7ea33bae701f7413e825a5b90ff5159d1",
        validation_status="validated",
    )
    row = {
        "manifest": {
            "source_export_sha256": source.checksum_sha256,
            "provenance": [
                {
                    "source_id": source.source_id,
                    "source_version": source.dataset_version,
                    "owner": source.source_organization,
                    "license": source.license_or_usage_rights,
                }
            ],
        }
    }

    assert _source_matches_population_frame(source, row)
    assert not _source_matches_population_frame(
        source.model_copy(update={"checksum_sha256": "f" * 64}), row
    )


def test_registry_source_match_rejects_local_rehearsal_use_for_production_research() -> None:
    source = CampaignLabResearchSource(
        registry_source_version_id=UUID("00000000-0000-4000-8000-0000000005e1"),
        source_id="authored_fixture",
        title="Authored fixture",
        source_type="public_report",
        source_organization="SIMULA repository",
        dataset_version="1",
        geography="Philippines",
        collection_methodology="Repository-authored fixture.",
        license_or_usage_rights="Repository fixture",
        processing_date=datetime(2026, 8, 4, tzinfo=UTC),
        transformation="None.",
        known_limitations=("Non-representative.",),
        checksum_sha256="a" * 64,
        validation_status="validated",
    )
    row = {
        "id": str(source.registry_source_version_id),
        "source_key": source.source_id,
        "source_version": source.dataset_version,
        "owner_name": source.source_organization,
        "license_name": source.license_or_usage_rights,
        "checksum_sha256": source.checksum_sha256,
        "allowed_uses": ["Local deterministic engineering rehearsal."],
    }

    assert not _registry_source_matches(source, row)
    assert _registry_source_matches(
        source,
        {**row, "allowed_uses": ["Campaign research and message testing"]},
    )
    assert _registry_source_matches(
        source,
        {**row, "allowed_uses": ["Survey calibration"]},
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
