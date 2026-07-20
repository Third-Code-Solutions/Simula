from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from simula_api.app import CORRELATION_HEADER, create_app
from simula_api.auth import SupabaseTokenVerifier, VerifiedIdentity
from simula_api.cursor import CursorCodec
from simula_api.database import DatabaseGateway
from simula_api.models import (
    AudienceDisclosureResponse,
    SimulationProvenanceResponse,
    SimulationResultResponse,
    SimulationRunFailure,
    SimulationRunResponse,
    SimulationRunState,
)
from simula_api.problems import AppProblem
from simula_api.rate_limits import RateLimiter
from simula_api.services import AppServices, RunAdmission, RunPublisher
from simula_core.queue_runtime import QueuePublishAmbiguousError, RunDispatchIntent
from simula_core.simulation import DeterministicMockProvider, ProviderRequest

OWNER_ID = UUID("00000000-0000-4000-8000-0000000000e1")
ORGANIZATION_ID = UUID("00000000-0000-4000-8000-0000000000e2")
PROJECT_ID = UUID("00000000-0000-4000-8000-0000000000e3")
STIMULUS_VERSION_ID = UUID("00000000-0000-4000-8000-0000000000e4")
RUN_ID = UUID("00000000-0000-4000-8000-0000000000e5")
SESSION_ID = UUID("00000000-0000-4000-8000-0000000000e6")
TEST_BEARER = "m3-synthetic-bearer"
NOW = datetime(2026, 7, 18, tzinfo=UTC)


class FakeVerifier:
    async def verify(self, token: str) -> VerifiedIdentity:
        assert token == TEST_BEARER
        return VerifiedIdentity(
            user_id=OWNER_ID,
            issuer="http://127.0.0.1:54321/auth/v1",
            expires_at=4_102_444_800,
            session_id=SESSION_ID,
        )


class FakeRateLimiter:
    async def require_unauthenticated(self, *, ip_hash: str) -> None:
        assert ip_hash

    async def release_unauthenticated(self, *, ip_hash: str) -> None:
        assert ip_hash

    async def require_general(
        self,
        *,
        user_id: UUID,
        idempotency_key: str | None = None,
        idempotency_scope: str | None = None,
    ) -> None:
        assert user_id == OWNER_ID
        assert (idempotency_key is None) == (idempotency_scope is None)

    async def require_organization_create(
        self, *, user_id: UUID, idempotency_key: str, idempotency_scope: str
    ) -> None:
        raise AssertionError((user_id, idempotency_key, idempotency_scope))

    async def require_organization_mutation(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        idempotency_key: str | None = None,
        idempotency_scope: str | None = None,
        idempotency_resource_id: UUID | None = None,
    ) -> None:
        raise AssertionError(
            (
                user_id,
                organization_id,
                idempotency_key,
                idempotency_scope,
                idempotency_resource_id,
            )
        )

    async def require_run_create(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        project_id: UUID,
        idempotency_key: str,
        idempotency_scope: str,
    ) -> None:
        assert (user_id, organization_id) == (OWNER_ID, ORGANIZATION_ID)
        assert project_id == PROJECT_ID
        assert idempotency_key == "m3-run-create-key-0001"
        assert idempotency_scope == "POST:/api/v1/projects/{project_id}/runs"

    async def require_run_read(self, *, user_id: UUID, run_id: UUID) -> None:
        assert user_id == OWNER_ID
        assert run_id == RUN_ID

    async def require_run_cancel(self, *, user_id: UUID, organization_id: UUID) -> None:
        assert (user_id, organization_id) == (OWNER_ID, ORGANIZATION_ID)


class RejectingGeneralRateLimiter(FakeRateLimiter):
    async def require_general(
        self,
        *,
        user_id: UUID,
        idempotency_key: str | None = None,
        idempotency_scope: str | None = None,
    ) -> None:
        del user_id, idempotency_key, idempotency_scope
        raise AppProblem(
            status=429,
            code="rate_limited",
            title="Rate limit reached",
            detail="Too many requests. Retry after the indicated delay.",
            retry_after=5,
        )


