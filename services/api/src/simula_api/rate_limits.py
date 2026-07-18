"""Private Redis token buckets for the Phase 2 API boundary."""

# ruff: noqa: S105 -- the embedded Redis Lua script contains no credentials.

from __future__ import annotations

import asyncio
import hashlib
from collections.abc import Awaitable
from dataclasses import dataclass
from math import ceil
from typing import Protocol, cast
from uuid import UUID

from redis.asyncio import Redis, from_url
from redis.exceptions import RedisError

from simula_api.config import ApiSettings
from simula_api.problems import AppProblem

REDIS_TIMEOUT_SECONDS = 1.0
_RATE_KEY_PREFIX = "simula:rate:v1"
# Non-run idempotency records are retained for at least 24 hours. A valid
# replay must therefore bypass request-rate consumption for that same window.
IDEMPOTENCY_DEDUPE_TTL_SECONDS = 24 * 60 * 60

# Redis TIME makes refill calculations consistent across API replicas. The command
# is atomic with each bucket update, so concurrent callers cannot over-consume.
_TOKEN_BUCKET_LUA = """
local dedupe_created = false
if #KEYS == 2 then
  dedupe_created = redis.call('SET', KEYS[2], '1', 'NX', 'EX', tonumber(ARGV[4]))
  if not dedupe_created then
    return {1, 0}
  end
end

local now_parts = redis.call('TIME')
local now = tonumber(now_parts[1]) + (tonumber(now_parts[2]) / 1000000)
local refill_per_second = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local ttl_seconds = tonumber(ARGV[3])

local stored = redis.call('HMGET', KEYS[1], 'tokens', 'updated_at')
local tokens = tonumber(stored[1]) or capacity
local updated_at = tonumber(stored[2]) or now
if updated_at > now then
  updated_at = now
end
tokens = math.min(capacity, tokens + ((now - updated_at) * refill_per_second))

if tokens < 1 then
  local retry_after = math.ceil((1 - tokens) / refill_per_second)
  redis.call('HMSET', KEYS[1], 'tokens', tokens, 'updated_at', now)
  redis.call('EXPIRE', KEYS[1], ttl_seconds)
  if dedupe_created then
    redis.call('DEL', KEYS[2])
  end
  return {0, retry_after}
end

tokens = tokens - 1
redis.call('HMSET', KEYS[1], 'tokens', tokens, 'updated_at', now)
redis.call('EXPIRE', KEYS[1], ttl_seconds)
return {1, 0}
"""

_TOKEN_BUCKET_REFUND_LUA = """
local now_parts = redis.call('TIME')
local now = tonumber(now_parts[1]) + (tonumber(now_parts[2]) / 1000000)
local refill_per_second = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local ttl_seconds = tonumber(ARGV[3])

local stored = redis.call('HMGET', KEYS[1], 'tokens', 'updated_at')
local tokens = tonumber(stored[1]) or capacity
local updated_at = tonumber(stored[2]) or now
if updated_at > now then
  updated_at = now
end
tokens = math.min(capacity, tokens + ((now - updated_at) * refill_per_second))
tokens = math.min(capacity, tokens + 1)
redis.call('HMSET', KEYS[1], 'tokens', tokens, 'updated_at', now)
redis.call('EXPIRE', KEYS[1], ttl_seconds)
return 1
"""


@dataclass(frozen=True)
class TokenBucketPolicy:
    name: str
    limit: int
    period_seconds: int
    burst: int

    @property
    def refill_per_second(self) -> float:
        return self.limit / self.period_seconds

    @property
    def ttl_seconds(self) -> int:
        return max(60, ceil((self.burst / self.refill_per_second) * 2))


