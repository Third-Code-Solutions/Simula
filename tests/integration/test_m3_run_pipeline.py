from __future__ import annotations

import asyncio
import os
import secrets
from collections.abc import AsyncIterator, Callable
from contextlib import AsyncExitStack, asynccontextmanager
from typing import Protocol, cast
from uuid import UUID, uuid4

import pytest
from arq.worker import Retry
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis, from_url
from simula_api.app import create_app
from simula_core.arq_codec import ARQ_QUEUE_NAME, job_id_for
from simula_core.queue_runtime import create_queue_client
from simula_core.simulation import (
    DeterministicMockProvider,
    ProviderPreflightUnavailableError,
    ProviderRateLimitedError,
    ProviderRequest,
    SimulationResultV1,
)
from simula_worker.config import WorkerSettings
from simula_worker.database import ExecutionClaim, WorkerDatabase
from simula_worker.dispatcher import RedisDispatchClient, RedisRunQueue, RunDispatcher
from simula_worker.main import _provider_request, process_run_v1

from tests.integration.test_api_m2 import (
    LOCAL_REDIS_URL,
    OWNER_A,
    VIEWER_A,
    _add_viewer_membership,
    _headers,
    _local_supabase,
    _project_payload,
    _set_disposable_api_password,
)
from tests.integration.test_database_boundary import (
    SUPABASE_DB_CONTAINER,
    _run_captured,
    _sign_in,
)


def _set_disposable_worker_password() -> str:
    inspect = _run_captured(
        [
            "docker",
            "inspect",
            "--format",
            "{{range .Config.Env}}{{println .}}{{end}}",
            SUPABASE_DB_CONTAINER,
        ]
    )
    if inspect.returncode != 0:
        pytest.fail("local Supabase database container is unavailable")
    password_line = next(
        (line for line in inspect.stdout.splitlines() if line.startswith("POSTGRES_PASSWORD=")),
        None,
    )
    if password_line is None:
        pytest.fail("local Supabase bootstrap password is unavailable")
    role_password = secrets.token_urlsafe(32)
    changed = _run_captured(
        [
            "docker",
            "exec",
            "-i",
            "-e",
            "PGPASSWORD",
            SUPABASE_DB_CONTAINER,
            "psql",
            "-h",
            "127.0.0.1",
            "-U",
            "supabase_admin",
            "-d",
            "postgres",
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            f"alter role simula_worker password '{role_password}';",
        ],
        environment={**os.environ, "PGPASSWORD": password_line.removeprefix("POSTGRES_PASSWORD=")},
    )
    if changed.returncode != 0:
        pytest.fail("could not inject the disposable simula_worker password")
    return role_password


def _run_as_local_supabase_admin(
    sql: str,
    *,
    run_id: UUID | None = None,
    organization_id: UUID | None = None,
) -> None:
    inspect = _run_captured(
        [
            "docker",
            "inspect",
            "--format",
            "{{range .Config.Env}}{{println .}}{{end}}",
            SUPABASE_DB_CONTAINER,
        ]
    )
    if inspect.returncode != 0:
        pytest.fail("local Supabase database container is unavailable")
    password_line = next(
        (line for line in inspect.stdout.splitlines() if line.startswith("POSTGRES_PASSWORD=")),
        None,
    )
    if password_line is None:
        pytest.fail("local Supabase bootstrap password is unavailable")
    command = [
        "docker",
        "exec",
        "-i",
        "-e",
        "PGPASSWORD",
        SUPABASE_DB_CONTAINER,
        "psql",
        "-h",
        "127.0.0.1",
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
    ]
    if run_id is not None:
        command.extend(["-v", f"run_id={run_id}"])
    if organization_id is not None:
        command.extend(["-v", f"organization_id={organization_id}"])
    result = _run_captured(
        command,
        environment={
            **os.environ,
            "PGPASSWORD": password_line.removeprefix("POSTGRES_PASSWORD="),
        },
        input_text=sql,
    )
    if result.returncode != 0:
        pytest.fail("could not prepare local stale-run recovery fixture")


def _expire_local_run_lease(run_id: UUID) -> None:
    _run_as_local_supabase_admin(
        """
        update api.simulation_runs
        set worker_lease_expires_at = pg_catalog.statement_timestamp() - interval '1 second',
            last_progress_at = pg_catalog.statement_timestamp() - interval '121 seconds'
        where id = :'run_id'::uuid;
        update private.run_attempts
        set lease_expires_at = pg_catalog.statement_timestamp() - interval '1 second'
        where run_id = :'run_id'::uuid and status = 'running';
        """,
        run_id=run_id,
    )


def _poison_local_dispatch(run_id: UUID) -> None:
    _run_as_local_supabase_admin(
        """
        update private.run_outbox
        set dispatch_attempt_count = 10,
            claim_expires_at = pg_catalog.statement_timestamp() - interval '1 second'
        where run_id = :'run_id'::uuid and status = 'claimed';
        """,
        run_id=run_id,
    )


class _NoDispatchQueue:
    async def enqueue(self, _: object) -> None:
        raise AssertionError("poison/cancel finalization must not enqueue a job")

    async def proves_queued(self, _: object) -> bool:
        raise AssertionError("poison/cancel finalization must not inspect a job")


async def _remove_exact_queue_keys(job_id: str) -> None:
    client: Redis = from_url(LOCAL_REDIS_URL, decode_responses=False)  # type: ignore[no-untyped-call]
    try:
        await client.zrem(ARQ_QUEUE_NAME, job_id)
        await client.delete(
            f"arq:job:{job_id}", f"arq:result:{job_id}", f"arq:in-progress:{job_id}"
        )
    finally:
        await client.aclose()