class FakeDatabase:
    def __init__(self) -> None:
        self.run_commands: list[dict[str, object]] = []
        self.auth_events: list[dict[str, object]] = []
        self.cancel_commands: list[dict[str, object]] = []
        self.cancel_response = _run()
        self.run_response = _run()
        self.replay_response: SimulationRunResponse | None = None
        self.result: SimulationResultResponse | None = None
        self.audience = AudienceDisclosureResponse.model_validate(
            {
                "id": "00000000-0000-4000-8000-0000000000d2",
                "name": "Authored deterministic demo audience",
                "version": 2,
                "kind": "authored_demo",
                "checksum_sha256": "d" * 64,
                "non_representative": True,
                "limitations": ["Estimates nobody and is not representative of any population."],
                "disclosure_version": "phase2_demo_v1",
                "purpose": "Exercise the deterministic pipeline.",
                "prohibited_uses": ["population inference"],
                "owner": "SIMULA methodology",
                "source": "Repository-authored synthetic fixture.",
                "dependencies": ["deterministic_mock provider"],
                "transformation": "No measured observations.",
                "scope": "Phase 2 prototype.",
                "lifecycle": "Migration-managed.",
            }
        )
        self.provenance = SimulationProvenanceResponse.model_validate(
            {
                "availability": "available",
                "run_id": RUN_ID,
                "created_at": NOW,
                "terminal_at": None,
                "result_created_at": None,
                "frozen_manifest_sha256": "b" * 64,
                "deterministic_seed": "7",
                "stimulus": {
                    "version_id": STIMULUS_VERSION_ID,
                    "content": "Test response typing.",
                    "content_sha256": "a" * 64,
                },
                "audience": {
                    "version_id": UUID("00000000-0000-4000-8000-0000000000d2"),
                    "kind": "authored_demo",
                    "checksum_sha256": "d" * 64,
                    "cells": [{"key": "authored_demo", "weight": 1.0}],
                    "non_representative": True,
                    "limitations": [
                        "Estimates nobody and is not representative of any population."
                    ],
                },
                "execution": {
                    "method_version": "phase2_demo_v1",
                    "disclosure_version": "phase2_demo_v1",
                    "language": "en",
                    "output_schema_version": 1,
                    "provider_id": "deterministic_mock",
                    "provider_version": 1,
                    "pipeline_release_id": "phase2_deterministic_mock_v1",
                    "code_release_sha": "a" * 40,
                    "configuration_sha256": "b" * 64,
                },
                "limits": {
                    "version": "phase2_2026_07_17",
                    "arq_job_timeout_seconds": 30,
                    "provider_cost_ceiling": 0,
                    "max_database_attempts": 3,
                    "max_dispatch_generations": 3,
                    "max_result_bytes": 131072,
                },
            },
        )

    async def organization_for_project(self, _: VerifiedIdentity, *, project_id: UUID) -> UUID:
        assert project_id == PROJECT_ID
        return ORGANIZATION_ID

    async def record_sign_in_success(self, _: VerifiedIdentity, **kwargs: object) -> bool:
        self.auth_events.append(dict(kwargs))
        return len(self.auth_events) == 1

    async def create_simulation_run(
        self, _: VerifiedIdentity, **kwargs: object
    ) -> tuple[SimulationRunResponse, bool]:
        self.run_commands.append(dict(kwargs))
        return (_run(), False)

    async def get_simulation_run_replay(
        self, _: VerifiedIdentity, **kwargs: object
    ) -> SimulationRunResponse | None:
        del kwargs
        return self.replay_response

    async def request_simulation_run_cancel(
        self, _: VerifiedIdentity, **kwargs: object
    ) -> SimulationRunResponse:
        self.cancel_commands.append(dict(kwargs))
        return self.cancel_response

    async def get_simulation_run(
        self, _: VerifiedIdentity, *, run_id: UUID
    ) -> SimulationRunResponse:
        assert run_id == RUN_ID
        return self.run_response

    async def get_demo_audience(self, _: VerifiedIdentity) -> AudienceDisclosureResponse:
        return self.audience

    async def get_simulation_result(
        self, _: VerifiedIdentity, *, run_id: UUID
    ) -> SimulationResultResponse | None:
        assert run_id == RUN_ID
        return self.result

    async def get_simulation_provenance(
        self, _: VerifiedIdentity, *, run_id: UUID
    ) -> SimulationProvenanceResponse:
        assert run_id == RUN_ID
        return self.provenance


class RecordingPublisher:
    def __init__(self, error: Exception | None = None) -> None:
        self.intents: list[object] = []
        self.error = error

    async def publish(self, intent: object) -> None:
        self.intents.append(intent)
        if self.error is not None:
            raise self.error


