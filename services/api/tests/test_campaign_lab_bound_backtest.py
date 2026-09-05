from __future__ import annotations

import copy
from dataclasses import replace
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID

import pytest
from fastapi import Request, Response
from simula_api import campaign_lab_routes as routes
from simula_api.problems import AppProblem
from simula_core.backtest_binding import evaluate_bound_backtest
from simula_core.survey_binding import evidence_digest
from test_campaign_lab_bound_report import report_payload
from test_campaign_lab_preview import identity

CAMPAIGN = UUID(int=101)
DEV = UUID(int=102)
HOLD = UUID(int=103)
COMMIT = UUID(int=104)
SOURCE = UUID(int=105)
ORG = UUID(int=106)


async def commitment(monkeypatch: pytest.MonkeyPatch, *, legacy: bool = False) -> dict[str, Any]:
    raw = report_payload()
    rows = []
    for id, campaign in [(DEV, UUID(int=107)), (HOLD, CAMPAIGN)]:
        row = {
            "id": id,
            "campaign_id": campaign,
            "created_by": UUID(int=30),
            "request": copy.deepcopy(raw["simulation_request"]),
            "result": copy.deepcopy(raw["simulation_result"]),
        }
        row["request"]["campaign_id"] = str(campaign)
        row["result"]["campaign_id"] = str(campaign)
        if legacy and id == HOLD:
            row["result"].pop("synthetic_observations")
        rows.append(row)
    captured = {}

    async def inputs(*args: Any) -> list[dict[str, Any]]:
        return rows

    async def authors(*args: Any) -> set[str]:
        return {str(UUID(int=30))}

    async def store(*args: Any, **kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"run_id": COMMIT}

    monkeypatch.setattr(routes, "_backtest_project_runs", inputs)
    monkeypatch.setattr(routes, "_bound_report_source_admission", authors)
    monkeypatch.setattr(routes, "_store_run", store)
    monkeypatch.setattr(routes, "_correlation_id", lambda request: UUID(int=108))
    await routes.create_bound_backtest_commitment(
        CAMPAIGN,
        routes.BacktestCommitmentCreate(
            development_run_ids=[DEV],
            holdout_run_ids=[HOLD],
            outcome_metric="clarity",
            minimum_campaigns=1,
        ),
        cast(Request, object()),
        Response(),
        identity(),
        "commitment-test-key",
    )
    assert captured["secret_payload"] is None
    return cast(dict[str, Any], captured["payload"])


async def test_commitment_derives_predictions_and_prohibits_early_outcomes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = await commitment(monkeypatch)
    result = evaluate_bound_backtest(payload, None)
    assert result["phase"] == "preregistered"
    assert len(result["prediction_set"]["predictions"]) == 2
    assert "predictions_are_blind" not in result["prediction_set"]
    with pytest.raises(ValueError, match="without outcome"):
        evaluate_bound_backtest(payload, {"outcomes": {}})
    payload["prediction_set"]["predictions"][0]["predicted_value"] = 0
    with pytest.raises(ValueError, match="do not match"):
        evaluate_bound_backtest(payload, None)


