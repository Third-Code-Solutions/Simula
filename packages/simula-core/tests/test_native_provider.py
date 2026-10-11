from __future__ import annotations

import json
from dataclasses import replace
from typing import Any
from uuid import uuid4

import httpx
import pytest
from simula_core.behavioral_engine import AgentDecisionRequest, DeterministicTieredProvider
from simula_core.campaign_lab import (
    CampaignLabSimulationRequest,
    CampaignLabVariant,
    run_campaign_lab_simulation,
)
from simula_core.live_provider_settings import LiveProviderSettings
from simula_core.methodology import (
    DeterministicCohortProvider,
    MethodologyProviderRequest,
    SamplingConfiguration,
    sample_population,
)
from simula_worker.campaign_lab import _evaluate_interview, evaluate_campaign_lab_claim
from simula_worker.database import CampaignLabClaim
from simula_worker.native_provider import LiveSession
from test_campaign_lab import _request


def _live_request(purpose: str = "commercial_marketing") -> CampaignLabSimulationRequest:
    original = _request()
    return original.model_copy(
        update={
            "purpose": purpose,
            "research_knowledge": ({"source_id": "psa_fixture", "citations": []},),
            "configuration": original.configuration.model_copy(
                update={
                    "provider": "openai_compatible",
                    "model_name": "test-model",
                    "prompt_version": "philippine_scenario_v1",
                    "panel_size": 10,
                    "rounds": 1,
                    "sparse_cell_threshold": 1,
                    "cost_ceiling_microusd": 1_000_000,
                }
            ),
        }
    )


def _settings() -> LiveProviderSettings:
    return LiveProviderSettings(
        base_url="https://model.test/v1",
        model="test-model",
        api_key="test-secret",
        input_microusd_per_million_tokens=1_000_000,
        output_microusd_per_million_tokens=2_000_000,
        max_input_tokens=128000,
    )


def _envelope(content: dict[str, Any]) -> dict[str, Any]:
    return {
        "model": "test-model",
        "usage": {"prompt_tokens": 11, "completion_tokens": 7},
        "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(content)}}],
    }


@pytest.mark.parametrize("language", ["fil", "taglish"])
@pytest.mark.parametrize("evidence_mode", ["ordered", "reversed", "duplicate", "unknown"])
def test_real_transport_wiring_public_service_has_no_optimization_metrics(
    language: str, evidence_mode: str
) -> None:
    received = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert request.url == "https://model.test/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer test-secret"
        received.append(body)
        payload = json.loads(body["messages"][1]["content"])["input"]
        decision = AgentDecisionRequest.model_validate(payload)
        properties = json.loads(body["messages"][1]["content"])["output_schema"]["properties"]
        assert properties["agent_id"]["const"] == str(decision.agent.agent_id)
        assert properties["round_index"]["const"] == decision.round_index
        assert properties["evidence_node_ids"]["items"]["enum"] == list(decision.context_node_ids)
        assert properties["evidence_node_ids"]["uniqueItems"] is True
        assert "lexicographically sorted" in properties["evidence_node_ids"]["description"]
        assert properties["rationale"]["maxLength"] == 1000
        assert properties["target_agent_id"]["enum"] == [
            None,
            *(str(agent_id) for agent_id in decision.related_agent_ids),
        ]
        content = DeterministicTieredProvider().decide(decision).model_dump(mode="json")
        content.pop("usage")
        content.pop("provider")
        if evidence_mode == "reversed":
            assert len(decision.context_node_ids) > 1
            content["evidence_node_ids"] = list(reversed(sorted(decision.context_node_ids)))
        elif evidence_mode == "duplicate":
            content["evidence_node_ids"] = [decision.context_node_ids[0]] * 2
        elif evidence_mode == "unknown":
            content["evidence_node_ids"] = ["unknown_node"]
        return httpx.Response(200, json=_envelope(content))

    request = _live_request("public_service")
    request = request.model_copy(
        update={
            "variants": tuple(v.model_copy(update={"language": language}) for v in request.variants)
        }
    )
    session = LiveSession(_settings(), request, transport=httpx.MockTransport(handler))
    try:
        if evidence_mode in {"duplicate", "unknown"}:
            expected_error = "unique and ordered" if evidence_mode == "duplicate" else "binding"
            with pytest.raises(ValueError, match=expected_error):
                run_campaign_lab_simulation(
                    request,
                    cohort_provider_factory=session.cohort,
                    behavioral_provider_factory=session.behavioral,
                )
            assert session.calls == 1
            return
        result = run_campaign_lab_simulation(
            request,
            cohort_provider_factory=session.cohort,
            behavioral_provider_factory=session.behavioral,
        )
        assert result.analysis_mode == "qualitative_public_service"
        assert result.variants == () and result.overall_component_rankings == {}
        assert result.cohort_findings == () and result.synthetic_observations == ()
        assert len(received) == 60
        assert session.provenance()["cost_microusd"] == 60 * 25
        assert all("PUBLIC SERVICE" in call["messages"][0]["content"] for call in received)
        expected_locale = (
            "natural Filipino-English Taglish" if language == "taglish" else "natural Filipino"
        )
        assert all(expected_locale in call["messages"][0]["content"] for call in received)
        assert result.behavioral_diagnostics is not None
        assert result.behavioral_diagnostics.variants[0].interviewable_agents[0].action_rationales
    finally:
        session.close()