@asynccontextmanager
async def _worker_database(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[WorkerDatabase]:
    worker_password = _set_disposable_worker_password()
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "test")
    monkeypatch.setenv(
        "SIMULA_WORKER_DATABASE_URL",
        f"postgresql://simula_worker:{worker_password}@127.0.0.1:54322/postgres?sslmode=disable",
    )
    monkeypatch.setenv("SIMULA_REDIS_URL", LOCAL_REDIS_URL)
    database = WorkerDatabase(WorkerSettings.from_environment())
    await database.open()
    try:
        yield database
    finally:
        await database.close()


@asynccontextmanager
async def _worker_replicas(
    monkeypatch: pytest.MonkeyPatch, *, count: int
) -> AsyncIterator[list[WorkerDatabase]]:
    """Open independent worker pools before rotating the disposable role password."""

    async with AsyncExitStack() as stack:
        databases: list[WorkerDatabase] = []
        for _ in range(count):
            databases.append(await stack.enter_async_context(_worker_database(monkeypatch)))
        yield databases


@asynccontextmanager
async def _api_client(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    local_supabase = _local_supabase()
    api_password = _set_disposable_api_password()
    rate_limit_prefix = f"simula:test:m3:{uuid4().hex}"
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "test")
    monkeypatch.setenv("SIMULA_RELEASE_SHA", "a" * 40)
    monkeypatch.setenv("SIMULA_LOG_LEVEL", "INFO")
    monkeypatch.setenv(
        "SIMULA_DATABASE_URL",
        f"postgresql://simula_api:{api_password}@127.0.0.1:54322/postgres?sslmode=disable",
    )
    monkeypatch.setenv("SIMULA_SUPABASE_URL", local_supabase.api_url)
    monkeypatch.setenv(
        "SIMULA_SUPABASE_JWKS_URL", f"{local_supabase.api_url}/auth/v1/.well-known/jwks.json"
    )
    monkeypatch.setenv("SIMULA_SUPABASE_PUBLISHABLE_KEY", local_supabase.publishable_key)
    monkeypatch.setenv("SIMULA_REDIS_URL", LOCAL_REDIS_URL)
    monkeypatch.setenv("SIMULA_RATE_LIMIT_KEY_PREFIX", rate_limit_prefix)
    monkeypatch.setenv("SIMULA_CURSOR_SECRET", secrets.token_urlsafe(48))
    monkeypatch.setenv("SIMULA_CORS_ORIGINS", "http://127.0.0.1:3000")
    app = create_app()
    try:
        async with app.router.lifespan_context(app):
            assert app.state.domain_ready is True
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                yield client
    finally:
        redis: Redis = from_url(LOCAL_REDIS_URL, decode_responses=True)  # type: ignore[no-untyped-call]
        try:
            keys = [key async for key in redis.scan_iter(match=f"{rate_limit_prefix}:*")]
            if keys:
                await redis.delete(*keys)
        finally:
            await redis.aclose()


