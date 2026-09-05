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
from simula_core.survey_imports import SurveyImportMetadata, import_survey
from simula_worker.campaign_lab import evaluate_campaign_lab_claim
from simula_worker.database import CampaignLabClaim
from test_campaign_lab_preview import body, identity

CAMPAIGN = UUID("30000000-0000-4000-8000-000000000101")
SIMULATION = UUID(int=21)
SURVEY = UUID(int=22)
SOURCE = UUID(int=23)
ORG = UUID(int=24)


def records() -> dict[UUID, dict[str, Any]]:
    simulation = json.loads(
        (Path(__file__).parent / "fixtures/calibration_simulation.json").read_text()
    )
    source = body().model_copy(update={"source_version_id": SOURCE})
    assert source.secret_payload is not None
    raw = source.secret_payload["payload"]
    raw[0].update(variant_key="variant_a", cohort_key="aggregate")
    raw.append({**raw[0], "variant_key": "variant_b"})
    preview = routes._survey_preview(source)
    imported = import_survey(
        raw,
        import_format="generic_json",
        metadata=SurveyImportMetadata.model_validate(source.metadata),
    )
    return {
        SIMULATION: {
            "id": SIMULATION,
            "campaign_id": CAMPAIGN,
            "run_type": "repeated_simulation",
            "status": "succeeded",
            "request": {},
            "result": simulation,
        },
        SURVEY: {
            "id": SURVEY,
            "campaign_id": CAMPAIGN,
            "run_type": "survey_import",
            "status": "succeeded",
            "request": {"evidence_binding": preview["evidence_binding"]},
            "result": {
                **imported.model_dump(mode="json"),
                "evidence_binding": preview["evidence_binding"],
            },
        },
    }


def setup(monkeypatch: pytest.MonkeyPatch, rows: dict[UUID, dict[str, Any]]) -> dict[str, Any]:
    captured: dict[str, Any] = {}

    class Database:
        async def read_product_rows(self, identity: Any, **kwargs: Any) -> list[dict[str, Any]]:
            assert kwargs["operation"] == "campaign_lab_calibration_input"
            run_id, campaign_id, org_id, run_type = kwargs["parameters"]
            assert campaign_id == CAMPAIGN and org_id == ORG
            assert "status = 'succeeded'" in kwargs["query"]
            assert "retention_until" in kwargs["query"]
            assert "created_by" in kwargs["query"]
            row = rows.get(run_id)
            return [row] if row and row["run_type"] == run_type else []

    async def organization(*args: Any) -> UUID:
        return ORG

    async def admitted(*args: Any, **kwargs: Any) -> dict[str, Any]:
        assert args[3] == SOURCE
        assert kwargs["allowed_use"] == "calibration"
        return {
            "id": SOURCE,
            "source_key": "survey_v1",
            "source_version": "v1",
            "checksum_sha256": rows[SURVEY]["result"]["payload_checksum_sha256"],
        }

    async def store(*args: Any, **kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"run_id": UUID(int=25), "replayed": False}

    monkeypatch.setattr(routes, "_services", lambda request: SimpleNamespace(database=Database()))
    monkeypatch.setattr(routes, "_campaign_organization", organization)
    monkeypatch.setattr(routes, "_admitted_evidence_source", admitted)
    monkeypatch.setattr(routes, "_store_run", store)
    monkeypatch.setattr(routes, "_correlation_id", lambda request: UUID(int=26))
    return captured


async def submit() -> None:
    await routes.create_calibration_from_runs(
        CAMPAIGN,
        routes.CalibrationFromRunsCreate(simulation_run_id=SIMULATION, survey_import_run_id=SURVEY),
        cast(Request, object()),
        Response(),
        identity(),
        "bound-calibration-key-0001",
    )


async def test_run_references_produce_verified_worker_comparison_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    rows = records()
    captured = setup(monkeypatch, rows)
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "production")
    await submit()
    assert captured["secret_payload"] is None
    payload = captured["payload"]
    assert payload["synthetic_observations"] == rows[SIMULATION]["result"]["synthetic_observations"]
    result = evaluate_campaign_lab_claim(
        CampaignLabClaim(
            run_id=UUID(int=25),
            run_type="survey_calibration",
            request=payload,
            secret_payload=None,
            lease_token=UUID(int=26),
            attempt_count=1,
        )
    )
    assert result["matched_variants"] == 2
    assert result["evidence_binding"] == payload["evidence_binding"]
    assert "not independent validation" in str(result["scientific_disclosure"])
    payload["survey"]["observations"][0]["metrics"][0]["value"] += 1
    with pytest.raises(ValueError, match="digests"):
        evaluate_campaign_lab_claim(
            CampaignLabClaim(
                run_id=UUID(int=25),
                run_type="survey_calibration",
                request=payload,
                secret_payload=None,
                lease_token=UUID(int=26),
                attempt_count=1,
            )
        )


@pytest.mark.parametrize("broken", ["legacy", "aggregate", "missing_simulation", "wrong_campaign"])
async def test_rejects_unbound_tampered_or_unavailable_inputs(
    monkeypatch: pytest.MonkeyPatch, broken: str
) -> None:
    rows = records()
    if broken == "legacy":
        rows[SURVEY]["result"].pop("evidence_binding")
    elif broken == "aggregate":
        rows[SURVEY]["result"]["dataset"]["observations"][0]["metrics"][0]["value"] += 1
    elif broken == "wrong_campaign":
        rows[SIMULATION]["result"]["campaign_id"] = str(UUID(int=99))
    else:
        del rows[SIMULATION]
    captured = setup(monkeypatch, rows)
    with pytest.raises(AppProblem) as error:
        await submit()
    assert error.value.status == 422
    assert not captured


async def test_revoked_source_prevents_queueing(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = setup(monkeypatch, records())

    async def rejected(*args: Any, **kwargs: Any) -> dict[str, Any]:
        raise CampaignLabPolicyError("source is absent or not approved")

    monkeypatch.setattr(routes, "_admitted_evidence_source", rejected)
    with pytest.raises(AppProblem) as error:
        await submit()
    assert "not approved" in error.value.detail
    assert not captured


def test_command_rejects_caller_authored_scientific_inputs() -> None:
    with pytest.raises(ValidationError):
        routes.CalibrationFromRunsCreate.model_validate(
            {
                "simulation_run_id": str(SIMULATION),
                "survey_import_run_id": str(SURVEY),
                "survey": {"fabricated": True},
                "synthetic_observations": [],
            }
        )
