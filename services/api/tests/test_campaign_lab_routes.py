from __future__ import annotations

import inspect
from datetime import UTC, datetime
from hashlib import sha256
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID

import pytest
import simula_api.campaign_lab_routes as campaign_lab_routes
from fastapi import Request, Response
from fastapi.routing import APIRoute
from simula_api.auth import VerifiedIdentity
from simula_api.campaign_lab_routes import (
    AggregateForecastCreate,
    BacktestCreate,
    CalibrationCreate,
    ComplianceCreate,
    NativeSurveyFormCreate,
    NativeSurveyResponsesCreate,
    ReportCreate,
    SurveyImportCreate,
    _registry_population_frame,
    _registry_source_matches,
    _source_matches_population_frame,
    router,
)
from simula_api.problems import AppProblem
from simula_core.campaign_lab import CampaignLabPolicyError, CampaignLabResearchSource
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
    assert "/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/forms" in paths
    assert "/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/forms/{form_id}/responses" in paths
    assert "/api/v1/campaign-lab/campaigns/{campaign_id}/compliance/runs/{run_id}" in paths
    assert "/api/v1/campaign-lab/reports/runs/{run_id}" in paths
    assert "/api/v1/campaign-lab/campaigns/{campaign_id}/forecasts" in paths
    assert "/api/v1/campaign-lab/forecast-datasets" in paths
    assert "/api/v1/campaign-lab/forecasts/{run_id}" in paths


def test_aggregate_forecast_contract_accepts_only_dataset_reference_and_future_targets() -> None:
    body = AggregateForecastCreate(
        dataset_id=UUID("20000000-0000-4000-8000-000000000001"),
        targets=[
            {
                "election_key": "election_2028",
                "election_date": "2028-05-08",
                "contest_key": "senate",
                "geography_key": "national",
                "option_key": option_key,
                "option_group_key": option_key,
            }
            for option_key in ("party_a", "party_b")
        ],
    )

    assert body.model_version == "aggregate_trend_v1"
    assert len(body.targets) == 2
    with pytest.raises(ValueError):
        AggregateForecastCreate.model_validate(
            {
                **body.model_dump(mode="json"),
                "observations": [{"respondent_id": "must-not-enter"}],
            }
        )


def test_report_schema_parses_legacy_attachment_fields_for_compatibility() -> None:
    body = ReportCreate(
        run_id=UUID("30000000-0000-4000-8000-000000000001"),
        calibration_run_id=UUID("30000000-0000-4000-8000-000000000002"),
        historical_backtest_run_id=UUID("30000000-0000-4000-8000-000000000003"),
    )

    assert body.calibration_run_id is not None
    assert body.historical_backtest_run_id is not None


def test_report_approval_requires_a_future_authenticated_approval_command() -> None:
    with pytest.raises(ValueError):
        ReportCreate(
            run_id=UUID("30000000-0000-0000-0000-000000000001"),
            approval_status="approved_experimental",
        )

    with pytest.raises(ValueError, match="authenticated approval command"):
        ReportCreate(
            run_id=UUID("30000000-0000-0000-0000-000000000001"),
            compliance_review_run_id=UUID("30000000-0000-0000-0000-000000000002"),
            human_reviewer="research-lead",
            approval_status="approved_experimental",
        )


def test_compliance_scan_rejects_caller_supplied_reviewer_authority() -> None:
    with pytest.raises(ValueError, match="authenticated approval command"):
        ComplianceCreate(payload={"aggregate_only": True}, reviewer="self-asserted-reviewer")


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


def test_native_survey_contract_requires_bounded_form_and_responses() -> None:
    with pytest.raises(ValueError):
        NativeSurveyFormCreate(form={})

    with pytest.raises(ValueError):
        NativeSurveyResponsesCreate(responses=[])


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
    for purpose in ("Research", "Survey calibration", "Historical backtest"):
        assert not _registry_source_matches(source, {**row, "allowed_uses": [purpose]})


def test_registry_allowed_use_rejects_negative_prose_that_mentions_calibration() -> None:
    assert not campaign_lab_routes._allowed_use_contains(
        ["This source is not approved for survey calibration."],
        "calibration",
    )
    assert campaign_lab_routes._allowed_use_contains(["Survey calibration"], "calibration")