@pytest.mark.integration
async def test_m3_real_api_dispatcher_worker_duplicate_delivery_result_and_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    local_supabase = _local_supabase()
    owner_token = _sign_in(local_supabase, OWNER_A)
    suffix = uuid4().hex

    async with _api_client(monkeypatch) as client:
        created_organization = await client.post(
            "/api/v1/organizations",
            headers=_headers(owner_token, f"m3-org-{suffix}"),
            json={"name": f"M3 Fixture {suffix[:8]}"},
        )
        assert created_organization.status_code == 201
        organization_id = UUID(created_organization.json()["id"])
        created_project = await client.post(
            f"/api/v1/organizations/{organization_id}/projects",
            headers=_headers(owner_token, f"m3-project-{suffix}"),
            json=_project_payload(f"M3 Project {suffix[:8]}"),
        )
        assert created_project.status_code == 201
        project_id = UUID(created_project.json()["id"])
        created_stimulus = await client.post(
            f"/api/v1/projects/{project_id}/stimuli",
            headers=_headers(owner_token, f"m3-stimulus-{suffix}"),
            json={"name": "M3 Fixture Message", "content": "Try fictional M3 now."},
        )
        assert created_stimulus.status_code == 201
        stimulus_version_id = UUID(created_stimulus.json()["versions"][0]["id"])

        run_key = f"m3-run-{suffix}"
        created_run = await client.post(
            f"/api/v1/projects/{project_id}/runs",
            headers=_headers(owner_token, run_key),
            json={"stimulus_version_id": str(stimulus_version_id)},
        )
        responses = [
            created_run,
            *[
                await client.post(
                    f"/api/v1/projects/{project_id}/runs",
                    headers=_headers(owner_token, run_key),
                    json={"stimulus_version_id": str(stimulus_version_id)},
                )
                for _ in range(20)
            ],
        ]
        assert {response.status_code for response in responses} == {202}
        assert len({response.json()["id"] for response in responses}) == 1
        assert (
            sum(response.headers["idempotent-replayed"] == "false" for response in responses) == 1
        )
        run_id = UUID(responses[0].json()["id"])
        job_id = job_id_for(run_id, generation=1)
        retry_job_id: str | None = None

        queue = create_queue_client(LOCAL_REDIS_URL, max_connections=4)
        try:
            async with _worker_database(monkeypatch) as worker_database:
                dispatcher = RunDispatcher(
                    worker_database, RedisRunQueue(cast(RedisDispatchClient, queue))
                )
                dispatched = await dispatcher.dispatch_once()
                assert dispatched.claimed == 1
                assert dispatched.confirmed == 1

                payload = {"schema_version": 1, "run_id": str(run_id)}
                context = {"job_id": job_id, "job_try": 1}
                await process_run_v1(
                    context,
                    payload,
                    database=worker_database,
                    provider=DeterministicMockProvider(),
                )
                await process_run_v1(
                    context,
                    payload,
                    database=worker_database,
                    provider=DeterministicMockProvider(),
                )

                retry_run_response = await client.post(
                    f"/api/v1/projects/{project_id}/runs",
                    headers=_headers(owner_token, f"m3-retry-{suffix}"),
                    json={"stimulus_version_id": str(stimulus_version_id)},
                )
                assert retry_run_response.status_code == 202
                retry_run_id = UUID(retry_run_response.json()["id"])
                retry_job_id = job_id_for(retry_run_id, generation=1)
                retry_dispatched = await dispatcher.dispatch_once()
                assert retry_dispatched.claimed == 1
                assert retry_dispatched.confirmed == 1
                retry_claim = await worker_database.claim_execution(retry_run_id, 1, retry_job_id)
                assert retry_claim.status == "claimed"
                assert retry_claim.attempt_id is not None
                assert retry_claim.lease_token is not None
                retry_resolution = await worker_database.fail_execution(
                    retry_run_id,
                    retry_claim.attempt_id,
                    retry_claim.lease_token,
                    "integration_retry",
                    retryable=True,
                )
                assert retry_resolution.state == "retrying"
                assert retry_resolution.retry_after_seconds == 5
        finally:
            await queue.aclose(close_connection_pool=True)
            await _remove_exact_queue_keys(job_id)
            if retry_job_id is not None:
                await _remove_exact_queue_keys(retry_job_id)

        run = await client.get(
            f"/api/v1/runs/{run_id}", headers={"Authorization": f"Bearer {owner_token}"}
        )
        result = await client.get(
            f"/api/v1/runs/{run_id}/result",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        provenance = await client.get(
            f"/api/v1/runs/{run_id}/provenance",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert run.status_code == 200
        assert run.json()["state"] == "succeeded"
        assert result.status_code == 200
        assert result.json()["result"]["schema_version"] == "1.0.0"
        assert result.json()["result"]["run_id"] == str(run_id)
        assert provenance.status_code == 200
        provenance_body = provenance.json()
        assert provenance_body["availability"] == "available"
        assert provenance_body["stimulus"] == {
            "content": "Try fictional M3 now.",
            "content_sha256": created_stimulus.json()["versions"][0]["content_sha256"],
            "version_id": str(stimulus_version_id),
        }
        assert provenance_body["audience"]["kind"] == "authored_demo"
        assert provenance_body["audience"]["non_representative"] is True
        assert provenance_body["execution"]["pipeline_release_id"] == "phase2_deterministic_mock_v1"
        assert provenance_body["limits"]["version"] == "phase2_2026_07_17"
        assert provenance_body["deterministic_seed"].lstrip("-").isdigit()
        assert "frozen_manifest" not in provenance_body
        assert "job_id" not in provenance_body

        retrying_run = await client.get(
            f"/api/v1/runs/{retry_run_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert retrying_run.status_code == 200
        assert retrying_run.json()["state"] == "retrying"


@pytest.mark.integration
async def test_p2_stalled_outbox_backpressure_rejects_new_run_but_allows_replay(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    local_supabase = _local_supabase()
    owner_token = _sign_in(local_supabase, OWNER_A)
    suffix = uuid4().hex
    run_id: UUID | None = None
    job_id: str | None = None

    try:
        async with _api_client(monkeypatch) as client:
            created_organization = await client.post(
                "/api/v1/organizations",
                headers=_headers(owner_token, f"p2-backpressure-org-{suffix}"),
                json={"name": f"P2 Backpressure {suffix[:8]}"},
            )
            assert created_organization.status_code == 201
            organization_id = UUID(created_organization.json()["id"])
            created_project = await client.post(
                f"/api/v1/organizations/{organization_id}/projects",
                headers=_headers(owner_token, f"p2-backpressure-project-{suffix}"),
                json=_project_payload(f"P2 Backpressure {suffix[:8]}"),
            )
            assert created_project.status_code == 201
            project_id = UUID(created_project.json()["id"])
            created_stimulus = await client.post(
                f"/api/v1/projects/{project_id}/stimuli",
                headers=_headers(owner_token, f"p2-backpressure-stimulus-{suffix}"),
                json={"name": "P2 Backpressure", "content": "Try fictional backpressure now."},
            )
            assert created_stimulus.status_code == 201
            stimulus_version_id = UUID(created_stimulus.json()["versions"][0]["id"])
            first_key = f"p2-backpressure-run-{suffix}"
            created_run = await client.post(
                f"/api/v1/projects/{project_id}/runs",
                headers=_headers(owner_token, first_key),
                json={"stimulus_version_id": str(stimulus_version_id)},
            )
            assert created_run.status_code == 202
            run_id = UUID(created_run.json()["id"])
            job_id = job_id_for(run_id, generation=1)
            _run_as_local_supabase_admin(
                """
                update private.run_outbox
                set created_at = pg_catalog.statement_timestamp() - interval '61 seconds'
                where run_id = :'run_id'::uuid;
                """,
                run_id=run_id,
            )

            blocked = await client.post(
                f"/api/v1/projects/{project_id}/runs",
                headers=_headers(owner_token, f"p2-backpressure-next-{suffix}"),
                json={"stimulus_version_id": str(stimulus_version_id)},
            )
            assert blocked.status_code == 503
            assert blocked.headers["retry-after"] == "30"
            assert blocked.json()["code"] == "queue_backpressure"

            replay = await client.post(
                f"/api/v1/projects/{project_id}/runs",
                headers=_headers(owner_token, first_key),
                json={"stimulus_version_id": str(stimulus_version_id)},
            )
            assert replay.status_code == 202
            assert replay.headers["idempotent-replayed"] == "true"
            assert replay.json()["id"] == str(run_id)
    finally:
        if run_id is not None:
            _run_as_local_supabase_admin(
                """
                update private.run_outbox
                set status = 'terminal',
                    claim_token = null,
                    claim_expires_at = null,
                    confirmed_at = null,
                    terminal_error_code = 'integration_backpressure_cleanup'
                where run_id = :'run_id'::uuid;
                """,
                run_id=run_id,
            )
        if job_id is not None:
            await _remove_exact_queue_keys(job_id)


@pytest.mark.integration
async def test_p2_cancellation_is_authorized_durable_and_cancel_wins_completion(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    local_supabase = _local_supabase()
    owner_token = _sign_in(local_supabase, OWNER_A)
    viewer_token = _sign_in(local_supabase, VIEWER_A)
    suffix = uuid4().hex
    queued_job_id: str | None = None
    running_job_id: str | None = None

    async with _api_client(monkeypatch) as client:
        created_organization = await client.post(
            "/api/v1/organizations",
            headers=_headers(owner_token, f"p2-cancel-org-{suffix}"),
            json={"name": f"P2 Cancellation {suffix[:8]}"},
        )
        assert created_organization.status_code == 201
        organization_id = UUID(created_organization.json()["id"])
        _add_viewer_membership(organization_id)
        created_project = await client.post(
            f"/api/v1/organizations/{organization_id}/projects",
            headers=_headers(owner_token, f"p2-cancel-project-{suffix}"),
            json=_project_payload(f"P2 Cancellation {suffix[:8]}"),
        )
        assert created_project.status_code == 201
        project_id = UUID(created_project.json()["id"])
        created_stimulus = await client.post(
            f"/api/v1/projects/{project_id}/stimuli",
            headers=_headers(owner_token, f"p2-cancel-stimulus-{suffix}"),
            json={"name": "P2 Cancellation Message", "content": "Cancel this fictional run."},
        )
        assert created_stimulus.status_code == 201
        stimulus_version_id = UUID(created_stimulus.json()["versions"][0]["id"])

        queued_response = await client.post(
            f"/api/v1/projects/{project_id}/runs",
            headers=_headers(owner_token, f"p2-cancel-queued-{suffix}"),
            json={"stimulus_version_id": str(stimulus_version_id)},
        )
        assert queued_response.status_code == 202
        queued_run_id = UUID(queued_response.json()["id"])
        queued_job_id = job_id_for(queued_run_id, generation=1)

        denied = await client.post(
            f"/api/v1/runs/{queued_run_id}/cancel",
            headers={"Authorization": f"Bearer {viewer_token}"},
            json={},
        )
        assert denied.status_code == 403
        assert denied.json()["code"] == "forbidden"

        requested = await client.post(
            f"/api/v1/runs/{queued_run_id}/cancel",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={},
        )
        replayed_request = await client.post(
            f"/api/v1/runs/{queued_run_id}/cancel",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={},
        )
        assert requested.status_code == 202
        assert requested.json()["state"] == "cancel_requested"
        assert replayed_request.status_code == 202
        assert replayed_request.json() == requested.json()

        queue = create_queue_client(LOCAL_REDIS_URL, max_connections=4)
        try:
            async with _worker_database(monkeypatch) as worker_database:
                dispatcher = RunDispatcher(
                    worker_database, RedisRunQueue(cast(RedisDispatchClient, queue))
                )
                finalized = await dispatcher.dispatch_once()
                assert finalized.canceled == 1
                assert finalized.claimed == 0
                assert finalized.confirmed == 0

                queued_terminal = await client.post(
                    f"/api/v1/runs/{queued_run_id}/cancel",
                    headers={"Authorization": f"Bearer {owner_token}"},
                    json={},
                )
                assert queued_terminal.status_code == 200
                assert queued_terminal.json()["state"] == "canceled"

                running_response = await client.post(
                    f"/api/v1/projects/{project_id}/runs",
                    headers=_headers(owner_token, f"p2-cancel-running-{suffix}"),
                    json={"stimulus_version_id": str(stimulus_version_id)},
                )
                assert running_response.status_code == 202
                running_run_id = UUID(running_response.json()["id"])
                running_job_id = job_id_for(running_run_id, generation=1)
                dispatched = await dispatcher.dispatch_once()
                assert dispatched.canceled == 0
                assert dispatched.claimed == 1
                assert dispatched.confirmed == 1

                claim = await worker_database.claim_execution(running_run_id, 1, running_job_id)
                assert claim.status == "claimed"
                assert claim.attempt_id is not None
                assert claim.lease_token is not None
                assert claim.frozen_manifest is not None
                assert claim.frozen_manifest_sha256 is not None
                assert claim.deterministic_seed is not None

                cancel_running = await client.post(
                    f"/api/v1/runs/{running_run_id}/cancel",
                    headers={"Authorization": f"Bearer {owner_token}"},
                    json={},
                )
                assert cancel_running.status_code == 202
                assert cancel_running.json()["state"] == "cancel_requested"

                artifact = DeterministicMockProvider().run(
                    _provider_request(
                        run_id=running_run_id,
                        claim_attempt_id=claim.attempt_id,
                        frozen_manifest=claim.frozen_manifest,
                        frozen_manifest_sha256=claim.frozen_manifest_sha256,
                        deterministic_seed=claim.deterministic_seed,
                    )
                )
                assert await worker_database.complete_execution(
                    running_run_id,
                    claim.attempt_id,
                    claim.lease_token,
                    artifact.model_dump(mode="json"),
                )
        finally:
            await queue.aclose(close_connection_pool=True)
            if queued_job_id is not None:
                await _remove_exact_queue_keys(queued_job_id)
            if running_job_id is not None:
                await _remove_exact_queue_keys(running_job_id)

        for run_id in (queued_run_id, running_run_id):
            run = await client.get(
                f"/api/v1/runs/{run_id}", headers={"Authorization": f"Bearer {owner_token}"}
            )
            result = await client.get(
                f"/api/v1/runs/{run_id}/result",
                headers={"Authorization": f"Bearer {owner_token}"},
            )
            assert run.status_code == 200
            assert run.json()["state"] == "canceled"
            assert result.status_code == 404


class _TimeoutProvider:
    def __init__(self) -> None:
        self.calls = 0

    def run(self, request: ProviderRequest) -> SimulationResultV1:
        del request
        self.calls += 1
        raise TimeoutError


class _PreflightUnavailableProvider:
    def __init__(self) -> None:
        self.calls = 0

    def run(self, request: ProviderRequest) -> SimulationResultV1:
        del request
        self.calls += 1
        raise ProviderPreflightUnavailableError


class _RateLimitedProvider:
    def __init__(self) -> None:
        self.calls = 0

    def run(self, request: ProviderRequest) -> SimulationResultV1:
        del request
        self.calls += 1
        raise ProviderRateLimitedError


class _RetryableFailureProvider(Protocol):
    calls: int

    def run(self, request: ProviderRequest) -> SimulationResultV1: ...


@pytest.mark.parametrize(
    "provider_factory",
    [_TimeoutProvider, _PreflightUnavailableProvider, _RateLimitedProvider],
    ids=["timeout", "preflight-unavailable", "rate-limited"],
)
@pytest.mark.integration
async def test_p2_retryable_provider_failures_use_database_backoff_then_exhaust(
    monkeypatch: pytest.MonkeyPatch,
    provider_factory: Callable[[], _RetryableFailureProvider],
) -> None:
    local_supabase = _local_supabase()
    owner_token = _sign_in(local_supabase, OWNER_A)
    suffix = uuid4().hex
    job_id: str | None = None

    async with _api_client(monkeypatch) as client:
        created_organization = await client.post(
            "/api/v1/organizations",
            headers=_headers(owner_token, f"p2-timeout-org-{suffix}"),
            json={"name": f"P2 Timeout {suffix[:8]}"},
        )
        assert created_organization.status_code == 201
        organization_id = UUID(created_organization.json()["id"])
        created_project = await client.post(
            f"/api/v1/organizations/{organization_id}/projects",
            headers=_headers(owner_token, f"p2-timeout-project-{suffix}"),
            json=_project_payload(f"P2 Timeout {suffix[:8]}"),
        )
        assert created_project.status_code == 201
        project_id = UUID(created_project.json()["id"])
        created_stimulus = await client.post(
            f"/api/v1/projects/{project_id}/stimuli",
            headers=_headers(owner_token, f"p2-timeout-stimulus-{suffix}"),
            json={"name": "P2 Timeout Message", "content": "Retry this fictional run."},
        )
        assert created_stimulus.status_code == 201
        stimulus_version_id = UUID(created_stimulus.json()["versions"][0]["id"])
        created_run = await client.post(
            f"/api/v1/projects/{project_id}/runs",
            headers=_headers(owner_token, f"p2-timeout-run-{suffix}"),
            json={"stimulus_version_id": str(stimulus_version_id)},
        )
        assert created_run.status_code == 202
        run_id = UUID(created_run.json()["id"])
        job_id = job_id_for(run_id, generation=1)
        queue = create_queue_client(LOCAL_REDIS_URL, max_connections=4)
        provider = provider_factory()
        try:
            async with _worker_database(monkeypatch) as worker_database:
                dispatcher = RunDispatcher(
                    worker_database, RedisRunQueue(cast(RedisDispatchClient, queue))
                )
                dispatched = await dispatcher.dispatch_once()
                assert dispatched.claimed == 1
                assert dispatched.confirmed == 1
                context = {"job_id": job_id}
                payload = {"schema_version": 1, "run_id": str(run_id)}

                with pytest.raises(Retry) as first_retry:
                    await process_run_v1(
                        context, payload, database=worker_database, provider=provider
                    )
                assert first_retry.value.defer_score == 5000

                retrying = await client.get(
                    f"/api/v1/runs/{run_id}",
                    headers={"Authorization": f"Bearer {owner_token}"},
                )
                assert retrying.status_code == 200
                assert retrying.json()["state"] == "retrying"

                with pytest.raises(Retry) as second_retry:
                    await process_run_v1(
                        context, payload, database=worker_database, provider=provider
                    )
                assert second_retry.value.defer_score == 30000

                await process_run_v1(context, payload, database=worker_database, provider=provider)
        finally:
            await queue.aclose(close_connection_pool=True)
            if job_id is not None:
                await _remove_exact_queue_keys(job_id)

        failed = await client.get(
            f"/api/v1/runs/{run_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        result = await client.get(
            f"/api/v1/runs/{run_id}/result",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert failed.status_code == 200
        assert failed.json()["state"] == "failed"
        assert result.status_code == 404
        assert provider.calls == 3


@pytest.mark.integration
async def test_p2_stale_lease_recovery_supersedes_dispatch_generation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    local_supabase = _local_supabase()
    owner_token = _sign_in(local_supabase, OWNER_A)
    suffix = uuid4().hex
    first_job_id: str | None = None
    second_job_id: str | None = None

    async with _api_client(monkeypatch) as client:
        created_organization = await client.post(
            "/api/v1/organizations",
            headers=_headers(owner_token, f"p2-recovery-org-{suffix}"),
            json={"name": f"P2 Recovery {suffix[:8]}"},
        )
        assert created_organization.status_code == 201
        organization_id = UUID(created_organization.json()["id"])
        created_project = await client.post(
            f"/api/v1/organizations/{organization_id}/projects",
            headers=_headers(owner_token, f"p2-recovery-project-{suffix}"),
            json=_project_payload(f"P2 Recovery {suffix[:8]}"),
        )
        assert created_project.status_code == 201
        project_id = UUID(created_project.json()["id"])
        created_stimulus = await client.post(
            f"/api/v1/projects/{project_id}/stimuli",
            headers=_headers(owner_token, f"p2-recovery-stimulus-{suffix}"),
            json={"name": "P2 Recovery Message", "content": "Recover this fictional run."},
        )
        assert created_stimulus.status_code == 201
        stimulus_version_id = UUID(created_stimulus.json()["versions"][0]["id"])
        created_run = await client.post(
            f"/api/v1/projects/{project_id}/runs",
            headers=_headers(owner_token, f"p2-recovery-run-{suffix}"),
            json={"stimulus_version_id": str(stimulus_version_id)},
        )
        assert created_run.status_code == 202
        run_id = UUID(created_run.json()["id"])
        first_job_id = job_id_for(run_id, generation=1)
        second_job_id = job_id_for(run_id, generation=2)
        queue = create_queue_client(LOCAL_REDIS_URL, max_connections=4)
        try:
            async with _worker_database(monkeypatch) as worker_database:
                initial_dispatcher = RunDispatcher(
                    worker_database, RedisRunQueue(cast(RedisDispatchClient, queue))
                )
                initial = await initial_dispatcher.dispatch_once()
                assert initial.recovered == 0
                assert initial.claimed == 1
                assert initial.confirmed == 1
                first_claim = await worker_database.claim_execution(run_id, 1, first_job_id)
                assert first_claim.status == "claimed"

                _expire_local_run_lease(run_id)

                recovery_dispatcher = RunDispatcher(
                    worker_database, RedisRunQueue(cast(RedisDispatchClient, queue))
                )
                recovered = await recovery_dispatcher.dispatch_once()
                assert recovered.canceled == 0
                assert recovered.recovered == 1
                assert recovered.claimed == 1
                assert recovered.confirmed == 1
                assert await worker_database.claim_execution(
                    run_id, 1, first_job_id
                ) == ExecutionClaim(
                    status="no_work",
                    attempt_id=None,
                    lease_token=None,
                    frozen_manifest=None,
                    frozen_manifest_sha256=None,
                    deterministic_seed=None,
                )
                second_claim = await worker_database.claim_execution(run_id, 2, second_job_id)
                assert second_claim.status == "claimed"
                assert second_claim.attempt_id is not None
                assert second_claim.lease_token is not None
        finally:
            await queue.aclose(close_connection_pool=True)
            if first_job_id is not None:
                await _remove_exact_queue_keys(first_job_id)
            if second_job_id is not None:
                await _remove_exact_queue_keys(second_job_id)

        recovered_run = await client.get(
            f"/api/v1/runs/{run_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert recovered_run.status_code == 200
        assert recovered_run.json()["state"] == "running"
        assert recovered_run.json()["dispatch_generation"] == 2


async def _create_p2_dispatch_run(
    client: AsyncClient, owner_token: str, *, suffix: str, label: str
) -> UUID:
    created_organization = await client.post(
        "/api/v1/organizations",
        headers=_headers(owner_token, f"{label}-org-{suffix}"),
        json={"name": f"{label} {suffix[:8]}"},
    )
    assert created_organization.status_code == 201
    organization_id = UUID(created_organization.json()["id"])
    created_project = await client.post(
        f"/api/v1/organizations/{organization_id}/projects",
        headers=_headers(owner_token, f"{label}-project-{suffix}"),
        json=_project_payload(f"{label} {suffix[:8]}"),
    )
    assert created_project.status_code == 201
    project_id = UUID(created_project.json()["id"])
    created_stimulus = await client.post(
        f"/api/v1/projects/{project_id}/stimuli",
        headers=_headers(owner_token, f"{label}-stimulus-{suffix}"),
        json={"name": f"{label} Message", "content": "Bounded fictional dispatch."},
    )
    assert created_stimulus.status_code == 201
    stimulus_version_id = UUID(created_stimulus.json()["versions"][0]["id"])
    created_run = await client.post(
        f"/api/v1/projects/{project_id}/runs",
        headers=_headers(owner_token, f"{label}-run-{suffix}"),
        json={"stimulus_version_id": str(stimulus_version_id)},
    )
    assert created_run.status_code == 202
    return UUID(created_run.json()["id"])


async def _create_run_for_project(
    client: AsyncClient,
    owner_token: str,
    *,
    project_id: UUID,
    stimulus_version_id: UUID,
    idempotency_key: str,
) -> UUID:
    created_run = await client.post(
        f"/api/v1/projects/{project_id}/runs",
        headers=_headers(owner_token, idempotency_key),
        json={"stimulus_version_id": str(stimulus_version_id)},
    )
    assert created_run.status_code == 202
    return UUID(created_run.json()["id"])


@pytest.mark.integration
async def test_p2_pending_run_quota_rejects_the_twenty_first_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """INT-BACKPRESSURE-001: one organization cannot retain 21 live runs."""

    local_supabase = _local_supabase()
    owner_token = _sign_in(local_supabase, OWNER_A)
    suffix = uuid4().hex
    organization_id: UUID | None = None
    run_ids: list[UUID] = []

    try:
        async with _api_client(monkeypatch) as setup_client:
            created_organization = await setup_client.post(
                "/api/v1/organizations",
                headers=_headers(owner_token, f"p2-pending-org-{suffix}"),
                json={"name": f"P2 Pending {suffix[:8]}"},
            )
            assert created_organization.status_code == 201
            organization_id = UUID(created_organization.json()["id"])
            created_project = await setup_client.post(
                f"/api/v1/organizations/{organization_id}/projects",
                headers=_headers(owner_token, f"p2-pending-project-{suffix}"),
                json=_project_payload(f"P2 Pending {suffix[:8]}"),
            )
            assert created_project.status_code == 201
            project_id = UUID(created_project.json()["id"])
            created_stimulus = await setup_client.post(
                f"/api/v1/projects/{project_id}/stimuli",
                headers=_headers(owner_token, f"p2-pending-stimulus-{suffix}"),
                json={"name": "P2 Pending Message", "content": "Bounded fictional queue."},
            )
            assert created_stimulus.status_code == 201
            stimulus_version_id = UUID(created_stimulus.json()["versions"][0]["id"])
            run_ids.append(
                await _create_run_for_project(
                    setup_client,
                    owner_token,
                    project_id=project_id,
                    stimulus_version_id=stimulus_version_id,
                    idempotency_key=f"p2-pending-first-{suffix}",
                )
            )

        # Seed 18 local-only fixtures from the API-created immutable run. The
        # 20th and 21st mutations below still take the full API/database path.
        _run_as_local_supabase_admin(
            """
            insert into api.simulation_runs (
              id, organization_id, project_id, stimulus_version_id,
              audience_version_id, state, frozen_manifest,
              frozen_manifest_sha256, schema_version, deterministic_seed,
              dispatch_generation, attempt_count, worker_lease_token,
              worker_lease_expires_at, last_progress_at, created_by,
              correlation_id, created_at, updated_at, terminal_at, version
            )
            select pg_catalog.gen_random_uuid(), organization_id, project_id,
              stimulus_version_id, audience_version_id, state, frozen_manifest,
              frozen_manifest_sha256, schema_version, deterministic_seed,
              dispatch_generation, attempt_count, worker_lease_token,
              worker_lease_expires_at, last_progress_at, created_by,
              correlation_id, created_at, updated_at, terminal_at, version
            from api.simulation_runs
            cross join pg_catalog.generate_series(1, 18)
            where id = :'run_id'::uuid;
            """,
            run_id=run_ids[0],
        )

        async with _api_client(monkeypatch) as quota_client:
            run_ids.append(
                await _create_run_for_project(
                    quota_client,
                    owner_token,
                    project_id=project_id,
                    stimulus_version_id=stimulus_version_id,
                    idempotency_key=f"p2-pending-twentieth-{suffix}",
                )
            )
            rejected = await quota_client.post(
                f"/api/v1/projects/{project_id}/runs",
                headers=_headers(owner_token, f"p2-pending-overflow-{suffix}"),
                json={"stimulus_version_id": str(stimulus_version_id)},
            )
            assert rejected.status_code == 429
            assert rejected.json()["code"] == "quota_exceeded"
    finally:
        if organization_id is not None:
            _run_as_local_supabase_admin(
                """
                update private.run_outbox
                set status = 'terminal',
                    claim_token = null,
                    claim_expires_at = null,
                    confirmed_at = null,
                    terminal_error_code = 'integration_pending_quota_cleanup'
                where organization_id = :'organization_id'::uuid;
                """,
                organization_id=organization_id,
            )
        await asyncio.gather(
            *(_remove_exact_queue_keys(job_id_for(run_id, generation=1)) for run_id in run_ids)
        )


@pytest.mark.integration
async def test_p2_worker_capacity_serializes_org_replicas_and_cancellation_leases(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """INT-WORKER-LIMIT-001: four replicas cannot exceed three live org slots."""

    local_supabase = _local_supabase()
    owner_token = _sign_in(local_supabase, OWNER_A)
    suffix = uuid4().hex

    async with _api_client(monkeypatch) as setup_client:
        created_organization = await setup_client.post(
            "/api/v1/organizations",
            headers=_headers(owner_token, f"p2-capacity-org-{suffix}"),
            json={"name": f"P2 Capacity {suffix[:8]}"},
        )
        assert created_organization.status_code == 201
        organization_id = UUID(created_organization.json()["id"])
        created_project = await setup_client.post(
            f"/api/v1/organizations/{organization_id}/projects",
            headers=_headers(owner_token, f"p2-capacity-project-{suffix}"),
            json=_project_payload(f"P2 Capacity {suffix[:8]}"),
        )
        assert created_project.status_code == 201
        project_id = UUID(created_project.json()["id"])
        created_stimulus = await setup_client.post(
            f"/api/v1/projects/{project_id}/stimuli",
            headers=_headers(owner_token, f"p2-capacity-stimulus-{suffix}"),
            json={"name": "P2 Capacity Message", "content": "Bounded fictional capacity."},
        )
        assert created_stimulus.status_code == 201
        stimulus_version_id = UUID(created_stimulus.json()["versions"][0]["id"])

    same_org_run_ids: list[UUID] = []
    for index in range(4):
        # Each disposable app has its own Redis rate-limit namespace. The
        # durable database objects remain in the same organization.
        async with _api_client(monkeypatch) as run_client:
            same_org_run_ids.append(
                await _create_run_for_project(
                    run_client,
                    owner_token,
                    project_id=project_id,
                    stimulus_version_id=stimulus_version_id,
                    idempotency_key=f"p2-capacity-run-{index}-{suffix}",
                )
            )

    async with _api_client(monkeypatch) as other_org_client:
        other_org_run_id = await _create_p2_dispatch_run(
            other_org_client,
            owner_token,
            suffix=f"other-{suffix}",
            label="p2-capacity",
        )

    same_org_job_ids = [job_id_for(run_id, generation=1) for run_id in same_org_run_ids]
    other_org_job_id = job_id_for(other_org_run_id, generation=1)
    queue = create_queue_client(LOCAL_REDIS_URL, max_connections=4)
    try:
        async with _worker_replicas(monkeypatch, count=4) as replicas:
            dispatcher = RunDispatcher(replicas[0], RedisRunQueue(cast(RedisDispatchClient, queue)))
            dispatched = await dispatcher.dispatch_once(batch_size=10)
            assert dispatched.confirmed >= 5

            claims = await asyncio.gather(
                *(
                    replica.claim_execution(run_id, 1, job_id)
                    for replica, run_id, job_id in zip(
                        replicas, same_org_run_ids, same_org_job_ids, strict=True
                    )
                )
            )
            assert sum(claim.status == "claimed" for claim in claims) == 3
            capacity_index = next(
                index
                for index, claim in enumerate(claims)
                if claim.status == "organization_capacity"
            )
            capacity_claim = claims[capacity_index]
            assert capacity_claim == ExecutionClaim(
                status="organization_capacity",
                attempt_id=None,
                lease_token=None,
                frozen_manifest=None,
                frozen_manifest_sha256=None,
                deterministic_seed=None,
            )
            assert all(
                claim.attempt_id is not None
                and claim.lease_token is not None
                and claim.frozen_manifest is not None
                for claim in claims
                if claim.status == "claimed"
            )

            # A full organization does not stall a different organization.
            other_org_claim = await replicas[0].claim_execution(
                other_org_run_id, 1, other_org_job_id
            )
            assert other_org_claim.status == "claimed"
            assert other_org_claim.attempt_id is not None
            assert other_org_claim.frozen_manifest is not None

            claimed_run_ids = [
                run_id
                for run_id, claim in zip(same_org_run_ids, claims, strict=True)
                if claim.status == "claimed"
            ]
            async with _api_client(monkeypatch) as cancellation_client:
                for run_id in claimed_run_ids:
                    canceled = await cancellation_client.post(
                        f"/api/v1/runs/{run_id}/cancel",
                        headers={"Authorization": f"Bearer {owner_token}"},
                        json={},
                    )
                    assert canceled.status_code == 202
                    assert canceled.json()["state"] == "cancel_requested"

            # Live cancellation leases retain all three capacity slots.
            still_blocked = await replicas[capacity_index].claim_execution(
                same_org_run_ids[capacity_index], 1, same_org_job_ids[capacity_index]
            )
            assert still_blocked == capacity_claim

            # Expiring one cancellation lease frees exactly one slot; no
            # provider invocation or prior attempt was needed for the loser.
            _expire_local_run_lease(claimed_run_ids[0])
            released = await replicas[capacity_index].claim_execution(
                same_org_run_ids[capacity_index], 1, same_org_job_ids[capacity_index]
            )
            assert released.status == "claimed"
            assert released.attempt_id is not None
            assert released.frozen_manifest is not None

            # Finish the test's own cancellation fixtures so later cases do
            # not inherit an expired cancellation eligible for finalization.
            for run_id in claimed_run_ids[1:]:
                _expire_local_run_lease(run_id)
            assert await replicas[0].finalize_requested_cancellations() == 3
    finally:
        await queue.aclose(close_connection_pool=True)
        for job_id in [*same_org_job_ids, other_org_job_id]:
            await _remove_exact_queue_keys(job_id)


@pytest.mark.integration
async def test_p2_poisoned_dispatch_exhaustion_is_terminal_and_cancel_wins(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    local_supabase = _local_supabase()
    owner_token = _sign_in(local_supabase, OWNER_A)
    suffix = uuid4().hex

    async with _api_client(monkeypatch) as client:
        poisoned_run_id = await _create_p2_dispatch_run(
            client, owner_token, suffix=suffix, label="p2-poison"
        )
        async with _worker_database(monkeypatch) as worker_database:
            poisoned_claims = await worker_database.claim_due_dispatches()
            assert [claim.run_id for claim in poisoned_claims] == [poisoned_run_id]
            _poison_local_dispatch(poisoned_run_id)

            # The API's deliberately small general bucket allows the first
            # complete vertical setup only.  A second disposable app has an
            # isolated test prefix while still exercising the same local DB.
            async with _api_client(monkeypatch) as cancel_client:
                canceled_run_id = await _create_p2_dispatch_run(
                    cancel_client, owner_token, suffix=f"cancel-{suffix}", label="p2-poison"
                )
                canceled_claims = await worker_database.claim_due_dispatches()
                assert [claim.run_id for claim in canceled_claims] == [canceled_run_id]
                _poison_local_dispatch(canceled_run_id)
                cancel_response = await cancel_client.post(
                    f"/api/v1/runs/{canceled_run_id}/cancel",
                    headers=_headers(owner_token, f"p2-poison-cancel-{suffix}"),
                    json={},
                )
                assert cancel_response.status_code == 202

                dispatcher = RunDispatcher(worker_database, _NoDispatchQueue())
                result = await dispatcher.dispatch_once()
                assert result.canceled == 1
                assert result.poisoned == 1
                assert result.recovered == 0
                assert result.claimed == 0
                assert result.confirmed == 0

                canceled = await cancel_client.get(
                    f"/api/v1/runs/{canceled_run_id}",
                    headers={"Authorization": f"Bearer {owner_token}"},
                )
                assert canceled.status_code == 200
                assert canceled.json()["state"] == "canceled"

        poisoned = await client.get(
            f"/api/v1/runs/{poisoned_run_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert poisoned.status_code == 200
        assert poisoned.json()["state"] == "failed"
