from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from uuid import uuid4

import pytest
from redis.asyncio import Redis, from_url
from simula_api.problems import AppProblem
from simula_api.rate_limits import (
    GENERAL_AUTHENTICATED,
    GENERAL_UNAUTHENTICATED,
    IDEMPOTENCY_DEDUPE_TTL_SECONDS,
    ORGANIZATION_MUTATION,
    RUN_CANCEL,
    RedisRateLimiter,
)

LOCAL_REDIS_URL = "redis://127.0.0.1:6379/15"


async def _attempt(operation: Callable[[], Awaitable[object]]) -> AppProblem | None:
    try:
        await operation()
    except AppProblem as error:
        return error
    return None


async def _delete_test_keys(client: Redis, key_prefix: str) -> None:
    keys = [key async for key in client.scan_iter(match=f"{key_prefix}:*")]
    if keys:
        await client.delete(*keys)


@pytest.mark.integration
async def test_redis_token_buckets_enforce_burst_concurrency_and_partitioning() -> None:
    client = from_url(LOCAL_REDIS_URL, decode_responses=True)  # type: ignore[no-untyped-call]
    key_prefix = f"simula:test:rate:{uuid4().hex}"
    limiter = RedisRateLimiter(client, key_prefix=key_prefix)
    try:
        await limiter.open()
        general_user = uuid4()
        general_attempts = await asyncio.gather(
            *[
                _attempt(lambda: limiter.require_general(user_id=general_user))
                for _ in range(GENERAL_AUTHENTICATED.burst + 1)
            ]
        )
        general_denials = [result for result in general_attempts if result is not None]
        assert len(general_denials) == 1
        assert general_denials[0].code == "rate_limited"
        assert general_denials[0].retry_after is not None and general_denials[0].retry_after > 0

        unauthenticated_attempts = await asyncio.gather(
            *[
                _attempt(lambda: limiter.require_unauthenticated(ip_hash="a" * 64))
                for _ in range(GENERAL_UNAUTHENTICATED.burst + 1)
            ]
        )
        assert (
            sum(result is None for result in unauthenticated_attempts)
            == GENERAL_UNAUTHENTICATED.burst
        )
        assert sum(result is not None for result in unauthenticated_attempts) == 1

        for _ in range(GENERAL_UNAUTHENTICATED.burst + 1):
            await limiter.require_unauthenticated(ip_hash="b" * 64)
            await limiter.release_unauthenticated(ip_hash="b" * 64)

        replay_user = uuid4()
        replay_key = "rate-test-general-replay-key-0001"
        replay_scope = "POST:/api/v1/organizations"
        replay_attempts = await asyncio.gather(
            *[
                _attempt(
                    lambda: limiter.require_general(
                        user_id=replay_user,
                        idempotency_key=replay_key,
                        idempotency_scope=replay_scope,
                    )
                )
                for _ in range(GENERAL_AUTHENTICATED.burst + 1)
            ]
        )
        replay_denials = [result for result in replay_attempts if result is not None]
        assert len(replay_denials) == 1
        assert replay_denials[0].code == "rate_limited"
        replay_marker = [
            key
            async for key in client.scan_iter(
                match=f"{key_prefix}:s2:general_authenticated:user:{replay_user}:idempotency:*"
            )
        ]
        assert replay_marker == []

        rejected_user = uuid4()
        rejected_idempotency_key = "rate-test-rejected-organization-key-0001"
        rejected_admission = await limiter.require_organization_create(
            user_id=rejected_user,
            idempotency_key=rejected_idempotency_key,
            idempotency_scope="POST:/api/v1/organizations",
        )
        assert rejected_admission is not None and not rejected_admission.accepted_replay
        await limiter.reject_idempotency(rejected_admission)
        rejected_retry = await _attempt(
            lambda: limiter.require_organization_create(
                user_id=rejected_user,
                idempotency_key=rejected_idempotency_key,
                idempotency_scope="POST:/api/v1/organizations",
            )
        )
        assert rejected_retry is not None and rejected_retry.code == "rate_limited"

        create_user = uuid4()
        create_key = "rate-test-organization-key-0001"
        create_admission = await limiter.require_organization_create(
            user_id=create_user,
            idempotency_key=create_key,
            idempotency_scope="POST:/api/v1/organizations",
        )
        assert create_admission is not None and not create_admission.accepted_replay
        await limiter.accept_idempotency(create_admission)
        replay_admission = await limiter.require_organization_create(
            user_id=create_user,
            idempotency_key=create_key,
            idempotency_scope="POST:/api/v1/organizations",
        )
        assert replay_admission is not None and replay_admission.accepted_replay
        create_denial = await _attempt(
            lambda: limiter.require_organization_create(
                user_id=create_user,
                idempotency_key="rate-test-organization-key-0002",
                idempotency_scope="POST:/api/v1/organizations",
            )
        )
        assert create_denial is not None
        assert create_denial.code == "rate_limited"
        accepted_marker = [
            key
            async for key in client.scan_iter(
                match=f"{key_prefix}:s2:organization_create:user:{create_user}:idempotency:*"
            )
        ]
        assert len(accepted_marker) == 1
        assert await client.hget(accepted_marker[0], "state") == "accepted"
        assert await client.hget(accepted_marker[0], "participants") == "0"
        assert await client.ttl(accepted_marker[0]) >= IDEMPOTENCY_DEDUPE_TTL_SECONDS - 1

        concurrent_user = uuid4()
        concurrent_key = "rate-test-concurrent-organization-key-0001"
        first_admission = await limiter.require_organization_create(
            user_id=concurrent_user,
            idempotency_key=concurrent_key,
            idempotency_scope="POST:/api/v1/organizations",
        )
        assert first_admission is not None
        await client.expire(first_admission.marker_key, 100)
        second_admission = await limiter.require_organization_create(
            user_id=concurrent_user,
            idempotency_key=concurrent_key,
            idempotency_scope="POST:/api/v1/organizations",
        )
        assert second_admission is not None
        assert first_admission.marker_key == second_admission.marker_key
        assert await client.hget(first_admission.marker_key, "state") == "pending"
        assert await client.hget(first_admission.marker_key, "participants") == "2"
        assert 0 < await client.ttl(first_admission.marker_key) <= 100
        await limiter.reject_idempotency(second_admission)
        await limiter.reject_idempotency(second_admission)
        assert await client.hget(first_admission.marker_key, "state") == "pending"
        assert await client.hget(first_admission.marker_key, "participants") == "1"
        await limiter.accept_idempotency(first_admission)
        await limiter.reject_idempotency(second_admission)
        assert await client.hget(first_admission.marker_key, "state") == "accepted"
        assert await client.hget(first_admission.marker_key, "participants") == "0"
        assert 0 < await client.ttl(first_admission.marker_key) <= 100

        resource_user = uuid4()
        resource_organization = uuid4()
        resource_key = "rate-test-resource-scope-key-0001"
        first_resource = await limiter.require_organization_mutation(
            user_id=resource_user,
            organization_id=resource_organization,
            idempotency_key=resource_key,
            idempotency_scope="POST:/api/v1/projects/{project_id}/stimuli",
            idempotency_resource_id=uuid4(),
        )
        assert first_resource is not None
        await limiter.accept_idempotency(first_resource)
        second_resource = await limiter.require_organization_mutation(
            user_id=resource_user,
            organization_id=resource_organization,
            idempotency_key=resource_key,
            idempotency_scope="POST:/api/v1/projects/{project_id}/stimuli",
            idempotency_resource_id=uuid4(),
        )
        assert second_resource is not None and not second_resource.accepted_replay
        assert second_resource.marker_key != first_resource.marker_key
        await limiter.accept_idempotency(second_resource)

        run_scope_user = uuid4()
        run_scope_organization = uuid4()
        run_scope_key = "rate-test-run-resource-scope-key-0001"
        first_run_scope = await limiter.require_run_create(
            user_id=run_scope_user,
            organization_id=run_scope_organization,
            project_id=uuid4(),
            idempotency_key=run_scope_key,
            idempotency_scope="POST:/api/v1/projects/{project_id}/runs",
        )
        await limiter.accept_idempotency(*first_run_scope)
        second_run_scope = await limiter.require_run_create(
            user_id=run_scope_user,
            organization_id=run_scope_organization,
            project_id=uuid4(),
            idempotency_key=run_scope_key,
            idempotency_scope="POST:/api/v1/projects/{project_id}/runs",
        )
        assert not second_run_scope[0].accepted_replay
        assert second_run_scope[0].marker_key != first_run_scope[0].marker_key
        await limiter.accept_idempotency(*second_run_scope)
        third_run_scope = await _attempt(
            lambda: limiter.require_run_create(
                user_id=run_scope_user,
                organization_id=run_scope_organization,
                project_id=uuid4(),
                idempotency_key=run_scope_key,
                idempotency_scope="POST:/api/v1/projects/{project_id}/runs",
            )
        )
        assert third_run_scope is not None and third_run_scope.code == "rate_limited"

        run_organization = uuid4()
        for index in range(2):
            admissions = await limiter.require_run_create(
                user_id=uuid4(),
                organization_id=run_organization,
                project_id=uuid4(),
                idempotency_key=f"rate-test-run-org-key-{index:04d}",
                idempotency_scope="POST:/api/v1/runs",
            )
            await limiter.accept_idempotency(*admissions)
        run_marker_count = len(
            [
                key
                async for key in client.scan_iter(match=f"{key_prefix}:s2:run_create:idempotency:*")
            ]
        )
        denied_run_user = uuid4()
        denied_run = await _attempt(
            lambda: limiter.require_run_create(
                user_id=denied_run_user,
                organization_id=run_organization,
                project_id=uuid4(),
                idempotency_key="rate-test-run-org-key-denied-0001",
                idempotency_scope="POST:/api/v1/runs",
            )
        )
        assert denied_run is not None and denied_run.code == "rate_limited"
        assert (
            len(
                [
                    key
                    async for key in client.scan_iter(
                        match=f"{key_prefix}:s2:run_create:idempotency:*"
                    )
                ]
            )
            == run_marker_count
        )
        for index in range(2):
            admissions = await limiter.require_run_create(
                user_id=denied_run_user,
                organization_id=uuid4(),
                project_id=uuid4(),
                idempotency_key=f"rate-test-run-user-after-denial-{index:04d}",
                idempotency_scope="POST:/api/v1/runs",
            )
            await limiter.accept_idempotency(*admissions)

        mutation_user = uuid4()
        organization_a = uuid4()
        mutation_attempts = await asyncio.gather(
            *[
                _attempt(
                    lambda: limiter.require_organization_mutation(
                        user_id=mutation_user,
                        organization_id=organization_a,
                    )
                )
                for _ in range(ORGANIZATION_MUTATION.burst + 1)
            ]
        )
        assert sum(result is None for result in mutation_attempts) == ORGANIZATION_MUTATION.burst
        assert sum(result is not None for result in mutation_attempts) == 1

        await limiter.require_organization_mutation(
            user_id=mutation_user,
            organization_id=uuid4(),
        )
        await limiter.require_organization_mutation(
            user_id=uuid4(),
            organization_id=organization_a,
        )

        cancel_user = uuid4()
        cancel_organization = uuid4()
        cancel_attempts = await asyncio.gather(
            *[
                _attempt(
                    lambda: limiter.require_run_cancel(
                        user_id=cancel_user,
                        organization_id=cancel_organization,
                    )
                )
                for _ in range(RUN_CANCEL.burst + 1)
            ]
        )
        assert sum(result is None for result in cancel_attempts) == RUN_CANCEL.burst
        assert sum(result is not None for result in cancel_attempts) == 1
        await limiter.require_run_cancel(
            user_id=cancel_user,
            organization_id=uuid4(),
        )
        await limiter.require_run_cancel(
            user_id=uuid4(),
            organization_id=cancel_organization,
        )
    finally:
        await _delete_test_keys(client, key_prefix)
        await limiter.close()
