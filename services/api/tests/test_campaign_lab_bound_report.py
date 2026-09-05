from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID

import pytest
import simula_api.campaign_lab_routes as routes
from fastapi import Request, Response
from pydantic import ValidationError
from simula_api.problems import AppProblem
from simula_core.campaign_lab import CampaignLabPolicyError
from simula_core.campaign_report_binding import build_bound_campaign_report
from simula_core.survey_binding import evidence_digest
from test_campaign_lab_bound_calibration import CAMPAIGN, ORG, SIMULATION, records
from test_campaign_lab_preview import identity


def report_payload() -> dict[str, Any]:
    simulation = records()[SIMULATION]["result"]
    request = json.loads(
        (Path(__file__).parent / "fixtures/calibration_simulation_request.json").read_text()
    )
    return {
        "simulation_request": request,
        "simulation_result": simulation,
        "evidence_binding": {
            "version": "campaign_lab_report_binding_v1",
            "campaign_id": str(CAMPAIGN),
            "simulation_run_id": str(SIMULATION),
            "simulation_request_sha256": evidence_digest(request),
            "simulation_result_sha256": evidence_digest(simulation),
            "calibration_run_id": None,
            "input_authors": [str(UUID(int=30))],
        },
    }


def test_report_keeps_synthetic_status_and_requires_immutable_inputs() -> None:
    payload = report_payload()
    result = build_bound_campaign_report(payload)
    assert result["approval_status"] == "needs_human_review"
    assert result["human_reviewer"] is None
    assert result["evidence_status"] == "Synthetic-only"
    assert result["evidence_binding"] == payload["evidence_binding"]
    payload["simulation_request"]["objective"] = "tampered objective"
    with pytest.raises(ValueError, match="manifest"):
        build_bound_campaign_report(payload)


async def test_report_creation_derives_authors_and_snapshots_from_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = report_payload()
    captured: dict[str, Any] = {}

    async def organization(*args: Any) -> UUID:
        return ORG

    async def input_run(*args: Any) -> dict[str, Any]:
        return {
            "request": payload["simulation_request"],
            "result": payload["simulation_result"],
            "created_by": UUID(int=30),
        }

    async def admission(*args: Any) -> set[str]:
        return {str(UUID(int=31))}

    async def store(*args: Any, **kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"run_id": UUID(int=32), "replayed": False}

    monkeypatch.setattr(routes, "_campaign_organization", organization)
    monkeypatch.setattr(routes, "_calibration_input_run", input_run)
    monkeypatch.setattr(routes, "_bound_report_source_admission", admission)
    monkeypatch.setattr(routes, "_store_run", store)
    monkeypatch.setattr(routes, "_correlation_id", lambda request: UUID(int=33))
    await routes.create_bound_report(
        CAMPAIGN,
        routes.BoundReportCreate(simulation_run_id=SIMULATION),
        cast(Request, object()),
        Response(),
        identity(),
        "bound-report-key-0001",
    )
    assert captured["payload"]["evidence_binding"]["input_authors"] == [
        str(UUID(int=30)),
        str(UUID(int=31)),
    ]
    assert captured["payload"]["simulation_request"] == payload["simulation_request"]
    assert captured["secret_payload"] is None


def test_report_command_cannot_claim_reviewer_or_approval() -> None:
    with pytest.raises(ValidationError):
        routes.BoundReportCreate.model_validate(
            {
                "simulation_run_id": str(SIMULATION),
                "human_reviewer": "self",
                "approval_status": "approved_experimental",
            }
        )


async def test_export_requires_independent_approval(monkeypatch: pytest.MonkeyPatch) -> None:
    async def report(*args: Any) -> dict[str, Any]:
        return {"review": None}

    monkeypatch.setattr(routes, "get_bound_report", report)
    with pytest.raises(AppProblem) as error:
        await routes.export_bound_report(UUID(int=32), cast(Request, object()), identity())
    assert error.value.status == 409
    assert "independent" in error.value.detail


