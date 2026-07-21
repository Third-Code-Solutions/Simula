from __future__ import annotations

import asyncio
import os
import secrets
from collections.abc import AsyncIterator, Callable
from contextlib import AsyncExitStack, asynccontextmanager
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from math import ceil
from time import perf_counter
from typing import Protocol, cast
from uuid import UUID, uuid4

import psycopg
import pytest
from arq.worker import Retry
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis, from_url
from simula_api.app import create_app
from simula_core.arq_codec import ARQ_QUEUE_NAME, job_id_for
from simula_core.queue_runtime import create_queue_client
from simula_core.simulation import (
    DeterministicMockProvider,
    ProviderExecutionReceiptV1,
    ProviderPreflightUnavailableError,
    ProviderRateLimitedError,
    ProviderRequest,
    ProviderResponse,
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

INTEGRATION_TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"


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
    attempt_id: UUID | None = None,
    attempt_count: int | None = None,
    correlation_id: UUID | None = None,
    operator_correlation_id: UUID | None = None,
) -> str:
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
        "-t",
        "-A",
    ]
    if run_id is not None:
        command.extend(["-v", f"run_id={run_id}"])
    if organization_id is not None:
        command.extend(["-v", f"organization_id={organization_id}"])
    if attempt_id is not None:
        command.extend(["-v", f"attempt_id={attempt_id}"])
    if attempt_count is not None:
        command.extend(["-v", f"attempt_count={attempt_count}"])
    if correlation_id is not None:
        command.extend(["-v", f"correlation_id={correlation_id}"])
    if operator_correlation_id is not None:
        command.extend(["-v", f"operator_correlation_id={operator_correlation_id}"])
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
    return result.stdout.strip()


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