def test_approved_survey_source_rejects_same_source_with_substituted_payload() -> None:
    approved_payload = "approved aggregate survey bytes"
    source_row = {"checksum_sha256": sha256(approved_payload.encode("utf-8")).hexdigest()}

    campaign_lab_routes._assert_survey_payload_matches_registry(
        {"payload": approved_payload},
        source_row,
    )
    with pytest.raises(CampaignLabPolicyError, match="payload checksum"):
        campaign_lab_routes._assert_survey_payload_matches_registry(
            {"payload": "substituted responses for the same source id"},
            source_row,
        )


def _approved_survey_route_body(
    route_kind: str,
    *,
    payload: str,
    source_version_id: UUID,
) -> SurveyImportCreate | CalibrationCreate:
    provenance = {"source_id": "approved-survey", "source_version": "2026-08-24"}
    if route_kind == "import":
        return SurveyImportCreate(
            format="csv",
            metadata=provenance,
            source_version_id=source_version_id,
            secret_payload={"payload": payload},
        )
    return CalibrationCreate(
        synthetic_observations=[{"variant_key": "control", "clarity": 0.5}],
        survey_import={
            "format": "csv",
            "metadata": provenance,
            "provenance": provenance,
        },
        source_version_id=source_version_id,
        secret_payload={"survey_import": {"payload": payload}},
    )


@pytest.mark.parametrize("route_kind", ["import", "calibration"])
async def test_production_survey_routes_freeze_the_exact_approved_payload_checksum(
    monkeypatch: pytest.MonkeyPatch,
    route_kind: str,
) -> None:
    approved_payload = "respondent_id,variant,clarity\nr-1,control,0.5\n"
    approved_checksum = sha256(approved_payload.encode("utf-8")).hexdigest()
    source_version_id = UUID("61000000-0000-4000-8000-000000000001")
    campaign_id = UUID("61000000-0000-4000-8000-000000000002")
    captured: dict[str, Any] = {}

    async def admitted_source(*args: Any, **kwargs: Any) -> dict[str, Any]:
        return {
            "id": source_version_id,
            "source_key": "approved-survey",
            "source_version": "2026-08-24",
            "checksum_sha256": approved_checksum,
            "allowed_uses": ["Survey calibration"],
        }

    async def store_run(*args: Any, **kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"run_id": UUID(int=1), "replayed": False}

    monkeypatch.setattr(campaign_lab_routes, "_campaign_row", admitted_source)
    monkeypatch.setattr(
        campaign_lab_routes, "_survey_preview", lambda body: {"evidence_binding": {}}
    )
    monkeypatch.setattr(campaign_lab_routes, "_is_production", lambda: True)
    monkeypatch.setattr(campaign_lab_routes, "_admitted_evidence_source", admitted_source)
    monkeypatch.setattr(campaign_lab_routes, "_store_run", store_run)
    monkeypatch.setattr(campaign_lab_routes, "_correlation_id", lambda request: UUID(int=2))
    identity = VerifiedIdentity(
        user_id=UUID(int=3),
        issuer="https://test.invalid/auth/v1",
        expires_at=4_102_444_800,
        session_id=UUID(int=4),
    )
    body = _approved_survey_route_body(
        route_kind,
        payload=approved_payload,
        source_version_id=source_version_id,
    )

    if route_kind == "import":
        await campaign_lab_routes.import_survey(
            campaign_id,
            cast(SurveyImportCreate, body),
            cast(Request, object()),
            Response(),
            identity,
            "approved-survey-import-0001",
        )
    else:
        await campaign_lab_routes.create_calibration(
            campaign_id,
            cast(CalibrationCreate, body),
            cast(Request, object()),
            Response(),
            identity,
            "approved-survey-calibration-0001",
        )

    assert captured["payload"]["approved_payload_checksum_sha256"] == approved_checksum
    assert captured["payload"]["source_version_id"] == str(source_version_id)


