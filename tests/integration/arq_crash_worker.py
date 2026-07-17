"""Subprocess-only ARQ worker used to prove pessimistic crash recovery."""

from __future__ import annotations

import asyncio
from typing import Any, ClassVar

from simula_core.json_codec import canonical_json_dumps, canonical_json_loads

from tests.integration.redis_fixture import (
    TEST_QUEUE_NAME,
    redis_test_settings,
    redis_test_state_key,
)


async def crash_probe(context: dict[Any, Any], token: str) -> dict[str, Any]:
    redis = context["redis"]
    delivery = await redis.incr(redis_test_state_key("delivery", token))
    first_effect = await redis.set(redis_test_state_key("effect", token), "once", nx=True)
    if delivery == 1:
        await redis.set(redis_test_state_key("started", token), "1")
        await asyncio.Event().wait()
    return {"delivery": delivery, "first_effect": bool(first_effect), "token": token}


class WorkerSettings:
    functions: ClassVar[list[Any]] = [crash_probe]
    redis_settings = redis_test_settings()
    queue_name = TEST_QUEUE_NAME
    job_serializer = canonical_json_dumps
    job_deserializer = canonical_json_loads
    job_timeout = 0.5
    keep_result = 30
    max_jobs = 1
    poll_delay = 0.01
