from __future__ import annotations

from typing import cast

import pytest
from redis.asyncio import Redis
from simula_api.problems import AppProblem
from simula_api.run_admission import MAX_QUEUED_RUNS, RedisRunAdmission


class FakeRedis:
    def __init__(self, *, queued: int, used_memory: int, maxmemory: int) -> None:
        self._queued = queued
        self._memory = {"used_memory": used_memory, "maxmemory": maxmemory}

    async def zcard(self, _: str) -> int:
        return self._queued

    async def info(self, _: str) -> dict[str, int]:
        return self._memory


async def test_run_admission_allows_unbounded_local_memory_below_queue_limit() -> None:
    admission = RedisRunAdmission(
        cast(Redis, FakeRedis(queued=MAX_QUEUED_RUNS - 1, used_memory=1, maxmemory=0))
    )

    await admission.require_run_creation_capacity()


@pytest.mark.parametrize(
    ("queued", "used_memory", "maxmemory"),
    [
        (MAX_QUEUED_RUNS, 1, 0),
        (0, 80, 100),
    ],
)
async def test_run_admission_rejects_saturated_queue_or_memory(
    queued: int, used_memory: int, maxmemory: int
) -> None:
    admission = RedisRunAdmission(
        cast(Redis, FakeRedis(queued=queued, used_memory=used_memory, maxmemory=maxmemory))
    )

    with pytest.raises(AppProblem) as raised:
        await admission.require_run_creation_capacity()

    assert raised.value.status == 503
    assert raised.value.code == "queue_backpressure"
    assert raised.value.retry_after == 30