@pytest.mark.parametrize("route_kind", ["import", "calibration"])
async def test_production_survey_routes_reject_substitution_before_enqueue(
    monkeypatch: pytest.MonkeyPatch,
    route_kind: str,
) -> None:
    source_version_id = UUID("62000000-0000-4000-8000-000000000001")
    approved_checksum = sha256(b"approved survey payload").hexdigest()
    enqueued = False

    async def admitted_source(*args: Any, **kwargs: Any) -> dict[str, Any]:
        return {
            "id": source_version_id,
            "source_key": "approved-survey",
            "source_version": "2026-08-24",
            "checksum_sha256": approved_checksum,
            "allowed_uses": ["Survey calibration"],
        }

    async def store_run(*args: Any, **kwargs: Any) -> dict[str, Any]:
        nonlocal enqueued
        enqueued = True
        return {}

    monkeypatch.setattr(campaign_lab_routes, "_is_production", lambda: True)
    monkeypatch.setattr(campaign_lab_routes, "_admitted_evidence_source", admitted_source)
    monkeypatch.setattr(campaign_lab_routes, "_store_run", store_run)
    body = _approved_survey_route_body(
        route_kind,
        payload="substituted survey payload",
        source_version_id=source_version_id,
    )
    identity = VerifiedIdentity(
        user_id=UUID(int=5),
        issuer="https://test.invalid/auth/v1",
        expires_at=4_102_444_800,
        session_id=UUID(int=6),
    )

    with pytest.raises(AppProblem) as captured:
        if route_kind == "import":
            await campaign_lab_routes.import_survey(
                UUID(int=7),
                cast(SurveyImportCreate, body),
                cast(Request, object()),
                Response(),
                identity,
                "substituted-survey-import-0001",
            )
        else:
            await campaign_lab_routes.create_calibration(
                UUID(int=7),
                cast(CalibrationCreate, body),
                cast(Request, object()),
                Response(),
                identity,
                "substituted-survey-calibration-0001",
            )

    assert not enqueued
    assert "payload checksum" in captured.value.detail


async def test_production_calibration_rejects_forged_direct_survey_dataset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(campaign_lab_routes, "_is_production", lambda: True)
    body = CalibrationCreate(
        synthetic_observations=[{"variant_key": "control", "clarity": 0.5}],
        survey={
            "provenance": {
                "source_id": "approved-survey",
                "source_version": "2026-08-24",
                "checksum_sha256": "a" * 64,
            },
            "observations": [{"variant_key": "forged", "clarity": 1.0}],
        },
        source_version_id=UUID("63000000-0000-4000-8000-000000000001"),
    )
    identity = VerifiedIdentity(
        user_id=UUID(int=8),
        issuer="https://test.invalid/auth/v1",
        expires_at=4_102_444_800,
        session_id=UUID(int=9),
    )

    with pytest.raises(AppProblem) as captured:
        await campaign_lab_routes.create_calibration(
            UUID(int=10),
            body,
            cast(Request, object()),
            Response(),
            identity,
            "forged-direct-survey-0001",
        )

    assert captured.value.status == 422
    assert "approved raw survey import" in captured.value.detail


async def test_production_backtest_rejects_unbound_secret_outcomes_before_enqueue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(campaign_lab_routes, "_is_production", lambda: True)
    enqueued = False

    async def store_run(*args: Any, **kwargs: Any) -> dict[str, Any]:
        nonlocal enqueued
        enqueued = True
        return {}

    monkeypatch.setattr(campaign_lab_routes, "_store_run", store_run)
    body = BacktestCreate(
        protocol={},
        prediction_set={},
        outcome_set_id=UUID("64000000-0000-4000-8000-000000000001"),
        secret_payload={
            "outcomes": {
                "provenance": {
                    "source_id": "approved-source",
                    "source_version": "v1",
                    "checksum_sha256": "a" * 64,
                    "held_out": True,
                    "authorized_for_evaluation": True,
                },
                "outcomes": [{"campaign_key": "substituted"}],
            }
        },
    )
    identity = VerifiedIdentity(
        user_id=UUID(int=11),
        issuer="https://test.invalid/auth/v1",
        expires_at=4_102_444_800,
        session_id=UUID(int=12),
    )

    with pytest.raises(AppProblem) as captured:
        await campaign_lab_routes.create_backtest(
            UUID(int=13),
            body,
            cast(Request, object()),
            Response(),
            identity,
            "unbound-backtest-0001",
        )

    assert captured.value.status == 422
    assert "immutable checksum" in captured.value.detail
    assert not enqueued