GENERAL_AUTHENTICATED = TokenBucketPolicy(
    name="general_authenticated", limit=120, period_seconds=60, burst=30
)
GENERAL_UNAUTHENTICATED = TokenBucketPolicy(
    name="general_unauthenticated", limit=30, period_seconds=60, burst=10
)
ORGANIZATION_CREATE = TokenBucketPolicy(
    name="organization_create", limit=3, period_seconds=60 * 60, burst=1
)
ORGANIZATION_MUTATION = TokenBucketPolicy(
    name="organization_mutation", limit=30, period_seconds=60 * 60, burst=5
)
RUN_CREATE_USER = TokenBucketPolicy(
    name="run_create_user", limit=10, period_seconds=60 * 60, burst=2
)
RUN_CREATE_ORGANIZATION = TokenBucketPolicy(
    name="run_create_organization", limit=50, period_seconds=24 * 60 * 60, burst=2
)
RUN_READ = TokenBucketPolicy(name="run_read", limit=60, period_seconds=60, burst=10)


class RateLimiter(Protocol):
    async def require_unauthenticated(self, *, ip_hash: str) -> None: ...

    async def release_unauthenticated(self, *, ip_hash: str) -> None: ...

    async def require_general(
        self,
        *,
        user_id: UUID,
        idempotency_key: str | None = None,
        idempotency_scope: str | None = None,
    ) -> None: ...

    async def require_organization_create(
        self,
        *,
        user_id: UUID,
        idempotency_key: str,
        idempotency_scope: str,
    ) -> None: ...

    async def require_organization_mutation(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        idempotency_key: str | None = None,
        idempotency_scope: str | None = None,
    ) -> None: ...

    async def require_run_create(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        idempotency_key: str,
        idempotency_scope: str,
    ) -> None: ...

    async def require_run_read(self, *, user_id: UUID, run_id: UUID) -> None: ...


