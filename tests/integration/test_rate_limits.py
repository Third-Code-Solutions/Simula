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
    RedisRateLimiter,
)

LOCAL_REDIS_URL = "redis://127.0.0.1:6379/15"


async def _attempt(operation: Callable[[], Awaitable[None]]) -> AppProblem | None:
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
        await limiter.require_general(
            user_id=replay_user,
            idempotency_key=replay_key,
            idempotency_scope=replay_scope,
        )
        for _ in range(GENERAL_AUTHENTICATED.burst - 1):
            await limiter.require_general(user_id=replay_user)
        exhausted = await _attempt(lambda: limiter.require_general(user_id=replay_user))
        assert exhausted is not None and exhausted.code == "rate_limited"
        assert (
            await _attempt(
                lambda: limiter.require_general(
                    user_id=replay_user,
                    idempotency_key=replay_key,
                    idempotency_scope=replay_scope,
                )
            )
            is None
        )
        replay_marker = [
            key
            async for key in client.scan_iter(
                match=f"{key_prefix}:general_authenticated:user:{replay_user}:idempotency:*"
            )
        ]
        assert len(replay_marker) == 1
        assert await client.ttl(replay_marker[0]) >= IDEMPOTENCY_DEDUPE_TTL_SECONDS - 1

        create_user = uuid4()
        create_key = "rate-test-organization-key-0001"
        await limiter.require_organization_create(
            user_id=create_user,
            idempotency_key=create_key,
            idempotency_scope="POST:/api/v1/organizations",
        )
        await limiter.require_organization_create(
            user_id=create_user,
            idempotency_key=create_key,
            idempotency_scope="POST:/api/v1/organizations",
        )
        create_denial = await _attempt(
            lambda: limiter.require_organization_create(
                user_id=create_user,
                idempotency_key="rate-test-organization-key-0002",
                idempotency_scope="POST:/api/v1/organizations",
            )
        )
        assert create_denial is not None
        assert create_denial.code == "rate_limited"

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
    finally:
        await _delete_test_keys(client, key_prefix)
        await limiter.close()
