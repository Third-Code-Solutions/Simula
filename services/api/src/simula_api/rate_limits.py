"""Private Redis token buckets for the Phase 2 API boundary."""

# ruff: noqa: S105 -- the embedded Redis Lua script contains no credentials.

from __future__ import annotations

import asyncio
import hashlib
from collections.abc import Awaitable
from dataclasses import dataclass
from math import ceil
from typing import Protocol, cast
from uuid import UUID, uuid4

from redis.asyncio import Redis, from_url
from redis.exceptions import RedisError

from simula_api.config import ApiSettings
from simula_api.problems import AppProblem

REDIS_TIMEOUT_SECONDS = 1.0
_RATE_KEY_PREFIX = "simula:rate:v1"
_RATE_KEY_SCHEMA = "s2"
# Non-run idempotency records are retained for at least 24 hours. A valid
# durable replay may bypass its route-specific mutation bucket for that window.
# General API attempts always consume; unaccepted command attempts never bypass.
IDEMPOTENCY_DEDUPE_TTL_SECONDS = 24 * 60 * 60
IDEMPOTENCY_PENDING_TTL_SECONDS = IDEMPOTENCY_DEDUPE_TTL_SECONDS

# Redis TIME makes refill calculations consistent across API replicas. The command
# is atomic with each bucket update, so concurrent callers cannot over-consume.
_TOKEN_BUCKET_LUA = """
if #KEYS == 2 then
  local marker_state = redis.call('HGET', KEYS[2], 'state')
  if marker_state == 'accepted' then
    return {2, 0}
  end
  if marker_state == 'pending' then
    local owner_field = 'owner:' .. ARGV[5]
    if redis.call('HSETNX', KEYS[2], owner_field, 1) == 1 then
      redis.call('HINCRBY', KEYS[2], 'participants', 1)
    end
    return {3, 0}
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
  return {0, retry_after}
end

tokens = tokens - 1
redis.call('HMSET', KEYS[1], 'tokens', tokens, 'updated_at', now)
redis.call('EXPIRE', KEYS[1], ttl_seconds)
if #KEYS == 2 then
  redis.call(
    'HSET', KEYS[2],
    'state', 'pending',
    'participants', 1,
    'owner:' .. ARGV[5], 1
  )
  redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4]))
end
return {1, 0}
"""

_ACCEPT_IDEMPOTENCY_LUA = """
for _, key in ipairs(KEYS) do
  local remaining_ttl = redis.call('TTL', key)
  redis.call('DEL', key)
  redis.call('HSET', key, 'state', 'accepted', 'participants', 0)
  if remaining_ttl > 0 then
    redis.call('EXPIRE', key, remaining_ttl)
  else
    redis.call('EXPIRE', key, tonumber(ARGV[1]))
  end
end
return #KEYS
"""

_REJECT_IDEMPOTENCY_LUA = """
local removed = 0
for index, key in ipairs(KEYS) do
  if redis.call('HGET', key, 'state') == 'pending' then
    local owner_field = 'owner:' .. ARGV[index]
    if redis.call('HDEL', key, owner_field) == 1 then
      local participants = redis.call('HINCRBY', key, 'participants', -1)
      if participants <= 0 then
        redis.call('DEL', key)
      end
      removed = removed + 1
    end
  end
end
return removed
"""

