from __future__ import annotations

import os
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis, from_url
from simula_api.app import create_app
from simula_core.arq_codec import ARQ_QUEUE_NAME, job_id_for
from simula_core.queue_runtime import create_queue_client
from simula_core.simulation import DeterministicMockProvider
from simula_worker.config import WorkerSettings
from simula_worker.database import WorkerDatabase
from simula_worker.dispatcher import RedisDispatchClient, RedisRunQueue, RunDispatcher
from simula_worker.main import process_run_v1

from tests.integration.test_api_m2 import (
    LOCAL_REDIS_URL,
    OWNER_A,
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
                assert (
                    await worker_database.fail_execution(
                        retry_run_id,
                        retry_claim.attempt_id,
                        retry_claim.lease_token,
                        "integration_retry",
                        retryable=True,
                    )
                    == "retrying"
                )
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
        assert run.status_code == 200
        assert run.json()["state"] == "succeeded"
        assert result.status_code == 200
        assert result.json()["result"]["schema_version"] == "1.0.0"
        assert result.json()["result"]["run_id"] == str(run_id)

        retrying_run = await client.get(
            f"/api/v1/runs/{retry_run_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert retrying_run.status_code == 200
        assert retrying_run.json()["state"] == "retrying"
