"""Single strict ARQ transport adapter for durable SIMULA run dispatches."""

from __future__ import annotations

import asyncio
from typing import Protocol
from uuid import UUID

from arq.connections import ArqRedis
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from redis.asyncio import ConnectionPool
from redis.exceptions import RedisError

from simula_core.arq_codec import (
    ARQ_QUEUE_NAME,
    ArqCodecError,
    RunJobV1,
    arq_json_dumps,
    arq_json_loads,
    job_id_for,
)

QUEUE_COMMAND_TIMEOUT_SECONDS = 1.0
QUEUE_JOB_DEFER_SECONDS = 1
QUEUE_JOB_EXPIRY_SECONDS = 60 * 60
_QUEUE_SNAPSHOT_SCRIPT = """
local payload = redis.call('GET', KEYS[1])
if not payload then
  return {false, false}
end
local score = redis.call('ZSCORE', KEYS[2], ARGV[1])
if not score then
  return {payload, false}
end
return {payload, score}
"""


class QueuePublishAmbiguousError(RuntimeError):
    """Redis did not provide an unambiguous enqueue result; leave outbox pending."""


class ArqEnqueuer(Protocol):
    """Narrow producer capability; it intentionally cannot confirm database intent."""

    async def enqueue_job(
        self, function: str, *args: object, **kwargs: object
    ) -> object | None: ...


class ArqInspector(Protocol):
    """Narrow Redis inspection capability used before dispatcher confirmation."""

    async def eval(self, script: str, numkeys: int, *keys_and_args: object) -> object: ...


class RunDispatchIntent(BaseModel):
    """Minimal durable-to-transport binding: no tenant/content data enters Redis."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    run_id: UUID
    generation: int
    job_id: str

    @field_validator("generation", mode="before")
    @classmethod
    def valid_generation(cls, value: object) -> int:
        if isinstance(value, bool) or not isinstance(value, int) or value not in {1, 2, 3}:
            raise ValueError("generation must be an integer from 1 through 3")
        return value

    @model_validator(mode="after")
    def binds_canonical_job_id(self) -> RunDispatchIntent:
        if self.job_id != job_id_for(self.run_id, generation=self.generation):
            raise ValueError("job_id must canonically bind run_id and generation")
        return self

    @property
    def payload(self) -> RunJobV1:
        return RunJobV1.model_validate({"schema_version": 1, "run_id": str(self.run_id)})


def create_queue_client(redis_url: str, *, max_connections: int) -> ArqRedis:
    """Create the sole binary ARQ client with distinct bounded socket timeouts."""

    if isinstance(max_connections, bool) or max_connections not in range(1, 33):
        raise ValueError("max_connections must be an integer from 1 through 32")
    pool = ConnectionPool.from_url(
        redis_url,
        decode_responses=False,
        encoding="utf-8",
        max_connections=max_connections,
        retry_on_timeout=False,
        socket_connect_timeout=QUEUE_COMMAND_TIMEOUT_SECONDS,
        socket_timeout=QUEUE_COMMAND_TIMEOUT_SECONDS,
    )
    return ArqRedis(
        pool_or_conn=pool,
        job_serializer=arq_json_dumps,
        job_deserializer=arq_json_loads,
        default_queue_name=ARQ_QUEUE_NAME,
    )


async def enqueue_run(
    redis: ArqEnqueuer,
    intent: RunDispatchIntent,
    *,
    timeout_seconds: float = QUEUE_COMMAND_TIMEOUT_SECONDS,
) -> object | None:
    """Best-effort enqueue only; callers must never treat this as DB confirmation."""

    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be positive")
    try:
        async with asyncio.timeout(timeout_seconds):
            return await redis.enqueue_job(
                "process_run_v1",
                intent.payload.model_dump(mode="json"),
                _job_id=intent.job_id,
                _queue_name=ARQ_QUEUE_NAME,
                _defer_by=QUEUE_JOB_DEFER_SECONDS,
                _expires=QUEUE_JOB_EXPIRY_SECONDS,
            )
    except (RedisError, TimeoutError) as error:
        raise QueuePublishAmbiguousError("run enqueue outcome is ambiguous") from error


async def inspect_queued_run(redis: ArqInspector, intent: RunDispatchIntent) -> bool:
    """Prove an exact canonical job key is present in the sole target queue snapshot."""

    try:
        async with asyncio.timeout(QUEUE_COMMAND_TIMEOUT_SECONDS):
            snapshot = await redis.eval(
                _QUEUE_SNAPSHOT_SCRIPT,
                2,
                f"arq:job:{intent.job_id}",
                ARQ_QUEUE_NAME,
                intent.job_id,
            )
    except RedisError, TimeoutError:
        return False
    if not isinstance(snapshot, (list, tuple)) or len(snapshot) != 2:
        return False
    raw_job, target_score = snapshot
    if not isinstance(raw_job, bytes) or target_score is None or target_score is False:
        return False
    try:
        decoded = arq_json_loads(raw_job)
    except ArqCodecError:
        return False
    return (
        decoded["f"] == "process_run_v1"
        and decoded["k"] == {}
        and decoded["a"] == [intent.payload.model_dump(mode="json")]
    )