_RUN_CREATE_TOKEN_BUCKET_LUA = """
local marker_state = redis.call('HGET', KEYS[3], 'state')
if marker_state == 'accepted' then
  return {2, 0}
end
if marker_state == 'pending' then
  local owner_field = 'owner:' .. ARGV[8]
  if redis.call('HSETNX', KEYS[3], owner_field, 1) == 1 then
    redis.call('HINCRBY', KEYS[3], 'participants', 1)
  end
  return {3, 0}
end

local now_parts = redis.call('TIME')
local now = tonumber(now_parts[1]) + (tonumber(now_parts[2]) / 1000000)

local function refill(key, refill_per_second, capacity)
  local stored = redis.call('HMGET', key, 'tokens', 'updated_at')
  local tokens = tonumber(stored[1]) or capacity
  local updated_at = tonumber(stored[2]) or now
  if updated_at > now then
    updated_at = now
  end
  return math.min(capacity, tokens + ((now - updated_at) * refill_per_second))
end

local user_refill = tonumber(ARGV[1])
local user_capacity = tonumber(ARGV[2])
local user_tokens = refill(KEYS[1], user_refill, user_capacity)
local organization_refill = tonumber(ARGV[4])
local organization_capacity = tonumber(ARGV[5])
local organization_tokens = refill(KEYS[2], organization_refill, organization_capacity)

local retry_after = 0
if user_tokens < 1 then
  retry_after = math.max(retry_after, math.ceil((1 - user_tokens) / user_refill))
end
if organization_tokens < 1 then
  retry_after = math.max(
    retry_after,
    math.ceil((1 - organization_tokens) / organization_refill)
  )
end

if retry_after > 0 then
  redis.call('HMSET', KEYS[1], 'tokens', user_tokens, 'updated_at', now)
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
  redis.call('HMSET', KEYS[2], 'tokens', organization_tokens, 'updated_at', now)
  redis.call('EXPIRE', KEYS[2], tonumber(ARGV[6]))
  return {0, retry_after}
end

redis.call('HMSET', KEYS[1], 'tokens', user_tokens - 1, 'updated_at', now)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
redis.call('HMSET', KEYS[2], 'tokens', organization_tokens - 1, 'updated_at', now)
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[6]))
redis.call(
  'HSET', KEYS[3],
  'state', 'pending',
  'participants', 1,
  'owner:' .. ARGV[8], 1
)
redis.call('EXPIRE', KEYS[3], tonumber(ARGV[7]))
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


@dataclass(frozen=True)
class RateAdmission:
    marker_key: str
    owner_token: str
    accepted_replay: bool


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
RUN_CANCEL = TokenBucketPolicy(name="run_cancel", limit=30, period_seconds=60 * 60, burst=5)


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
    ) -> RateAdmission | None: ...

    async def require_organization_mutation(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        idempotency_key: str | None = None,
        idempotency_scope: str | None = None,
        idempotency_resource_id: UUID | None = None,
    ) -> RateAdmission | None: ...

    async def require_run_create(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        project_id: UUID,
        idempotency_key: str,
        idempotency_scope: str,
    ) -> tuple[RateAdmission, ...]: ...

    async def accept_idempotency(self, *admissions: RateAdmission) -> None: ...

    async def reject_idempotency(self, *admissions: RateAdmission) -> None: ...

    async def require_run_read(self, *, user_id: UUID, run_id: UUID) -> None: ...

    async def require_run_cancel(self, *, user_id: UUID, organization_id: UUID) -> None: ...


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
        del idempotency_key, idempotency_scope
        await self._consume(
            GENERAL_AUTHENTICATED,
            subject=f"user:{user_id}",
        )

    async def require_organization_create(
        self,
        *,
        user_id: UUID,
        idempotency_key: str,
        idempotency_scope: str,
    ) -> RateAdmission | None:
        return await self._consume(
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
        idempotency_resource_id: UUID | None = None,
    ) -> RateAdmission | None:
        return await self._consume(
            ORGANIZATION_MUTATION,
            subject=f"user:{user_id}",
            organization_id=organization_id,
            idempotency_key=idempotency_key,
            idempotency_scope=idempotency_scope,
            idempotency_resource_id=idempotency_resource_id,
        )

    async def require_run_create(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        project_id: UUID,
        idempotency_key: str,
        idempotency_scope: str,
    ) -> tuple[RateAdmission, ...]:
        admission = await self._consume_run_create(
            user_id=user_id,
            organization_id=organization_id,
            project_id=project_id,
            idempotency_key=idempotency_key,
            idempotency_scope=idempotency_scope,
        )
        return (admission,)

    async def accept_idempotency(self, *admissions: RateAdmission) -> None:
        marker_keys = list(dict.fromkeys(admission.marker_key for admission in admissions))
        if not marker_keys:
            return
        try:
            async with asyncio.timeout(REDIS_TIMEOUT_SECONDS):
                evaluation = self._client.eval(
                    _ACCEPT_IDEMPOTENCY_LUA,
                    len(marker_keys),
                    *marker_keys,
                    str(IDEMPOTENCY_DEDUPE_TTL_SECONDS),
                )
                result = await cast(Awaitable[object], evaluation)
        except (TimeoutError, RedisError) as error:
            raise _dependency_unavailable() from error
        try:
            accepted = int(cast(str | bytes | int, result))
        except (TypeError, ValueError) as error:
            raise _dependency_unavailable() from error
        if accepted != len(marker_keys):
            raise _dependency_unavailable()

    async def reject_idempotency(self, *admissions: RateAdmission) -> None:
        marker_owners = list(
            dict.fromkeys((admission.marker_key, admission.owner_token) for admission in admissions)
        )
        if not marker_owners:
            return
        marker_keys = [marker_key for marker_key, _ in marker_owners]
        owner_tokens = [owner_token for _, owner_token in marker_owners]
        try:
            async with asyncio.timeout(REDIS_TIMEOUT_SECONDS):
                evaluation = self._client.eval(
                    _REJECT_IDEMPOTENCY_LUA,
                    len(marker_keys),
                    *marker_keys,
                    *owner_tokens,
                )
                result = await cast(Awaitable[object], evaluation)
        except (TimeoutError, RedisError) as error:
            raise _dependency_unavailable() from error
        try:
            removed = int(cast(str | bytes | int, result))
        except (TypeError, ValueError) as error:
            raise _dependency_unavailable() from error
        if removed < 0 or removed > len(marker_keys):
            raise _dependency_unavailable()

    async def require_run_read(self, *, user_id: UUID, run_id: UUID) -> None:
        await self._consume(RUN_READ, subject=f"user:{user_id}:run:{run_id}")

    async def require_run_cancel(self, *, user_id: UUID, organization_id: UUID) -> None:
        await self._consume(
            RUN_CANCEL,
            subject=f"user:{user_id}",
            organization_id=organization_id,
        )

    async def _consume(
        self,
        policy: TokenBucketPolicy,
        *,
        subject: str,
        organization_id: UUID | None = None,
        idempotency_key: str | None = None,
        idempotency_scope: str | None = None,
        idempotency_resource_id: UUID | None = None,
    ) -> RateAdmission | None:
        if (idempotency_key is None) != (idempotency_scope is None):
            raise ValueError("idempotency key and scope must be supplied together")

        key_parts = [self._key_prefix, _RATE_KEY_SCHEMA, policy.name, subject]
        if organization_id is not None:
            key_parts.append(str(organization_id))
        keys = [":".join(key_parts)]
        owner_token = uuid4().hex
        if idempotency_key is not None and idempotency_scope is not None:
            key_parts.append("idempotency")
            digest_input = (
                f"{idempotency_scope}\0{idempotency_resource_id or ''}\0{idempotency_key}".encode()
            )
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
                    str(IDEMPOTENCY_PENDING_TTL_SECONDS),
                    owner_token,
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
        if allowed in {1, 2, 3}:
            if len(keys) == 1:
                return None
            return RateAdmission(
                marker_key=keys[1], owner_token=owner_token, accepted_replay=allowed == 2
            )
        if allowed != 0:
            raise _dependency_unavailable()
        raise AppProblem(
            status=429,
            code="rate_limited",
            title="Rate limit reached",
            detail="Too many requests. Retry after the indicated delay.",
            retry_after=retry_after,
        )

    async def _consume_run_create(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        project_id: UUID,
        idempotency_key: str,
        idempotency_scope: str,
    ) -> RateAdmission:
        user_bucket = ":".join(
            [self._key_prefix, _RATE_KEY_SCHEMA, RUN_CREATE_USER.name, f"user:{user_id}"]
        )
        organization_bucket = ":".join(
            [
                self._key_prefix,
                _RATE_KEY_SCHEMA,
                RUN_CREATE_ORGANIZATION.name,
                "organization",
                str(organization_id),
            ]
        )
        digest_input = (
            f"{user_id}\0{organization_id}\0{project_id}\0{idempotency_scope}\0{idempotency_key}"
        ).encode()
        owner_token = uuid4().hex
        marker_key = ":".join(
            [
                self._key_prefix,
                _RATE_KEY_SCHEMA,
                "run_create",
                "idempotency",
                hashlib.sha256(digest_input).hexdigest(),
            ]
        )
        try:
            async with asyncio.timeout(REDIS_TIMEOUT_SECONDS):
                evaluation = self._client.eval(
                    _RUN_CREATE_TOKEN_BUCKET_LUA,
                    3,
                    user_bucket,
                    organization_bucket,
                    marker_key,
                    str(RUN_CREATE_USER.refill_per_second),
                    str(RUN_CREATE_USER.burst),
                    str(RUN_CREATE_USER.ttl_seconds),
                    str(RUN_CREATE_ORGANIZATION.refill_per_second),
                    str(RUN_CREATE_ORGANIZATION.burst),
                    str(RUN_CREATE_ORGANIZATION.ttl_seconds),
                    str(IDEMPOTENCY_PENDING_TTL_SECONDS),
                    owner_token,
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
        if allowed in {1, 2, 3}:
            return RateAdmission(
                marker_key=marker_key, owner_token=owner_token, accepted_replay=allowed == 2
            )
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
        key = ":".join([self._key_prefix, _RATE_KEY_SCHEMA, policy.name, subject])
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