class QueueBackpressureAdmission:
    async def require_run_creation_capacity(self) -> None:
        raise AppProblem(
            status=503,
            code="queue_backpressure",
            title="Run queue is recovering",
            detail="Run creation is temporarily paused while queued work recovers.",
            retry_after=30,
        )


def _run(
    *,
    state: SimulationRunState = SimulationRunState.QUEUED,
    version: int = 1,
    failure_code: str | None = None,
) -> SimulationRunResponse:
    return SimulationRunResponse(
        id=RUN_ID,
        organization_id=ORGANIZATION_ID,
        project_id=PROJECT_ID,
        stimulus_version_id=STIMULUS_VERSION_ID,
        audience_version_id=UUID("00000000-0000-4000-8000-0000000000d2"),
        state=state,
        schema_version=1,
        dispatch_generation=1,
        job_id=f"run:{RUN_ID}:dispatch:1",
        version=version,
        created_at=NOW,
        failure=(
            SimulationRunFailure(
                code=failure_code,
                correlation_id=UUID("018f0bf1-0b2a-7c91-9d8a-d1bd92d5a4f4"),
                guidance=(
                    "No substitute result was generated. Retry or use the correlation ID "
                    "for support."
                ),
            )
            if failure_code is not None
            else None
        ),
    )


def app_with_fakes(
    *,
    publisher_error: Exception | None = None,
    run_admission: RunAdmission | None = None,
    rate_limiter: RateLimiter | None = None,
) -> tuple[FastAPI, FakeDatabase, RecordingPublisher]:
    database = FakeDatabase()
    publisher = RecordingPublisher(publisher_error)
    services = AppServices(
        verifier=cast(SupabaseTokenVerifier, FakeVerifier()),
        database=cast(DatabaseGateway, database),
        cursors=CursorCodec(b"m" * 32),
        rate_limiter=rate_limiter or cast(RateLimiter, FakeRateLimiter()),
        run_publisher=cast(RunPublisher, publisher),
        run_admission=run_admission,
    )
    return create_app(services=services), database, publisher


async def test_run_create_is_atomic_then_best_effort_published_without_confirmation() -> None:
    app, database, publisher = app_with_fakes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/projects/{PROJECT_ID}/runs",
            headers={
                "Authorization": f"Bearer {TEST_BEARER}",
                "Idempotency-Key": "m3-run-create-key-0001",
                CORRELATION_HEADER: "018f0bf1-0b2a-7c91-9d8a-d1bd92d5a4f4",
                "Traceparent": "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
            },
            json={"stimulus_version_id": str(STIMULUS_VERSION_ID)},
        )

    assert response.status_code == 202
    assert response.headers["idempotent-replayed"] == "false"
    assert response.json()["state"] == "queued"
    assert len(database.run_commands) == 1
    assert database.run_commands[0]["traceparent"] == response.headers["traceparent"]
    assert len(publisher.intents) == 1
    intent = cast(RunDispatchIntent, publisher.intents[0])
    assert intent.job_id == f"run:{RUN_ID}:dispatch:1"


async def test_sign_in_audit_is_authenticated_and_naturally_idempotent() -> None:
    app, database, _ = app_with_fakes()
    headers = {
        "Authorization": f"Bearer {TEST_BEARER}",
        CORRELATION_HEADER: "018f0bf1-0b2a-7c91-9d8a-d1bd92d5a4f4",
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post(
            "/api/v1/auth-events", headers=headers, json={"kind": "sign_in"}
        )
        replayed = await client.post(
            "/api/v1/auth-events", headers=headers, json={"kind": "sign_in"}
        )

    assert created.status_code == 201
    assert created.json() == {"kind": "sign_in", "recorded": True}
    assert replayed.status_code == 200
    assert replayed.json() == {"kind": "sign_in", "recorded": False}
    assert database.auth_events == [
        {
            "session_id": SESSION_ID,
            "correlation_id": UUID("018f0bf1-0b2a-7c91-9d8a-d1bd92d5a4f4"),
        },
        {
            "session_id": SESSION_ID,
            "correlation_id": UUID("018f0bf1-0b2a-7c91-9d8a-d1bd92d5a4f4"),
        },
    ]


async def test_general_rate_rejection_precedes_sign_in_audit_database_work() -> None:
    app, database, _ = app_with_fakes(rate_limiter=cast(RateLimiter, RejectingGeneralRateLimiter()))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/me",
            headers={"Authorization": f"Bearer {TEST_BEARER}"},
        )

    assert response.status_code == 429
    assert database.auth_events == []


