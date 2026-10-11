from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID

import pytest
import simula_api.campaign_lab_routes as routes
from fastapi import Request, Response
from fastapi.routing import APIRoute
from simula_api.auth import VerifiedIdentity
from simula_api.problems import AppProblem
from simula_api.routes import rate_limited_identity
from simula_core.campaign_lab import CampaignLabSimulationRequest


def _simulation_payload(*, provider: str = "deterministic") -> dict[str, Any]:
    payload: dict[str, Any] = json.loads(
        (Path(__file__).parent / "fixtures/calibration_simulation_request.json").read_text()
    )
    payload["configuration"].update(
        provider=provider,
        model_name="admitted-model" if provider == "openai_compatible" else "deterministic",
        prompt_version="philippine_scenario_v1" if provider == "openai_compatible" else "none",
        panel_size=10,
        rounds=1,
        repetitions=3,
        cost_ceiling_microusd=1000 if provider == "openai_compatible" else 0,
    )
    return payload


def _identity() -> VerifiedIdentity:
    return VerifiedIdentity(
        user_id=UUID(int=1),
        issuer="https://test.invalid/auth/v1",
        expires_at=4_102_444_800,
    )


def test_provider_capabilities_route_requires_authenticated_rate_limited_identity() -> None:
    route = next(
        route
        for route in routes.router.routes
        if isinstance(route, APIRoute) and route.path.endswith("/provider-capabilities")
    )

    assert [dependency.call for dependency in route.dependant.dependencies] == [
        rate_limited_identity
    ]


def test_live_configuration_gate_ignores_deterministic_but_blocks_disabled_live(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SIMULA_LIVE_ENABLED", "false")
    routes._validate_live_configuration(
        CampaignLabSimulationRequest.model_validate(_simulation_payload())
    )

    with pytest.raises(AppProblem) as raised:
        routes._validate_live_configuration(
            CampaignLabSimulationRequest.model_validate(
                _simulation_payload(provider="openai_compatible")
            )
        )

    assert raised.value.status == 422
    assert raised.value.errors[0].field == "request.configuration"


@pytest.mark.asyncio
async def test_interview_accepts_ui_payload_and_binds_persisted_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    campaign_id = UUID(int=7)
    source_run_id = UUID(int=8)
    agent_id = UUID(int=9)
    persisted_request = _simulation_payload()
    persisted_request["campaign_id"] = str(campaign_id)
    persisted_result = {"source": "persisted simulation result"}
    captured: dict[str, Any] = {}

    class Database:
        async def read_product_rows(self, *_: object, **kwargs: object) -> list[dict[str, Any]]:
            assert kwargs["operation"] == "campaign_lab_interview_source_run"
            assert kwargs["parameters"] == (source_run_id, campaign_id)
            return [
                {
                    "run_type": "repeated_simulation",
                    "status": "succeeded",
                    "request": persisted_request,
                    "result": persisted_result,
                }
            ]

    async def store_run(*_: object, **kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"replayed": False}

    monkeypatch.setattr(routes, "_services", lambda _: SimpleNamespace(database=Database()))
    monkeypatch.setattr(routes, "_store_run", store_run)
    monkeypatch.setattr(routes, "_correlation_id", lambda _: UUID(int=10))
    body = routes.InterviewCreate.model_validate(
        {
            "source_run_id": str(source_run_id),
            "agent_id": str(agent_id),
            "variant_key": "variant_a",
            "question": "Why did you respond this way?",
            "prompt_version": "campaign-lab-interview-v1",
        }
    )

    assert body.persona == {}
    await routes.create_interview(
        campaign_id,
        body,
        cast(Request, object()),
        Response(),
        _identity(),
        "ui-interview-contract-0001",
    )

    assert captured["run_type"] == "interview"
    assert captured["payload"]["simulation_request"] is persisted_request
    assert captured["payload"]["simulation_result"] is persisted_result
    assert "persona" not in captured["payload"]


@pytest.mark.asyncio
async def test_live_simulation_purpose_must_match_saved_campaign(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    campaign_id = UUID("30000000-0000-4000-8000-000000000101")
    simulation_request = SimpleNamespace(
        campaign_id=campaign_id,
        purpose="commercial_marketing",
        configuration=SimpleNamespace(provider="deterministic"),
    )

    async def campaign_row(*_: object) -> dict[str, str]:
        return {"purpose": "public_service"}

    monkeypatch.setattr(routes, "_campaign_row", campaign_row)

    with pytest.raises(AppProblem) as raised:
        await routes.create_simulation(
            campaign_id,
            cast(routes.SimulationCreate, SimpleNamespace(request=simulation_request)),
            cast(Request, object()),
            Response(),
            _identity(),
            "live-purpose-binding-0001",
        )

    assert raised.value.status == 422
    assert raised.value.errors[0].field == "request.purpose"


@pytest.mark.asyncio
async def test_clone_rechecks_disabled_live_configuration_before_store(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run_id = UUID(int=10)
    campaign_id = UUID(int=11)
    payload = _simulation_payload(provider="openai_compatible")
    payload["campaign_id"] = str(campaign_id)
    monkeypatch.setenv("SIMULA_LIVE_ENABLED", "false")

    async def simulation(*_: object) -> dict[str, Any]:
        return {"request": payload, "campaign_id": campaign_id}

    async def campaign(*_: object) -> dict[str, str]:
        return {"purpose": "commercial_marketing"}

    async def unexpected_store(*_: object, **__: object) -> dict[str, Any]:
        raise AssertionError("disabled live clone reached storage")

    monkeypatch.setattr(routes, "get_simulation", simulation)
    monkeypatch.setattr(routes, "_campaign_row", campaign)
    monkeypatch.setattr(routes, "_store_run", unexpected_store)

    with pytest.raises(AppProblem) as raised:
        await routes.clone_simulation(
            run_id,
            cast(Request, object()),
            Response(),
            _identity(),
            "live-clone-admission-0001",
        )

    assert raised.value.errors[0].field == "request.configuration"


@pytest.mark.asyncio
async def test_interview_rechecks_disabled_live_configuration_before_store(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    campaign_id = UUID(int=20)
    source_run_id = UUID(int=21)
    payload = _simulation_payload(provider="openai_compatible")
    payload["campaign_id"] = str(campaign_id)
    monkeypatch.setenv("SIMULA_LIVE_ENABLED", "false")

    class Database:
        async def read_product_rows(self, *_: object, **__: object) -> list[dict[str, Any]]:
            return [
                {
                    "run_type": "repeated_simulation",
                    "status": "succeeded",
                    "request": payload,
                    "result": {},
                }
            ]

    async def unexpected_store(*_: object, **__: object) -> dict[str, Any]:
        raise AssertionError("disabled live interview reached storage")

    monkeypatch.setattr(routes, "_services", lambda _: SimpleNamespace(database=Database()))
    monkeypatch.setattr(routes, "_store_run", unexpected_store)
    body = routes.InterviewCreate(
        persona={},
        source_run_id=source_run_id,
        agent_id=UUID(int=22),
        variant_key="variant_a",
        prompt_version="philippine_scenario_v1",
    )

    with pytest.raises(AppProblem) as raised:
        await routes.create_interview(
            campaign_id,
            body,
            cast(Request, object()),
            Response(),
            _identity(),
            "live-interview-admission-0001",
        )

    assert raised.value.errors[0].field == "request.configuration"