def _set_local_dispatch_attempt_count(run_id: UUID, attempt_count: int) -> None:
    _run_as_local_supabase_admin(
        """
        update private.run_outbox
        set dispatch_attempt_count = :'attempt_count'::integer
        where run_id = :'run_id'::uuid and status = 'claimed';
        """,
        run_id=run_id,
        attempt_count=attempt_count,
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


async def _clear_rate_limit_namespace(prefix: str) -> None:
    client: Redis = from_url(LOCAL_REDIS_URL, decode_responses=True)  # type: ignore[no-untyped-call]
    try:
        keys = [key async for key in client.scan_iter(match=f"{prefix}:*")]
        if keys:
            await client.delete(*keys)
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
async def _api_application(
    monkeypatch: pytest.MonkeyPatch, *, rate_limit_prefix: str | None = None
) -> AsyncIterator[FastAPI]:
    local_supabase = _local_supabase()
    api_password = _set_disposable_api_password()
    rate_limit_prefix = rate_limit_prefix or f"simula:test:m3:{uuid4().hex}"
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
            yield app
    finally:
        redis: Redis = from_url(LOCAL_REDIS_URL, decode_responses=True)  # type: ignore[no-untyped-call]
        try:
            keys = [key async for key in redis.scan_iter(match=f"{rate_limit_prefix}:*")]
            if keys:
                await redis.delete(*keys)
        finally:
            await redis.aclose()


@asynccontextmanager
async def _api_client_and_app(
    monkeypatch: pytest.MonkeyPatch, *, rate_limit_prefix: str | None = None
) -> AsyncIterator[tuple[AsyncClient, FastAPI]]:
    async with _api_application(monkeypatch, rate_limit_prefix=rate_limit_prefix) as app:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client, app


@asynccontextmanager
async def _api_client(
    monkeypatch: pytest.MonkeyPatch, *, rate_limit_prefix: str | None = None
) -> AsyncIterator[AsyncClient]:
    async with _api_client_and_app(monkeypatch, rate_limit_prefix=rate_limit_prefix) as (client, _):
        yield client


@pytest.mark.integration
async def test_m3_real_api_dispatcher_worker_duplicate_delivery_result_and_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    local_supabase = _local_supabase()
    owner_token = _sign_in(local_supabase, OWNER_A)
    suffix = uuid4().hex

    async with _api_client_and_app(monkeypatch) as (client, app):
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
        initial = await client.post(
            f"/api/v1/projects/{project_id}/runs",
            headers={
                **_headers(owner_token, run_key),
                "Traceparent": INTEGRATION_TRACEPARENT,
            },
            json={"stimulus_version_id": str(stimulus_version_id)},
        )
        assert initial.status_code == 202
        assert initial.json()["audience_version_id"] == "00000000-0000-4000-8000-0000000000d2"
        async with AsyncExitStack() as replay_stack:
            replay_clients = [
                await replay_stack.enter_async_context(
                    AsyncClient(
                        transport=ASGITransport(
                            app=app,
                            client=(f"192.0.2.{index + 1}", 10_000 + index),
                        ),
                        base_url="http://test",
                    )
                )
                for index in range(20)
            ]
            responses = await asyncio.gather(
                *(
                    replay_client.post(
                        f"/api/v1/projects/{project_id}/runs",
                        headers={
                            **_headers(owner_token, run_key),
                            "Traceparent": INTEGRATION_TRACEPARENT,
                        },
                        json={"stimulus_version_id": str(stimulus_version_id)},
                    )
                    for replay_client in replay_clients
                )
            )
        assert {response.status_code for response in responses} == {202}
        assert {response.headers["idempotent-replayed"] for response in responses} == {"true"}
        assert len({initial.json()["id"], *(response.json()["id"] for response in responses)}) == 1
        assert initial.headers["idempotent-replayed"] == "false"
        run_id = UUID(responses[0].json()["id"])
        stored_trace, stored_correlation = _run_as_local_supabase_admin(
            """
            select traceparent || '|' || correlation_id::text
            from api.simulation_runs
            where id = :'run_id'::uuid;
            """,
            run_id=run_id,
        ).split("|", maxsplit=1)
        assert stored_trace.startswith("00-4bf92f3577b34da6a3ce929d0e0e4736-")
        assert str(UUID(stored_correlation)) == stored_correlation
        job_id = job_id_for(run_id, generation=1)
        retry_job_id: str | None = None

        queue = create_queue_client(LOCAL_REDIS_URL, max_connections=4)
        try:
            async with _worker_database(monkeypatch) as worker_database:
                dispatcher = RunDispatcher(
                    worker_database, RedisRunQueue(cast(RedisDispatchClient, queue))
                )
                dispatched = await dispatcher.dispatch_once()
                assert dispatched.claimed >= 1
                assert dispatched.confirmed == dispatched.claimed

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
                assert retry_dispatched.claimed >= 1
                assert retry_dispatched.confirmed == retry_dispatched.claimed
                retry_claim = await worker_database.claim_execution(retry_run_id, 1, retry_job_id)
                assert retry_claim.status == "claimed"
                assert retry_claim.attempt_id is not None
                assert retry_claim.lease_token is not None
                assert retry_claim.correlation_id == UUID(
                    retry_run_response.headers["x-correlation-id"]
                )
                assert retry_claim.traceparent == retry_run_response.headers["traceparent"]
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
        assert provenance_body["audience"]["version_id"] == "00000000-0000-4000-8000-0000000000d2"
        assert (
            provenance_body["audience"]["checksum_sha256"]
            == "ec5a2cda8f71f55e15b9c0be31a03c19e39f0c47c911898c1b49b33d3ea14e6e"
        )
        assert provenance_body["audience"]["non_representative"] is True
        assert provenance_body["execution"]["code_release_sha"] == "a" * 40
        assert len(provenance_body["execution"]["configuration_sha256"]) == 64
        assert provenance_body["execution"]["pipeline_release_id"] == "phase2_deterministic_mock_v1"
        assert provenance_body["provider_receipt"]["provider_id"] == "deterministic_mock"
        assert provenance_body["provider_receipt"]["model_id"] == "deterministic_fixture_v1"
        assert provenance_body["provider_receipt"]["template_id"] == (
            "phase2_deterministic_mock_v1"
        )
        assert provenance_body["provider_receipt"]["finish_status"] == "completed"
        assert provenance_body["provider_receipt"]["usage"] == {
            "input_tokens": 0,
            "output_tokens": 0,
            "cost_microusd": 0,
        }
        assert provenance_body["provider_receipt"]["safe_error_class"] is None
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
        retry_cancel = await client.post(
            f"/api/v1/runs/{retry_run_id}/cancel",
            headers=_headers(owner_token, f"m3-retry-cancel-{suffix}"),
            json={},
        )
        assert retry_cancel.status_code == 202
        async with _worker_database(monkeypatch) as cleanup_database:
            assert await cleanup_database.finalize_requested_cancellations() == 1
        canceled_retry = await client.get(
            f"/api/v1/runs/{retry_run_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert canceled_retry.status_code == 200
        assert canceled_retry.json()["state"] == "canceled"

        deletion_proof = _run_as_local_supabase_admin(
            """
            begin;
            create temporary table deletion_target (organization_id uuid primary key)
              on commit drop;
            insert into deletion_target values (:'organization_id'::uuid);
            do $test$
            declare
              target_organization_id uuid := (
                select organization_id from deletion_target
              );
            begin
              if not exists (
                select 1 from api.simulation_results
                where organization_id = target_organization_id
              ) or not exists (
                select 1 from private.run_attempts
                where organization_id = target_organization_id
              ) or not exists (
                select 1 from private.run_events
                where organization_id = target_organization_id
              ) or not exists (
                select 1 from private.run_outbox
                where organization_id = target_organization_id
              ) then
                raise exception 'deletion fixture is missing terminal run graph rows';
              end if;

              delete from api.organizations
              where id = target_organization_id;

              if exists (
                select 1 from api.organizations
                where id = target_organization_id
              ) or exists (
                select 1 from api.organization_memberships
                where organization_id = target_organization_id
              ) or exists (
                select 1 from api.projects
                where organization_id = target_organization_id
              ) or exists (
                select 1 from api.stimuli
                where organization_id = target_organization_id
              ) or exists (
                select 1 from api.stimulus_versions
                where organization_id = target_organization_id
              ) or exists (
                select 1 from api.simulation_runs
                where organization_id = target_organization_id
              ) or exists (
                select 1 from api.simulation_results
                where organization_id = target_organization_id
              ) or exists (
                select 1 from private.run_attempts
                where organization_id = target_organization_id
              ) or exists (
                select 1 from private.run_events
                where organization_id = target_organization_id
              ) or exists (
                select 1 from private.run_outbox
                where organization_id = target_organization_id
              ) or exists (
                select 1 from private.idempotency_keys
                where organization_id = target_organization_id
              ) or exists (
                select 1 from private.audit_events
                where organization_id = target_organization_id
              ) then
                raise exception 'organization deletion left Phase 2 graph residue';
              end if;
            end
            $test$;
            commit;
            select 'deleted';
            """,
            organization_id=organization_id,
        )
        assert deletion_proof.splitlines()[-1] == "deleted"


@pytest.mark.integration
async def test_p2_deterministic_mock_terminal_result_p95_under_ten_seconds_over_thirty_runs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """AC-RUN-003: 30 exact local pipeline samples satisfy the Phase 2 CI budget."""

    local_supabase = _local_supabase()
    owner_token = _sign_in(local_supabase, OWNER_A)
    suffix = uuid4().hex
    rate_prefix = f"simula:test:p95:{suffix}"
    organization_id: UUID | None = None
    durations: list[float] = []

    try:
        async with _api_client(monkeypatch, rate_limit_prefix=rate_prefix) as client:
            created_organization = await client.post(
                "/api/v1/organizations",
                headers=_headers(owner_token, f"p2-p95-org-{suffix}"),
                json={"name": f"P2 P95 {suffix[:8]}"},
            )
            assert created_organization.status_code == 201
            organization_id = UUID(created_organization.json()["id"])
            created_project = await client.post(
                f"/api/v1/organizations/{organization_id}/projects",
                headers=_headers(owner_token, f"p2-p95-project-{suffix}"),
                json=_project_payload(f"P2 P95 {suffix[:8]}"),
            )
            assert created_project.status_code == 201
            project_id = UUID(created_project.json()["id"])
            created_stimulus = await client.post(
                f"/api/v1/projects/{project_id}/stimuli",
                headers=_headers(owner_token, f"p2-p95-stimulus-{suffix}"),
                json={"name": "P2 P95", "content": "Measure fictional deterministic work."},
            )
            assert created_stimulus.status_code == 201
            stimulus_version_id = UUID(created_stimulus.json()["versions"][0]["id"])

            queue = create_queue_client(LOCAL_REDIS_URL, max_connections=4)
            try:
                async with _worker_database(monkeypatch) as worker_database:
                    dispatcher = RunDispatcher(
                        worker_database,
                        RedisRunQueue(cast(RedisDispatchClient, queue)),
                    )
                    for sample in range(30):
                        await _clear_rate_limit_namespace(rate_prefix)
                        started_at = perf_counter()
                        created_run = await client.post(
                            f"/api/v1/projects/{project_id}/runs",
                            headers=_headers(owner_token, f"p2-p95-run-{sample}-{suffix}"),
                            json={"stimulus_version_id": str(stimulus_version_id)},
                        )
                        assert created_run.status_code == 202
                        run_id = UUID(created_run.json()["id"])
                        job_id = job_id_for(run_id, generation=1)
                        try:
                            dispatched = await dispatcher.dispatch_once()
                            assert dispatched.claimed >= 1
                            assert dispatched.confirmed == dispatched.claimed
                            await process_run_v1(
                                {"job_id": job_id, "job_try": 1},
                                {"schema_version": 1, "run_id": str(run_id)},
                                database=worker_database,
                                provider=DeterministicMockProvider(),
                            )
                            result = await client.get(
                                f"/api/v1/runs/{run_id}/result",
                                headers={"Authorization": f"Bearer {owner_token}"},
                            )
                            assert result.status_code == 200
                            assert result.json()["result"]["run_id"] == str(run_id)
                            durations.append(perf_counter() - started_at)
                        finally:
                            await _remove_exact_queue_keys(job_id)
            finally:
                await queue.aclose(close_connection_pool=True)

        assert len(durations) == 30
        p95 = sorted(durations)[ceil(0.95 * len(durations)) - 1]
        assert p95 < 10.0, f"30-run deterministic terminal-result p95 was {p95:.3f}s"
    finally:
        await _clear_rate_limit_namespace(rate_prefix)
        if organization_id is not None:
            _run_as_local_supabase_admin(
                "delete from api.organizations where id = :'organization_id'::uuid;",
                organization_id=organization_id,
            )


@pytest.mark.integration
async def test_p2_result_write_boundary_rejects_nested_contract_drift(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    local_supabase = _local_supabase()
    owner_token = _sign_in(local_supabase, OWNER_A)
    suffix = uuid4().hex
    job_id: str | None = None

    async with _api_client(monkeypatch) as client:
        run_id = await _create_p2_dispatch_run(
            client, owner_token, suffix=suffix, label="p2-result-contract"
        )
        job_id = job_id_for(run_id, generation=1)
        queue = create_queue_client(LOCAL_REDIS_URL, max_connections=4)
        try:
            async with _worker_database(monkeypatch) as worker_database:
                dispatcher = RunDispatcher(
                    worker_database, RedisRunQueue(cast(RedisDispatchClient, queue))
                )
                dispatched = await dispatcher.dispatch_once()
                assert dispatched.claimed >= 1
                assert dispatched.confirmed == dispatched.claimed
                claim = await worker_database.claim_execution(run_id, 1, job_id)
                assert claim.status == "claimed"
                assert claim.attempt_id is not None
                assert claim.lease_token is not None
                assert claim.frozen_manifest is not None
                assert claim.frozen_manifest_sha256 is not None
                assert claim.deterministic_seed is not None

                provider_started_at = datetime.now(UTC)
                provider_request = _provider_request(
                    run_id=run_id,
                    claim_attempt_id=claim.attempt_id,
                    frozen_manifest=claim.frozen_manifest,
                    frozen_manifest_sha256=claim.frozen_manifest_sha256,
                    deterministic_seed=claim.deterministic_seed,
                    runtime_release_sha="a" * 40,
                    deadline_at=provider_started_at + timedelta(seconds=30),
                )
                provider_response = DeterministicMockProvider().run(provider_request)
                provider_ended_at = datetime.now(UTC)
                artifact = provider_response.result.model_dump(mode="json")
                receipt = ProviderExecutionReceiptV1.from_success(
                    request=provider_request,
                    response=provider_response,
                    started_at=provider_started_at,
                    ended_at=provider_ended_at,
                ).model_dump(mode="json")
                invalid_artifacts = []

                top_level_extra = deepcopy(artifact)
                top_level_extra["unreviewed"] = {"nested": "payload"}
                invalid_artifacts.append(top_level_extra)

                nested_extra = deepcopy(artifact)
                nested_extra["outputs"][0]["value"]["unreviewed"] = True
                invalid_artifacts.append(nested_extra)

                provenance_mismatch = deepcopy(artifact)
                provenance_mismatch["provenance"]["frozen_manifest_sha256"] = "0" * 64
                invalid_artifacts.append(provenance_mismatch)

                release_mismatch = deepcopy(artifact)
                release_mismatch["provenance"]["code_release_sha"] = "0" * 40
                invalid_artifacts.append(release_mismatch)

                configuration_mismatch = deepcopy(artifact)
                configuration_mismatch["provenance"]["configuration_sha256"] = "0" * 64
                invalid_artifacts.append(configuration_mismatch)

                for invalid_artifact in invalid_artifacts:
                    with pytest.raises(
                        psycopg.errors.InvalidParameterValue,
                        match="invalid_result_contract",
                    ):
                        await worker_database.complete_execution(
                            run_id,
                            claim.attempt_id,
                            claim.lease_token,
                            invalid_artifact,
                            receipt,
                        )

                assert await worker_database.complete_execution(
                    run_id,
                    claim.attempt_id,
                    claim.lease_token,
                    artifact,
                    receipt,
                )
        finally:
            await queue.aclose(close_connection_pool=True)
            if job_id is not None:
                await _remove_exact_queue_keys(job_id)

        result = await client.get(
            f"/api/v1/runs/{run_id}/result",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert result.status_code == 200
        assert result.json()["result"] == artifact


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
async def test_p2_critical_queue_signal_latches_run_creation_until_operator_recovery(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    local_supabase = _local_supabase()
    owner_token = _sign_in(local_supabase, OWNER_A)
    suffix = uuid4().hex
    operator_correlation_id = uuid4()
    run_ids: list[UUID] = []

    try:
        async with _api_client(monkeypatch) as client:
            created_organization = await client.post(
                "/api/v1/organizations",
                headers=_headers(owner_token, f"p2-control-org-{suffix}"),
                json={"name": f"P2 Control {suffix[:8]}"},
            )
            assert created_organization.status_code == 201
            organization_id = UUID(created_organization.json()["id"])
            created_project = await client.post(
                f"/api/v1/organizations/{organization_id}/projects",
                headers=_headers(owner_token, f"p2-control-project-{suffix}"),
                json=_project_payload(f"P2 Control {suffix[:8]}"),
            )
            assert created_project.status_code == 201
            project_id = UUID(created_project.json()["id"])
            created_stimulus = await client.post(
                f"/api/v1/projects/{project_id}/stimuli",
                headers=_headers(owner_token, f"p2-control-stimulus-{suffix}"),
                json={"name": "P2 Control", "content": "Try fictional control now."},
            )
            assert created_stimulus.status_code == 201
            stimulus_version_id = UUID(created_stimulus.json()["versions"][0]["id"])
            first_key = f"p2-control-run-{suffix}"
            first = await client.post(
                f"/api/v1/projects/{project_id}/runs",
                headers=_headers(owner_token, first_key),
                json={"stimulus_version_id": str(stimulus_version_id)},
            )
            assert first.status_code == 202
            first_run_id = UUID(first.json()["id"])
            run_ids.append(first_run_id)

            async with _worker_database(monkeypatch) as worker_database:
                control = await worker_database.evaluate_run_creation_control(91.0, 0)
            assert control.enabled is False
            assert control.alert_reason == "redis_memory_critical"
            assert control.changed is True
            worker_correlation_id = UUID(
                _run_as_local_supabase_admin(
                    """
                    set role postgres;
                    select correlation_id
                    from private.runtime_controls
                    where control_name = 'run_creation';
                    """
                ).splitlines()[-1]
            )

            blocked = await client.post(
                f"/api/v1/projects/{project_id}/runs",
                headers=_headers(owner_token, f"p2-control-blocked-{suffix}"),
                json={"stimulus_version_id": str(stimulus_version_id)},
            )
            assert blocked.status_code == 503
            assert blocked.headers["retry-after"] == "30"
            assert blocked.json()["code"] == "queue_backpressure"

            _run_as_local_supabase_admin(
                """
                set role postgres;
                select private.set_run_creation_control(
                  true,
                  'operator_recovery_verified',
                  :'correlation_id'::uuid
                );
                """,
                correlation_id=operator_correlation_id,
            )

            async with _api_client(monkeypatch) as recovered_client:
                admitted = await recovered_client.post(
                    f"/api/v1/projects/{project_id}/runs",
                    headers=_headers(owner_token, f"p2-control-recovered-{suffix}"),
                    json={"stimulus_version_id": str(stimulus_version_id)},
                )
                assert admitted.status_code == 202
                run_ids.append(UUID(admitted.json()["id"]))

            audit_counts = _run_as_local_supabase_admin(
                """
                set role postgres;
                select
                    count(*) filter (
                      where action = 'operator.run_creation_disabled'
                        and source_service = 'worker'
                        and correlation_id = :'correlation_id'::uuid
                    ),
                  count(*) filter (
                    where action = 'operator.run_creation_enabled'
                      and source_service = 'operator'
                      and correlation_id = :'operator_correlation_id'::uuid
                  )
                from private.audit_events
                where object_type = 'runtime_control';
                """,
                correlation_id=worker_correlation_id,
                operator_correlation_id=operator_correlation_id,
            )
            assert audit_counts.endswith("1|1")
    finally:
        cleanup_correlation_id = uuid4()
        _run_as_local_supabase_admin(
            """
            set role postgres;
            select private.set_run_creation_control(
              true,
              'operator_recovery_verified',
              :'correlation_id'::uuid
            );
            """,
            correlation_id=cleanup_correlation_id,
        )
        for run_id in run_ids:
            _run_as_local_supabase_admin(
                """
                update private.run_outbox
                set status = 'terminal',
                    claim_token = null,
                    claim_expires_at = null,
                    confirmed_at = null,
                    terminal_error_code = 'integration_control_cleanup'
                where run_id = :'run_id'::uuid;
                """,
                run_id=run_id,
            )
            await _remove_exact_queue_keys(job_id_for(run_id, generation=1))


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
                assert finalized.canceled >= 1
                assert finalized.confirmed == finalized.claimed

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
                assert dispatched.claimed >= 1
                assert dispatched.confirmed == dispatched.claimed

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

                provider_started_at = datetime.now(UTC)
                provider_response = DeterministicMockProvider().run(
                    _provider_request(
                        run_id=running_run_id,
                        claim_attempt_id=claim.attempt_id,
                        frozen_manifest=claim.frozen_manifest,
                        frozen_manifest_sha256=claim.frozen_manifest_sha256,
                        deterministic_seed=claim.deterministic_seed,
                        runtime_release_sha="a" * 40,
                        deadline_at=provider_started_at + timedelta(seconds=30),
                    )
                )
                assert await worker_database.complete_execution(
                    running_run_id,
                    claim.attempt_id,
                    claim.lease_token,
                    provider_response.result.model_dump(mode="json"),
                    {},
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

    def run(self, request: ProviderRequest) -> ProviderResponse:
        del request
        self.calls += 1
        raise TimeoutError


class _PreflightUnavailableProvider:
    def __init__(self) -> None:
        self.calls = 0

    def run(self, request: ProviderRequest) -> ProviderResponse:
        del request
        self.calls += 1
        raise ProviderPreflightUnavailableError


class _RateLimitedProvider:
    def __init__(self) -> None:
        self.calls = 0

    def run(self, request: ProviderRequest) -> ProviderResponse:
        del request
        self.calls += 1
        raise ProviderRateLimitedError


class _RetryableFailureProvider(Protocol):
    calls: int

    def run(self, request: ProviderRequest) -> ProviderResponse: ...


@pytest.mark.parametrize(
    ("provider_factory", "expected_failure_code"),
    [
        (_TimeoutProvider, "execution_timed_out"),
        (_PreflightUnavailableProvider, "execution_provider_preflight_unavailable"),
        (_RateLimitedProvider, "execution_rate_limited"),
    ],
    ids=["timeout", "preflight-unavailable", "rate-limited"],
)
@pytest.mark.integration
async def test_p2_retryable_provider_failures_use_database_backoff_then_exhaust(
    monkeypatch: pytest.MonkeyPatch,
    provider_factory: Callable[[], _RetryableFailureProvider],
    expected_failure_code: str,
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
        correlation_id = created_run.headers["x-correlation-id"]
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
                assert dispatched.claimed >= 1
                assert dispatched.confirmed == dispatched.claimed
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
        assert failed.json()["failure"] == {
            "code": expected_failure_code,
            "correlation_id": correlation_id,
            "guidance": (
                "No substitute result was generated. Retry or use the correlation ID for support."
            ),
        }
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
                assert first_claim.attempt_id is not None
                assert first_claim.lease_token is not None

                _expire_local_run_lease(run_id)
                assert not await worker_database.heartbeat_execution(
                    run_id, first_claim.attempt_id, first_claim.lease_token
                )
                assert (
                    await worker_database.fail_execution(
                        run_id,
                        first_claim.attempt_id,
                        first_claim.lease_token,
                        "expired_worker_must_not_mutate",
                        True,
                    )
                ).state == "no_work"

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
                assert (
                    _run_as_local_supabase_admin(
                        """
                    select status::text || '|' || coalesce(safe_error_code, '') || '|'
                      || (finished_at is not null)::text
                    from private.run_attempts
                    where id = :'attempt_id'::uuid;
                    """,
                        attempt_id=first_claim.attempt_id,
                    )
                    == "superseded|recovered_stale_dispatch|true"
                )
                recovered_run = await client.get(
                    f"/api/v1/runs/{run_id}",
                    headers={"Authorization": f"Bearer {owner_token}"},
                )
                assert recovered_run.status_code == 200
                assert recovered_run.json()["state"] == "running"
                assert recovered_run.json()["dispatch_generation"] == 2
                assert (
                    await worker_database.fail_execution(
                        run_id,
                        second_claim.attempt_id,
                        second_claim.lease_token,
                        "integration_cleanup",
                        False,
                    )
                ).state == "failed"
        finally:
            await queue.aclose(close_connection_pool=True)
            if first_job_id is not None:
                await _remove_exact_queue_keys(first_job_id)
            if second_job_id is not None:
                await _remove_exact_queue_keys(second_job_id)


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
            for run_id in claimed_run_ids:
                assert (
                    _run_as_local_supabase_admin(
                        """
                    select status::text || '|' || coalesce(safe_error_code, '') || '|'
                      || (finished_at is not null)::text
                    from private.run_attempts
                    where run_id = :'run_id'::uuid;
                    """,
                        run_id=run_id,
                    )
                    == "canceled|canceled_by_user|true"
                )
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

                async with _api_client(monkeypatch) as synchronous_client:
                    synchronous_run_id = await _create_p2_dispatch_run(
                        synchronous_client,
                        owner_token,
                        suffix=f"synchronous-{suffix}",
                        label="p2-poison",
                    )
                    synchronous_claims = await worker_database.claim_due_dispatches()
                    assert [claim.run_id for claim in synchronous_claims] == [synchronous_run_id]
                    synchronous_claim = synchronous_claims[0]
                    _set_local_dispatch_attempt_count(synchronous_run_id, 10)
                    assert await worker_database.fail_dispatch(
                        synchronous_claim.outbox_id,
                        synchronous_claim.claim_token,
                        "dispatch_transport_failed",
                    )
                    assert (
                        _run_as_local_supabase_admin(
                            """
                            set role postgres;
                            select enabled::text || '|' || coalesce(reason, '')
                            from private.runtime_controls
                            where control_name = 'run_creation';
                            """
                        ).splitlines()[-1]
                        == "false|poison_outbox"
                    )

                    _run_as_local_supabase_admin(
                        """
                        set role postgres;
                        select private.set_run_creation_control(
                          true,
                          'operator_recovery_verified',
                          :'operator_correlation_id'::uuid
                        );
                        """,
                        operator_correlation_id=uuid4(),
                    )

                dispatcher = RunDispatcher(worker_database, _NoDispatchQueue())
                result = await dispatcher.dispatch_once()
                # Pass counters are worker-wide and can include stale leases
                # created by earlier integration cases. Target run states
                # below are the isolation-safe proof for this case.
                assert result.canceled >= 1
                assert result.poisoned >= 1
                assert (
                    _run_as_local_supabase_admin(
                        """
                        set role postgres;
                        select enabled::text || '|' || coalesce(reason, '')
                        from private.runtime_controls
                        where control_name = 'run_creation';
                        """
                    ).splitlines()[-1]
                    == "false|poison_outbox"
                )

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
        assert poisoned.json()["failure"]["code"] == "dispatch_exhausted"
        UUID(poisoned.json()["failure"]["correlation_id"])
        assert poisoned.json()["failure"]["guidance"] == (
            "No substitute result was generated. Retry or use the correlation ID for support."
        )
        synchronous = await client.get(
            f"/api/v1/runs/{synchronous_run_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert synchronous.status_code == 200
        assert synchronous.json()["state"] == "failed"
        assert synchronous.json()["failure"]["code"] == "dispatch_exhausted"