@pytest.mark.parametrize("language", ["fil", "taglish"])
def test_commercial_calls_both_providers_and_binds_cohort_counts(language: str) -> None:
    request = _live_request()
    request = request.model_copy(
        update={
            "variants": tuple(v.model_copy(update={"language": language}) for v in request.variants)
        }
    )
    sample = sample_population(
        request.cohort.population_frame,
        request.cohort.audience,
        SamplingConfiguration(
            sample_size=10, minimum_per_cell=1, maximum_cells=100, seed=17, sparse_cell_threshold=5
        ),
    )
    fixture = DeterministicCohortProvider().run(
        MethodologyProviderRequest(
            run_id=request.campaign_id,
            stimulus="Fixture product",
            sample=sample,
            methodology_version="test",
            cost_ceiling_microusd=0,
        )
    )
    cohort_calls = 0
    agent_calls = 0

    def handler(http_request: httpx.Request) -> httpx.Response:
        nonlocal cohort_calls, agent_calls
        body = json.loads(http_request.content)
        payload = json.loads(body["messages"][1]["content"])["input"]
        if "cohorts" in payload:
            cohort_calls += 1
            counts = {cell["cell_key"]: cell["sample_count"] for cell in payload["cohorts"]}
            content = {
                "responses": [
                    item.model_copy(update={"sample_count": counts[item.cell_key]}).model_dump(
                        mode="json"
                    )
                    for item in fixture.responses
                ]
            }
        else:
            agent_calls += 1
            content = (
                DeterministicTieredProvider()
                .decide(AgentDecisionRequest.model_validate(payload))
                .model_dump(mode="json")
            )
            content.pop("usage")
            content.pop("provider")
        return httpx.Response(200, json=_envelope(content))

    session = LiveSession(_settings(), request, transport=httpx.MockTransport(handler))
    try:
        result = run_campaign_lab_simulation(
            request,
            cohort_provider_factory=session.cohort,
            behavioral_provider_factory=session.behavioral,
        )
        assert cohort_calls == 6 and agent_calls == 60
        assert result.analysis_mode == "synthetic_metrics" and len(result.variants) == 2
        assert session.calls == 66 and session.cost == 66 * 25
    finally:
        session.close()


def test_interview_required_fields_are_in_system_instructions() -> None:
    from simula_worker.native_provider import InterviewOutput

    def handler(http_request: httpx.Request) -> httpx.Response:
        body = json.loads(http_request.content)
        prompt = body["messages"][0]["content"]
        for field in InterviewOutput.model_json_schema()["required"]:
            assert field in prompt
        return httpx.Response(200, json=_envelope({}))

    request = _live_request("public_service")
    session = LiveSession(_settings(), request, transport=httpx.MockTransport(handler))
    try:
        session.complete(request.variants[0], {}, InterviewOutput.model_json_schema())
    finally:
        session.close()