async def test_run_create_rejects_before_durable_command_when_queue_is_saturated() -> None:
    app, database, publisher = app_with_fakes(run_admission=QueueBackpressureAdmission())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/projects/{PROJECT_ID}/runs",
            headers={
                "Authorization": f"Bearer {TEST_BEARER}",
                "Idempotency-Key": "m3-run-create-key-0001",
            },
            json={"stimulus_version_id": str(STIMULUS_VERSION_ID)},
        )

    assert response.status_code == 503
    assert response.headers["retry-after"] == "30"
    assert response.json()["code"] == "queue_backpressure"
    assert database.run_commands == []
    assert publisher.intents == []


async def test_durable_run_replay_bypasses_new_work_queue_admission() -> None:
    app, database, publisher = app_with_fakes(run_admission=QueueBackpressureAdmission())
    database.replay_response = _run()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/projects/{PROJECT_ID}/runs",
            headers={
                "Authorization": f"Bearer {TEST_BEARER}",
                "Idempotency-Key": "m3-run-create-key-0001",
            },
            json={"stimulus_version_id": str(STIMULUS_VERSION_ID)},
        )

    assert response.status_code == 202
    assert response.headers["idempotent-replayed"] == "true"
    assert database.run_commands == []
    assert len(publisher.intents) == 1


async def test_run_create_remains_accepted_when_post_commit_publish_is_ambiguous() -> None:
    app, database, publisher = app_with_fakes(
        publisher_error=QueuePublishAmbiguousError("ambiguous redis timeout")
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/projects/{PROJECT_ID}/runs",
            headers={
                "Authorization": f"Bearer {TEST_BEARER}",
                "Idempotency-Key": "m3-run-create-key-0001",
            },
            json={"stimulus_version_id": str(STIMULUS_VERSION_ID)},
        )

    assert response.status_code == 202
    assert len(database.run_commands) == 1
    assert len(publisher.intents) == 1


async def test_run_and_unpublished_result_reads_are_rate_limited_and_non_enumerating() -> None:
    app, _, _ = app_with_fakes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        run = await client.get(
            f"/api/v1/runs/{RUN_ID}", headers={"Authorization": f"Bearer {TEST_BEARER}"}
        )
        result = await client.get(
            f"/api/v1/runs/{RUN_ID}/result",
            headers={"Authorization": f"Bearer {TEST_BEARER}"},
        )

    assert run.status_code == 200
    assert run.headers["etag"] == '"1"'
    assert result.status_code == 404
    assert result.json()["code"] == "not_found"


async def test_demo_audience_discloses_governance_before_run_creation() -> None:
    app, _, _ = app_with_fakes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/audiences/demo",
            headers={"Authorization": f"Bearer {TEST_BEARER}"},
        )

    assert response.status_code == 200
    assert response.json()["kind"] == "authored_demo"
    assert response.json()["non_representative"] is True
    assert response.json()["prohibited_uses"] == ["population inference"]
    assert response.json()["checksum_sha256"] == "d" * 64


async def test_failed_run_exposes_only_safe_code_and_original_correlation() -> None:
    app, database, _ = app_with_fakes()
    database.run_response = _run(
        state=SimulationRunState.FAILED,
        version=3,
        failure_code="execution_provider_failure",
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            f"/api/v1/runs/{RUN_ID}",
            headers={"Authorization": f"Bearer {TEST_BEARER}"},
        )

    assert response.status_code == 200
    assert response.json()["failure"] == {
        "code": "execution_provider_failure",
        "correlation_id": "018f0bf1-0b2a-7c91-9d8a-d1bd92d5a4f4",
        "guidance": (
            "No substitute result was generated. Retry or use the correlation ID for support."
        ),
    }
    assert "provider" not in str(response.json()["failure"].get("detail", ""))


async def test_run_cancel_returns_accepted_until_a_worker_commits_the_terminal_state() -> None:
    app, database, _ = app_with_fakes()
    database.cancel_response = _run(
        state=SimulationRunState.CANCEL_REQUESTED,
        version=2,
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/runs/{RUN_ID}/cancel",
            headers={
                "Authorization": f"Bearer {TEST_BEARER}",
                CORRELATION_HEADER: "018f0bf1-0b2a-7c91-9d8a-d1bd92d5a4f4",
            },
            json={},
        )

    assert response.status_code == 202
    assert response.headers["etag"] == '"2"'
    assert response.json()["state"] == "cancel_requested"
    assert database.cancel_commands == [
        {
            "correlation_id": UUID("018f0bf1-0b2a-7c91-9d8a-d1bd92d5a4f4"),
            "run_id": RUN_ID,
        }
    ]


