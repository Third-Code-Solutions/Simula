"""Fail-closed Redis queue admission checks for new simulation runs."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Mapping
from typing import Any, cast

from redis.asyncio import Redis, from_url
from redis.exceptions import RedisError
from simula_core.arq_codec import ARQ_QUEUE_NAME

from simula_api.config import ApiSettings
from simula_api.problems import AppProblem
from simula_api.rate_limits import REDIS_TIMEOUT_SECONDS

MAX_QUEUED_RUNS = 100
MAX_MEMORY_FRACTION = 0.8
QUEUE_BACKPRESSURE_RETRY_AFTER_SECONDS = 30


def _dependency_unavailable() -> AppProblem:
    return AppProblem(
        status=503,
        code="dependency_unavailable",
        title="Queue unavailable",
        detail="The request could not reach its queue guard. Retry shortly.",
        retry_after=5,
    )


def _queue_backpressure() -> AppProblem:
    return AppProblem(
        status=503,
        code="queue_backpressure",
        title="Run queue is recovering",
        detail="Run creation is temporarily paused while queued work recovers.",
        retry_after=QUEUE_BACKPRESSURE_RETRY_AFTER_SECONDS,
    )


class RedisRunAdmission:
    """Read-only, bounded queue health checks before durable run creation."""

    def __init__(self, client: Redis) -> None:
        self._client = client

    @classmethod
    def from_settings(cls, settings: ApiSettings) -> RedisRunAdmission:
        return cls(
            from_url(  # type: ignore[no-untyped-call]
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=REDIS_TIMEOUT_SECONDS,
                socket_timeout=REDIS_TIMEOUT_SECONDS,
            )
        )

    async def open(self) -> None:
        try:
            async with asyncio.timeout(REDIS_TIMEOUT_SECONDS):
                if not await self._client.ping():
                    raise RedisError("Redis PING returned false")
        except (TimeoutError, RedisError) as error:
            raise _dependency_unavailable() from error

    async def close(self) -> None:
        await cast(Awaitable[None], self._client.aclose())

    async def require_run_creation_capacity(self) -> None:
        try:
            async with asyncio.timeout(REDIS_TIMEOUT_SECONDS):
                queued, memory = await asyncio.gather(
                    self._client.zcard(ARQ_QUEUE_NAME), self._client.info("memory")
                )
        except (TimeoutError, RedisError) as error:
            raise _dependency_unavailable() from error

        if int(queued) >= MAX_QUEUED_RUNS:
            raise _queue_backpressure()

        if not isinstance(memory, Mapping):
            raise _dependency_unavailable()
        used = _memory_value(memory, "used_memory")
        maximum = _memory_value(memory, "maxmemory")
        if maximum > 0 and used / maximum >= MAX_MEMORY_FRACTION:
            raise _queue_backpressure()


def _memory_value(memory: Mapping[Any, Any], key: str) -> int:
    value = memory.get(key)
    try:
        parsed = int(cast(str | int, value))
    except (TypeError, ValueError) as error:
        raise _dependency_unavailable() from error
    if parsed < 0:
        raise _dependency_unavailable()
    return parsed