@pytest.mark.parametrize(
    "attachment",
    [
        {"calibration_run_id": UUID("60000000-0000-4000-8000-000000000001")},
        {"historical_backtest_run_id": UUID("60000000-0000-4000-8000-000000000002")},
        {"cultural_evaluation_artifact_id": UUID("60000000-0000-4000-8000-000000000003")},
        {"compliance_review_run_id": UUID("60000000-0000-4000-8000-000000000004")},
    ],
)
async def test_report_rejects_same_campaign_evidence_without_immutable_source_binding(
    monkeypatch: pytest.MonkeyPatch,
    attachment: dict[str, UUID],
) -> None:
    campaign_id = UUID("60000000-0000-4000-8000-000000000010")
    source_run_id = UUID("60000000-0000-4000-8000-000000000011")

    class _Database:
        async def read_product_rows(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
            operation = kwargs.get("operation")
            if operation == "campaign_lab_campaign":
                return [{"id": campaign_id, "organization_id": UUID(int=1)}]
            if operation == "campaign_lab_report_source_run":
                return [
                    {
                        "id": source_run_id,
                        "campaign_id": campaign_id,
                        "run_type": "repeated_simulation",
                        "request": {"configuration": {"random_seed": 17}},
                        "result": {"reproducibility_checksum_sha256": "a" * 64},
                        "status": "succeeded",
                    }
                ]
            raise AssertionError("unbound same-campaign evidence reached report assembly")

    monkeypatch.setattr(
        campaign_lab_routes,
        "_services",
        lambda request: SimpleNamespace(database=_Database()),
    )
    identity = VerifiedIdentity(
        user_id=UUID("60000000-0000-4000-8000-000000000012"),
        issuer="https://test.invalid/auth/v1",
        expires_at=4_102_444_800,
        session_id=UUID("60000000-0000-4000-8000-000000000013"),
    )

    with pytest.raises(AppProblem) as captured:
        await campaign_lab_routes.create_report(
            campaign_id,
            ReportCreate(run_id=source_run_id, **cast(Any, attachment)),
            cast(Request, object()),
            Response(),
            identity,
            "report-evidence-binding-0001",
        )

    assert captured.value.status == 409
    assert captured.value.code == "version_conflict"
    assert "immutable" in captured.value.detail


async def test_legacy_campaign_lab_report_reads_are_quarantined_before_database_access(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        campaign_lab_routes,
        "_services",
        lambda request: (_ for _ in ()).throw(
            AssertionError("quarantined Campaign Lab report reached database access")
        ),
    )
    identity = VerifiedIdentity(
        user_id=UUID("60000000-0000-4000-8000-000000000012"),
        issuer="https://test.invalid/auth/v1",
        expires_at=4_102_444_800,
        session_id=UUID("60000000-0000-4000-8000-000000000013"),
    )

    for read in (campaign_lab_routes.get_report_run, campaign_lab_routes.get_report):
        with pytest.raises(AppProblem) as captured:
            await read(
                UUID("60000000-0000-4000-8000-000000000014"),
                cast(Request, object()),
                identity,
            )

        assert captured.value.status == 410
        assert captured.value.code == "unsupported_scope"


def test_campaign_lab_report_openapi_contract_has_no_success_response() -> None:
    report_routes = {
        route.operation_id: route
        for route in router.routes
        if isinstance(route, APIRoute)
        and route.operation_id
        in {
            "create_campaign_lab_report",
            "get_campaign_lab_report_run",
            "get_campaign_lab_report",
        }
    }

    assert report_routes.keys() == {
        "create_campaign_lab_report",
        "get_campaign_lab_report_run",
        "get_campaign_lab_report",
    }
    assert report_routes["create_campaign_lab_report"].status_code == 409
    assert report_routes["get_campaign_lab_report_run"].status_code == 410
    assert report_routes["get_campaign_lab_report"].status_code == 410
    assert all(route.deprecated for route in report_routes.values())

    from simula_api.app import app

    schema = app.openapi()
    expected_problem_responses = {
        ("post", "/api/v1/campaign-lab/campaigns/{campaign_id}/reports"): "409",
        ("get", "/api/v1/campaign-lab/reports/runs/{run_id}"): "410",
        ("get", "/api/v1/campaign-lab/reports/{artifact_id}"): "410",
    }
    for (method, path), expected_status in expected_problem_responses.items():
        responses = schema["paths"][path][method]["responses"]
        assert expected_status in responses
        assert not any(status.startswith("2") for status in responses)
        assert "application/problem+json" in responses[expected_status]["content"]

    artifact_responses = schema["paths"]["/api/v1/campaign-lab/campaigns/{campaign_id}/artifacts"][
        "get"
    ]["responses"]
    assert "application/problem+json" in artifact_responses["410"]["content"]


async def test_generic_artifact_list_excludes_quarantined_reports(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    campaign_id = UUID("60000000-0000-4000-8000-000000000020")
    captured_queries: list[str] = []

    class _Database:
        async def read_product_rows(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
            operation = kwargs.get("operation")
            if operation == "campaign_lab_campaign":
                return [{"id": campaign_id, "organization_id": UUID(int=1)}]
            captured_queries.append(str(kwargs.get("query")))
            return []

    monkeypatch.setattr(
        campaign_lab_routes,
        "_services",
        lambda request: SimpleNamespace(database=_Database()),
    )
    identity = VerifiedIdentity(
        user_id=UUID("60000000-0000-4000-8000-000000000012"),
        issuer="https://test.invalid/auth/v1",
        expires_at=4_102_444_800,
        session_id=UUID("60000000-0000-4000-8000-000000000013"),
    )

    result = await campaign_lab_routes.list_artifacts(
        campaign_id,
        cast(Request, object()),
        identity,
        kind=None,
    )

    assert result["items"] == []
    assert len(captured_queries) == 1
    assert "kind <> 'report'" in captured_queries[0]


async def test_generic_artifact_list_rejects_explicit_report_before_database_access(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        campaign_lab_routes,
        "_services",
        lambda request: (_ for _ in ()).throw(
            AssertionError("explicit quarantined report filter reached database access")
        ),
    )
    identity = VerifiedIdentity(
        user_id=UUID("60000000-0000-4000-8000-000000000012"),
        issuer="https://test.invalid/auth/v1",
        expires_at=4_102_444_800,
        session_id=UUID("60000000-0000-4000-8000-000000000013"),
    )

    with pytest.raises(AppProblem) as captured:
        await campaign_lab_routes.list_artifacts(
            UUID("60000000-0000-4000-8000-000000000020"),
            cast(Request, object()),
            identity,
            kind="report",
        )

    assert captured.value.status == 410
    assert captured.value.code == "unsupported_scope"


@pytest.mark.parametrize(
    "run_type",
    ["report", "survey_calibration", "historical_backtest"],
)
@pytest.mark.parametrize(
    "endpoint_name",
    [
        "get_simulation",
        "simulation_status",
        "simulation_results",
        "simulation_events",
        "cancel_simulation",
        "clone_simulation",
    ],
)
async def test_simulation_surface_rejects_non_simulation_run_types(
    monkeypatch: pytest.MonkeyPatch,
    run_type: str,
    endpoint_name: str,
) -> None:
    run_id = UUID("60000000-0000-4000-8000-000000000030")
    read_operations: list[str] = []

    class _Database:
        async def read_product_rows(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
            read_operations.append(str(kwargs.get("operation")))
            return [
                {
                    "id": run_id,
                    "campaign_id": UUID("60000000-0000-4000-8000-000000000031"),
                    "run_type": run_type,
                    "status": "succeeded",
                    "result": {"must_not_escape": True},
                }
            ]

        async def execute_product_command(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
            raise AssertionError("non-simulation run reached simulation mutation")

    monkeypatch.setattr(
        campaign_lab_routes,
        "_services",
        lambda request: SimpleNamespace(database=_Database()),
    )
    identity = VerifiedIdentity(
        user_id=UUID("60000000-0000-4000-8000-000000000012"),
        issuer="https://test.invalid/auth/v1",
        expires_at=4_102_444_800,
        session_id=UUID("60000000-0000-4000-8000-000000000013"),
    )
    endpoint = getattr(campaign_lab_routes, endpoint_name)
    arguments: tuple[Any, ...] = (run_id, cast(Request, object()), identity)
    if endpoint_name == "cancel_simulation":
        arguments = (run_id, cast(Request, object()), Response(), identity)
    elif endpoint_name == "clone_simulation":
        arguments = (
            run_id,
            cast(Request, object()),
            Response(),
            identity,
            "clone-simulation-boundary-0001",
        )

    with pytest.raises(AppProblem) as captured:
        await endpoint(*arguments)

    assert captured.value.status == 404
    assert captured.value.code == "not_found"
    assert read_operations == ["campaign_lab_run"]


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