class RedisRateLimiter:
    def __init__(self, client: Redis, *, key_prefix: str = _RATE_KEY_PREFIX) -> None:
        self._client = client
        self._key_prefix = key_prefix

    @classmethod
    def from_settings(cls, settings: ApiSettings) -> RedisRateLimiter:
        return cls(
            from_url(  # type: ignore[no-untyped-call]
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=REDIS_TIMEOUT_SECONDS,
                socket_timeout=REDIS_TIMEOUT_SECONDS,
            ),
            key_prefix=settings.rate_limit_key_prefix,
        )

    async def open(self) -> None:
        try:
            async with asyncio.timeout(REDIS_TIMEOUT_SECONDS):
                if not await self._client.ping():
                    raise RedisError("Redis PING returned false")
        except (TimeoutError, RedisError) as error:
            raise _dependency_unavailable() from error

    async def ready(self) -> bool:
        try:
            async with asyncio.timeout(REDIS_TIMEOUT_SECONDS):
                return bool(await self._client.ping())
        except TimeoutError, RedisError:
            return False

    async def close(self) -> None:
        await cast(Awaitable[None], self._client.aclose())

    async def require_unauthenticated(self, *, ip_hash: str) -> None:
        await self._consume(GENERAL_UNAUTHENTICATED, subject=f"ip:{ip_hash}")

    async def release_unauthenticated(self, *, ip_hash: str) -> None:
        await self._refund(GENERAL_UNAUTHENTICATED, subject=f"ip:{ip_hash}")

    async def require_general(
        self,
        *,
        user_id: UUID,
        idempotency_key: str | None = None,
        idempotency_scope: str | None = None,
    ) -> None:
        await self._consume(
            GENERAL_AUTHENTICATED,
            subject=f"user:{user_id}",
            idempotency_key=idempotency_key,
            idempotency_scope=idempotency_scope,
        )

    async def require_organization_create(
        self,
        *,
        user_id: UUID,
        idempotency_key: str,
        idempotency_scope: str,
    ) -> None:
        await self._consume(
            ORGANIZATION_CREATE,
            subject=f"user:{user_id}",
            idempotency_key=idempotency_key,
            idempotency_scope=idempotency_scope,
        )

    async def require_organization_mutation(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        idempotency_key: str | None = None,
        idempotency_scope: str | None = None,
    ) -> None:
        await self._consume(
            ORGANIZATION_MUTATION,
            subject=f"user:{user_id}",
            organization_id=organization_id,
            idempotency_key=idempotency_key,
            idempotency_scope=idempotency_scope,
        )

    async def require_run_create(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        idempotency_key: str,
        idempotency_scope: str,
    ) -> None:
        await self._consume(
            RUN_CREATE_USER,
            subject=f"user:{user_id}",
            idempotency_key=idempotency_key,
            idempotency_scope=idempotency_scope,
        )
        await self._consume(
            RUN_CREATE_ORGANIZATION,
            subject="organization",
            organization_id=organization_id,
            idempotency_key=idempotency_key,
            idempotency_scope=idempotency_scope,
        )

    async def require_run_read(self, *, user_id: UUID, run_id: UUID) -> None:
        await self._consume(RUN_READ, subject=f"user:{user_id}:run:{run_id}")

    async def _consume(
        self,
        policy: TokenBucketPolicy,
        *,
        subject: str,
        organization_id: UUID | None = None,
        idempotency_key: str | None = None,
        idempotency_scope: str | None = None,
    ) -> None:
        if (idempotency_key is None) != (idempotency_scope is None):
            raise ValueError("idempotency key and scope must be supplied together")

        key_parts = [self._key_prefix, policy.name, subject]
        if organization_id is not None:
            key_parts.append(str(organization_id))
        keys = [":".join(key_parts)]
        if idempotency_key is not None and idempotency_scope is not None:
            key_parts.append("idempotency")
            digest_input = f"{idempotency_scope}\0{idempotency_key}".encode()
            key_parts.append(hashlib.sha256(digest_input).hexdigest())
            keys.append(":".join(key_parts))
        try:
            async with asyncio.timeout(REDIS_TIMEOUT_SECONDS):
                evaluation = self._client.eval(
                    _TOKEN_BUCKET_LUA,
                    len(keys),
                    *keys,
                    str(policy.refill_per_second),
                    str(policy.burst),
                    str(policy.ttl_seconds),
                    str(max(policy.period_seconds, IDEMPOTENCY_DEDUPE_TTL_SECONDS)),
                )
                result = await cast(Awaitable[object], evaluation)
        except (TimeoutError, RedisError) as error:
            raise _dependency_unavailable() from error

        if not isinstance(result, list) or len(result) != 2:
            raise _dependency_unavailable()
        try:
            allowed = int(result[0])
            retry_after = max(1, int(result[1]))
        except (TypeError, ValueError) as error:
            raise _dependency_unavailable() from error
        if allowed == 1:
            return
        if allowed != 0:
            raise _dependency_unavailable()
        raise AppProblem(
            status=429,
            code="rate_limited",
            title="Rate limit reached",
            detail="Too many requests. Retry after the indicated delay.",
            retry_after=retry_after,
        )

    async def _refund(self, policy: TokenBucketPolicy, *, subject: str) -> None:
        key = ":".join([self._key_prefix, policy.name, subject])
        try:
            async with asyncio.timeout(REDIS_TIMEOUT_SECONDS):
                evaluation = self._client.eval(
                    _TOKEN_BUCKET_REFUND_LUA,
                    1,
                    key,
                    str(policy.refill_per_second),
                    str(policy.burst),
                    str(policy.ttl_seconds),
                )
                result = await cast(Awaitable[object], evaluation)
        except (TimeoutError, RedisError) as error:
            raise _dependency_unavailable() from error
        if not isinstance(result, (str, bytes, int)):
            raise _dependency_unavailable()
        try:
            refunded = int(result)
        except ValueError as error:
            raise _dependency_unavailable() from error
        if refunded != 1:
            raise _dependency_unavailable()


def _dependency_unavailable() -> AppProblem:
    return AppProblem(
        status=503,
        code="dependency_unavailable",
        title="Rate limiting unavailable",
        detail="The request could not be safely rate limited. Retry shortly.",
        retry_after=5,
    )