def test_opencode_go_session_headers_are_stable_and_identify_research() -> None:
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers)
        return httpx.Response(200, json=_envelope({}))

    request = _live_request()
    settings = replace(_settings(), base_url="https://opencode.ai/zen/go/v1")
    for _ in range(2):
        session = LiveSession(settings, request, transport=httpx.MockTransport(handler))
        try:
            session.complete(request.variants[0], {}, {})
            session.complete(request.variants[0], {}, {})
        finally:
            session.close()
    assert all(headers["User-Agent"] == "simula-research/1.0" for headers in seen)
    assert seen[0]["x-opencode-session"] == seen[1]["x-opencode-session"]
    assert seen[2]["x-opencode-session"] == seen[3]["x-opencode-session"]
    assert seen[0]["x-opencode-session"] != seen[2]["x-opencode-session"]


@pytest.mark.parametrize("selected_deepseek", [False, True])
def test_selected_go_deepseek_uses_non_thinking_structured_output(selected_deepseek: bool) -> None:
    model = "deepseek-v4.1-flash" if selected_deepseek else "test-model"
    request = _live_request()
    request = request.model_copy(
        update={"configuration": request.configuration.model_copy(update={"model_name": model})}
    )

    def handler(http_request: httpx.Request) -> httpx.Response:
        body = json.loads(http_request.content)
        assert body.get("thinking") == ({"type": "disabled"} if selected_deepseek else None)
        return httpx.Response(200, json=_envelope({}))

    session = LiveSession(
        replace(_settings(), base_url="https://opencode.ai/zen/go/v1", model=model),
        request,
        transport=httpx.MockTransport(handler),
    )
    try:
        session.complete(request.variants[0], {}, {})
    finally:
        session.close()


def test_http_error_redacted_and_never_retried() -> None:
    count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal count
        count += 1
        raise httpx.ReadTimeout("test-secret provider raw body", request=request)

    request = _live_request()
    session = LiveSession(_settings(), request, transport=httpx.MockTransport(handler))
    try:
        with pytest.raises(ValueError, match="outcome may be charged") as error:
            session.complete(request.variants[0], {}, {"type": "object"})
        assert "test-secret" not in str(error.value)
        with pytest.raises(ValueError, match="job budget"):
            session.complete(request.variants[0], {}, {"type": "object"})
        assert count == 1
    finally:
        session.close()


@pytest.mark.parametrize("mutation", ["model", "usage", "truncated"])
def test_invalid_provider_envelope_fails_closed(mutation: str) -> None:
    envelope = _envelope({})
    if mutation == "model":
        envelope["model"] = ""
    elif mutation == "usage":
        envelope["usage"]["prompt_tokens"] = "11"
    else:
        envelope["choices"][0]["finish_reason"] = "length"
    request = _live_request()
    session = LiveSession(
        _settings(),
        request,
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json=envelope)),
    )
    try:
        with pytest.raises(ValueError, match="no retry"):
            session.complete(request.variants[0], {}, {"type": "object"})
    finally:
        session.close()


def test_budget_reserves_full_next_call_and_deadline_blocks_network() -> None:
    request = _live_request()
    session = LiveSession(
        _settings(),
        request,
        transport=httpx.MockTransport(
            lambda _: pytest.fail("budget exhausted: HTTP must not execute")
        ),
    )
    try:
        session.cost = session.ceiling - 1
        with pytest.raises(ValueError, match="budget"):
            session.complete(request.variants[0], {}, {})
        session.cost = 0
        session.deadline = 0
        with pytest.raises(TimeoutError):
            session.complete(request.variants[0], {}, {})
    finally:
        session.close()