@pytest.mark.parametrize("failure", ["source_revoked", "report_revoked", "wrong_digest", "expired"])
@pytest.mark.parametrize("action", ["get", "export"])
async def test_revocation_or_snapshot_mismatch_blocks_export(
    monkeypatch: pytest.MonkeyPatch, failure: str, action: str
) -> None:
    payload = report_payload()
    result = build_bound_campaign_report(payload)

    async def run(*args: Any) -> dict[str, Any]:
        return {
            "id": UUID(int=32),
            "campaign_id": CAMPAIGN,
            "run_type": "report",
            "status": "succeeded",
            "result": result,
        }

    class Database:
        async def read_product_rows(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
            if kwargs["operation"] == "bound_report_request":
                return [] if failure == "expired" else [{"request": payload}]
            return [
                {
                    "decision": "revoked"
                    if failure == "report_revoked"
                    else "approved_experimental",
                    "report_sha256": "a" * 64
                    if failure == "wrong_digest"
                    else evidence_digest(result),
                    "manifest_sha256": evidence_digest(result["evidence_binding"]),
                }
            ]

    async def admission(*args: Any) -> set[str]:
        if failure == "source_revoked":
            raise CampaignLabPolicyError("revoked")
        return set()

    monkeypatch.setattr(routes, "_get_run", run)
    monkeypatch.setattr(routes, "_services", lambda request: SimpleNamespace(database=Database()))
    monkeypatch.setattr(routes, "_bound_report_source_admission", admission)
    with pytest.raises(AppProblem):
        handler = routes.get_bound_report if action == "get" else routes.export_bound_report
        await handler(UUID(int=32), cast(Request, object()), identity())


async def test_approved_export_returns_exact_snapshot_without_caching(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expected = {
        "result": build_bound_campaign_report(report_payload()),
        "review": {"decision": "approved_experimental"},
    }

    async def report(*args: Any) -> dict[str, Any]:
        return expected

    monkeypatch.setattr(routes, "get_bound_report", report)
    response = await routes.export_bound_report(UUID(int=32), cast(Request, object()), identity())
    assert json.loads(bytes(response.body)) == expected
    assert response.headers["cache-control"] == "no-store"


async def test_review_hashes_and_reviewer_are_server_derived(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = build_bound_campaign_report(report_payload())
    captured: dict[str, Any] = {}

    async def read(*args: Any, **kwargs: Any) -> dict[str, Any]:
        return {"status": "succeeded", "result": result}

    class Database:
        async def execute_product_command(self, actor: Any, **kwargs: Any) -> dict[str, Any]:
            captured.update(kwargs)
            captured["actor"] = actor
            return {"decision": "approved_experimental"}

    monkeypatch.setattr(routes, "_read_bound_report", read)
    monkeypatch.setattr(routes, "_services", lambda request: SimpleNamespace(database=Database()))
    monkeypatch.setattr(routes, "_correlation_id", lambda request: UUID(int=33))
    actor = identity()
    await routes.review_bound_report(
        UUID(int=32),
        routes.BoundReportReviewCreate(
            decision="approved_experimental", rationale="Reviewed engineering test only."
        ),
        cast(Request, object()),
        actor,
    )
    assert captured["actor"] == actor
    assert captured["parameters"][4:6] == (
        evidence_digest(result),
        evidence_digest(result["evidence_binding"]),
    )


@pytest.mark.parametrize(
    "message,status",
    [
        ("independent_report_reviewer_required", 403),
        ("bound_report_unavailable", 409),
        ("report_review_already_final", 409),
        ("approved_report_required_for_revocation", 409),
    ],
)
def test_report_command_errors_have_actionable_http_status(message: str, status: int) -> None:
    import psycopg
    from simula_api.database import _database_problem

    error = cast(psycopg.Error, SimpleNamespace(diag=SimpleNamespace(message_primary=message)))
    assert _database_problem(error).status == status


@pytest.mark.parametrize("kind", ["survey", "research"])
async def test_report_independence_includes_parent_source_and_version_authors(
    monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    payload = report_payload()
    parent_author, version_author = str(UUID(int=101)), str(UUID(int=102))

    async def population(*args: Any) -> None:
        return None

    async def admission(*args: Any, **kwargs: Any) -> dict[str, Any]:
        return {
            "checksum_sha256": "a" * 64,
            "created_by": version_author,
            "source_created_by": parent_author,
        }

    class Database:
        async def read_product_rows(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
            assert "sources.created_by as source_created_by" in kwargs["query"]
            return [{"created_by": version_author, "source_created_by": parent_author}]

    if kind == "survey":
        payload["survey_calibration"] = {
            "evidence_binding": {
                "source_version_id": str(UUID(int=103)),
                "approved_payload_sha256": "a" * 64,
            }
        }
    else:
        payload["simulation_request"]["research_sources"][0]["registry_source_version_id"] = str(
            UUID(int=103)
        )
    monkeypatch.setattr(routes, "_validate_population_registry", population)
    monkeypatch.setattr(routes, "_admitted_evidence_source", admission)
    monkeypatch.setattr(routes, "_services", lambda request: SimpleNamespace(database=Database()))
    authors = await routes._bound_report_source_admission(
        cast(Request, object()), identity(), CAMPAIGN, payload
    )
    assert authors == {parent_author, version_author}