async def test_run_cancel_returns_existing_terminal_state_when_completion_won() -> None:
    app, database, _ = app_with_fakes()
    database.cancel_response = _run(state=SimulationRunState.SUCCEEDED, version=3)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/runs/{RUN_ID}/cancel",
            headers={"Authorization": f"Bearer {TEST_BEARER}"},
            json={},
        )

    assert response.status_code == 200
    assert response.headers["etag"] == '"3"'
    assert response.json()["state"] == "succeeded"


async def test_published_result_is_returned_as_the_generated_typed_contract() -> None:
    app, database, _ = app_with_fakes()
    artifact = (
        DeterministicMockProvider()
        .run(
            ProviderRequest(
                request_id=UUID("00000000-0000-4000-8000-0000000000e6"),
                attempt_id=UUID("00000000-0000-4000-8000-0000000000e7"),
                run_id=RUN_ID,
                method_version="phase2_demo_v1",
                language="en",
                stimulus_content="Test response typing.",
                deterministic_seed=7,
                output_schema_version=1,
                provider_id="deterministic_mock",
                provider_version=1,
                model_id="deterministic_fixture_v1",
                template_id="phase2_deterministic_mock_v1",
                code_release_sha="a" * 40,
                configuration_sha256="b" * 64,
                frozen_manifest_sha256="b" * 64,
                deadline_at=NOW,
                cost_ceiling=0,
            )
        )
        .result
    )
    database.result = SimulationResultResponse(
        run_id=RUN_ID,
        schema_version=1,
        result=artifact,
        artifact_sha256="c" * 64,
        created_at=NOW,
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            f"/api/v1/runs/{RUN_ID}/result",
            headers={"Authorization": f"Bearer {TEST_BEARER}"},
        )

    assert response.status_code == 200
    assert response.json()["result"]["schema_version"] == "1.0.0"
    assert response.json()["result"]["run_id"] == str(RUN_ID)
    assert response.json()["result"]["provenance"]["deterministic_seed"] == "7"


async def test_authorized_provenance_is_a_closed_projection_not_the_raw_manifest() -> None:
    app, database, _ = app_with_fakes()
    database.provenance = SimulationProvenanceResponse.model_validate(
        {
            **database.provenance.model_dump(mode="python"),
            "result_created_at": NOW,
            "provider_receipt": {
                "availability": "available",
                "schema_version": 1,
                "receipt_kind": "successful_result",
                "provider_id": "deterministic_mock",
                "provider_version": 1,
                "model_id": "deterministic_fixture_v1",
                "template_id": "phase2_deterministic_mock_v1",
                "response_schema_version": 1,
                "finish_status": "completed",
                "usage": {"input_tokens": 0, "output_tokens": 0, "cost_microusd": 0},
                "started_at": NOW,
                "ended_at": NOW,
                "safe_error_class": None,
            },
        }
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            f"/api/v1/runs/{RUN_ID}/provenance",
            headers={"Authorization": f"Bearer {TEST_BEARER}"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["availability"] == "available"
    assert body["stimulus"]["content"] == "Test response typing."
    assert body["execution"]["code_release_sha"] == "a" * 40
    assert body["execution"]["configuration_sha256"] == "b" * 64
    assert body["execution"]["pipeline_release_id"] == "phase2_deterministic_mock_v1"
    assert body["provider_receipt"] == {
        "availability": "available",
        "schema_version": 1,
        "receipt_kind": "successful_result",
        "provider_id": "deterministic_mock",
        "provider_version": 1,
        "model_id": "deterministic_fixture_v1",
        "template_id": "phase2_deterministic_mock_v1",
        "response_schema_version": 1,
        "finish_status": "completed",
        "usage": {"input_tokens": 0, "output_tokens": 0, "cost_microusd": 0},
        "started_at": "2026-07-18T00:00:00Z",
        "ended_at": "2026-07-18T00:00:00Z",
        "safe_error_class": None,
    }
    assert "frozen_manifest" not in body
    assert "job_id" not in body