@pytest.mark.parametrize(
    "failure", [None, "self", "parent_author", "early_source", "checksum", "coverage"]
)
async def test_outcome_admission_binds_independent_later_source(
    monkeypatch: pytest.MonkeyPatch, failure: str | None
) -> None:
    payload = await commitment(monkeypatch)
    saved = evaluate_bound_backtest(payload, None)
    raw: dict[str, Any] = {
        "outcomes": [
            {
                "campaign_key": p["campaign_key"],
                "cohort_key": p["cohort_key"],
                "variant_key": p["variant_key"],
                "outcome_metric": "clarity",
                "observed_value": 50,
                "cohort_weight": 1,
            }
            for p in saved["prediction_set"]["predictions"]
        ],
        "observation_period": "Engineering fixture only",
        "geography": "Philippines",
        "known_biases": ["Authored synthetic rows"],
        "coverage_limitations": ["No scientific validation"],
    }
    if failure == "coverage":
        raw["outcomes"].pop()
    actor = identity() if failure == "self" else replace(identity(), user_id=UUID(int=9))
    source = {
        "id": SOURCE,
        "source_key": "historical_fixture",
        "source_version": "v1",
        "owner_name": "Engineering custodian",
        "license_name": "Engineering-only",
        "allowed_uses": ["historical_backtest"],
        "created_by": actor.user_id,
        "source_created_by": UUID(int=30) if failure == "parent_author" else actor.user_id,
        "created_at": datetime(2026, 9, 4 if failure == "early_source" else 6, tzinfo=UTC),
        "checksum_sha256": "a" * 64 if failure == "checksum" else evidence_digest(raw),
    }

    async def source_runs(*args: Any) -> None:
        return None

    monkeypatch.setattr(routes, "_validate_backtest_source_runs", source_runs)

    async def organization(*args: Any) -> UUID:
        return ORG

    async def input_run(*args: Any) -> dict[str, Any]:
        return {
            "request": payload,
            "result": saved,
            "created_by": identity().user_id,
            "completed_at": datetime(2026, 9, 5, tzinfo=UTC),
        }

    async def admitted(*args: Any, **kwargs: Any) -> dict[str, Any]:
        return source

    class Database:
        async def read_product_rows(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
            return [{"role": "owner"}]

    captured = {}

    async def store(*args: Any, **kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"run_id": UUID(int=109)}

    monkeypatch.setattr(routes, "_campaign_organization", organization)
    monkeypatch.setattr(routes, "_calibration_input_run", input_run)
    monkeypatch.setattr(routes, "_admitted_evidence_source", admitted)
    monkeypatch.setattr(routes, "_services", lambda request: SimpleNamespace(database=Database()))
    monkeypatch.setattr(routes, "_store_run", store)

    async def submit() -> None:
        await routes.admit_bound_backtest_outcomes(
            CAMPAIGN,
            routes.BoundBacktestAdmissionCreate(
                commitment_run_id=COMMIT, source_version_id=SOURCE, secret_payload=raw
            ),
            cast(Request, object()),
            Response(),
            actor,
            "admission-test-key",
        )

    if failure:
        with pytest.raises(AppProblem):
            await submit()
    else:
        await submit()
        assert "outcomes" not in captured["payload"]
        result = evaluate_bound_backtest(captured["payload"], captured["secret_payload"])
        assert result["status"] == "Scoped historical comparison"
        assert result["campaign_count"] == 1
        assert "predictions_were_blind" not in result
        threshold_payload = copy.deepcopy(captured["payload"])
        threshold_commitment = threshold_payload["commitment"]
        threshold_commitment["protocol"]["minimum_campaigns"] = 2
        threshold_commitment["evidence_binding"]["protocol_sha256"] = evidence_digest(
            threshold_commitment["protocol"]
        )
        threshold_payload["evidence_binding"]["commitment_result_sha256"] = evidence_digest(
            threshold_commitment
        )
        insufficient = evaluate_bound_backtest(threshold_payload, captured["secret_payload"])
        assert insufficient["status"] == "Insufficient evidence"
        assert insufficient["campaign_count"] == 1
        assert insufficient["minimum_campaigns"] == 2
        captured["secret_payload"]["outcomes"]["outcomes"][0]["observed_value"] = 99
        with pytest.raises(ValueError, match="binding is invalid"):
            evaluate_bound_backtest(captured["payload"], captured["secret_payload"])


async def test_legacy_simulation_without_observations_is_actionable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(AppProblem) as error:
        await commitment(monkeypatch, legacy=True)
    assert error.value.status == 422
    assert "legacy simulation" in error.value.detail


async def test_input_pagination_returns_metadata_without_snapshots(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def inputs(*args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        assert kwargs["offset"] == 100
        return [
            {
                "id": UUID(int=i + 1),
                "campaign_id": CAMPAIGN,
                "campaign_name": "Fixture",
                "created_at": "2026-09-05",
                "completed_at": "2026-09-05",
                "request": {"private": "no"},
                "result": {"private": "no"},
            }
            for i in range(101)
        ]

    monkeypatch.setattr(routes, "_backtest_project_runs", inputs)
    page = await routes.list_bound_backtest_inputs(
        CAMPAIGN, cast(Request, object()), identity(), 100
    )
    assert page["next_offset"] == 200
    assert len(page["items"]) == 100
    assert "request" not in page["items"][0]
    assert "result" not in page["items"][0]


async def test_historical_registry_uses_canonical_backtest_admission(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def org(*args: Any) -> UUID:
        return ORG

    class Database:
        async def read_product_rows(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
            return [{"id": SOURCE, "allowed_uses": ["historical_backtest"]}]

    monkeypatch.setattr(routes, "_campaign_organization", org)
    monkeypatch.setattr(routes, "_services", lambda request: SimpleNamespace(database=Database()))
    admitted = await routes._admitted_evidence_source(
        cast(Request, object()), identity(), CAMPAIGN, SOURCE, allowed_use="backtest"
    )
    assert admitted["id"] == SOURCE