@pytest.mark.parametrize("reference_mode", ["invented", "empty", "missing", "subset"])
def test_live_interview_binds_exact_persisted_references(
    monkeypatch: pytest.MonkeyPatch, reference_mode: str
) -> None:
    original = _request()
    result = run_campaign_lab_simulation(original)
    live = _live_request()
    result = result.model_copy(
        update={
            "configuration": live.configuration,
            "provider_execution": {"provider": "openai_compatible"},
        }
    )
    assert result.behavioral_diagnostics is not None
    evidence = result.behavioral_diagnostics.variants[0].interviewable_agents[0]
    returned_events = (
        [str(uuid4())]
        if reference_mode == "invented"
        else []
        if reference_mode == "empty"
        else [str(evidence.evidence_event_ids[0])]
    )
    monkeypatch.setattr(LiveProviderSettings, "from_environment", lambda **_: _settings())

    def complete(
        _session: LiveSession,
        _variant: CampaignLabVariant,
        payload: dict[str, Any],
        schema: dict[str, Any],
    ) -> tuple[dict[str, Any], None]:
        assert schema["properties"]["evidence_event_ids"]["items"]["enum"] == [
            str(value) for value in evidence.evidence_event_ids
        ]
        example = schema["examples"][0]
        assert set(example) == set(schema["required"])
        assert example["evidence_event_ids"] == [str(evidence.evidence_event_ids[0])]
        assert "never omit the citation arrays" in payload["instruction"]
        content: dict[str, Any] = {"transcript": "Synthetic explanation requiring human review."}
        if reference_mode != "missing":
            content.update(
                evidence_event_ids=returned_events,
                research_source_ids=[],
                research_citation_ids=[],
            )
        return content, None

    monkeypatch.setattr(LiveSession, "complete", complete)
    interview_request = {
        "simulation_request": live.model_dump(mode="json"),
        "simulation_result": result.model_dump(mode="json"),
        "source_run_id": str(uuid4()),
        "agent_id": str(evidence.agent_id),
        "variant_key": evidence.variant_key,
        "question": "Ano ang naunawaan mo?",
        "prompt_version": "philippine_scenario_v1",
    }
    if reference_mode == "subset":
        answer = _evaluate_interview(interview_request)
        assert answer["evidence_event_ids"] == returned_events
        assert answer["research_source_ids"] == []
        assert answer["research_citation_ids"] == []
    else:
        with pytest.raises(ValueError):
            _evaluate_interview(interview_request)


def test_deterministic_public_service_is_also_qualitative() -> None:
    request = _request().model_copy(update={"purpose": "public_service"})
    result = run_campaign_lab_simulation(request)
    assert result.analysis_mode == "qualitative_public_service"
    assert not result.variants and not result.overall_component_rankings
    assert not result.cohort_findings and not result.synthetic_observations


def test_live_durable_retry_refused_before_model_call() -> None:
    claim = CampaignLabClaim(
        run_id=uuid4(),
        run_type="repeated_simulation",
        request=_live_request().model_dump(mode="json"),
        secret_payload=None,
        lease_token=uuid4(),
        attempt_count=2,
    )
    with pytest.raises(ValueError, match="replay refused"):
        evaluate_campaign_lab_claim(claim)


def test_fractional_microusd_rounded_up_from_envelope() -> None:
    request = _live_request()
    settings = replace(
        _settings(), input_microusd_per_million_tokens=1, output_microusd_per_million_tokens=1
    )
    session = LiveSession(
        settings,
        request,
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json=_envelope({}))),
    )
    try:
        _, usage = session.complete(request.variants[0], {}, {})
        assert usage.cost_microusd == 1 and session.cost == 1
    finally:
        session.close()


def test_provider_model_snapshot_preserved_in_receipt() -> None:
    request = _live_request()
    envelope = _envelope({})
    envelope["model"] = "test-model-2026-10-01"
    session = LiveSession(
        _settings(),
        request,
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json=envelope)),
    )
    try:
        session.complete(request.variants[0], {}, {})
        assert session.provenance()["requested_model"] == "test-model"
        assert session.receipts[0]["actual_model"] == "test-model-2026-10-01"
    finally:
        session.close()
