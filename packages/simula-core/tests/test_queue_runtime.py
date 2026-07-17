from __future__ import annotations

import asyncio
from uuid import UUID

import pytest
from simula_core.arq_codec import ARQ_QUEUE_NAME, RunJobV1, arq_json_dumps, job_id_for
from simula_core.queue_runtime import (
    QueuePublishAmbiguousError,
    RunDispatchIntent,
    enqueue_run,
    inspect_queued_run,
)


class RecordingArqRedis:
    def __init__(self) -> None:
        self.calls: list[tuple[object, ...]] = []

    async def enqueue_job(self, function: str, *args: object, **kwargs: object) -> object:
        self.calls.append((function, args, kwargs))
        return object()


class TimeoutArqRedis:
    async def enqueue_job(self, function: str, *args: object, **kwargs: object) -> object:
        del function, args, kwargs
        raise TimeoutError


class InspectingArqRedis:
    def __init__(self, snapshot: object) -> None:
        self.snapshot = snapshot
        self.calls: list[tuple[object, ...]] = []

    async def eval(self, script: str, numkeys: int, *keys_and_args: object) -> object:
        self.calls.append((script, numkeys, keys_and_args))
        return self.snapshot


def test_run_dispatch_intent_is_bound_to_its_canonical_job_id() -> None:
    run_id = UUID("00000000-0000-4000-8000-0000000000a1")

    intent = RunDispatchIntent(run_id=run_id, generation=1, job_id=job_id_for(run_id, generation=1))

    assert intent.payload == RunJobV1.model_validate({"schema_version": 1, "run_id": str(run_id)})

    with pytest.raises(ValueError, match="job_id"):
        RunDispatchIntent(run_id=run_id, generation=1, job_id="run:forged:dispatch:1")


async def test_enqueue_run_uses_the_one_deferred_exact_arq_contract() -> None:
    run_id = UUID("00000000-0000-4000-8000-0000000000a2")
    intent = RunDispatchIntent(run_id=run_id, generation=2, job_id=job_id_for(run_id, generation=2))
    redis = RecordingArqRedis()

    await enqueue_run(redis, intent)

    assert redis.calls == [
        (
            "process_run_v1",
            ({"run_id": str(run_id), "schema_version": 1},),
            {
                "_defer_by": 1,
                "_expires": 3600,
                "_job_id": intent.job_id,
                "_queue_name": ARQ_QUEUE_NAME,
            },
        )
    ]


async def test_enqueue_timeout_is_ambiguous_and_never_claimed_as_success() -> None:
    run_id = UUID("00000000-0000-4000-8000-0000000000a3")
    intent = RunDispatchIntent(run_id=run_id, generation=3, job_id=job_id_for(run_id, generation=3))

    with pytest.raises(QueuePublishAmbiguousError):
        await enqueue_run(TimeoutArqRedis(), intent)


async def test_enqueue_cancellation_propagates_without_a_false_confirmation() -> None:
    class BlockingArqRedis:
        async def enqueue_job(self, function: str, *args: object, **kwargs: object) -> object:
            del function, args, kwargs
            await asyncio.Event().wait()
            raise AssertionError("unreachable")

    run_id = UUID("00000000-0000-4000-8000-0000000000a4")
    intent = RunDispatchIntent(run_id=run_id, generation=1, job_id=job_id_for(run_id, generation=1))

    with pytest.raises(QueuePublishAmbiguousError):
        await enqueue_run(BlockingArqRedis(), intent, timeout_seconds=0.001)


async def test_atomic_queue_snapshot_requires_exact_target_and_payload() -> None:
    run_id = UUID("00000000-0000-4000-8000-0000000000a5")
    intent = RunDispatchIntent(run_id=run_id, generation=1, job_id=job_id_for(run_id, generation=1))
    payload = arq_json_dumps(
        {
            "t": None,
            "f": "process_run_v1",
            "a": ({"schema_version": 1, "run_id": str(run_id)},),
            "k": {},
            "et": 1,
        }
    )
    redis = InspectingArqRedis([payload, b"1"])

    assert await inspect_queued_run(redis, intent)
    assert redis.calls[0][1:] == (
        2,
        (f"arq:job:{intent.job_id}", ARQ_QUEUE_NAME, intent.job_id),
    )


@pytest.mark.parametrize(
    "snapshot",
    [
        [None, b"1"],
        [b"not-json", b"1"],
        [
            arq_json_dumps(
                {
                    "t": None,
                    "f": "process_run_v1",
                    "a": ({"schema_version": 1, "run_id": "00000000-0000-4000-8000-0000000000a6"},),
                    "k": {},
                    "et": 1,
                }
            ),
            b"1",
        ],
        [
            arq_json_dumps(
                {
                    "t": None,
                    "f": "process_run_v1",
                    "a": ({"schema_version": 1, "run_id": "00000000-0000-4000-8000-0000000000a5"},),
                    "k": {},
                    "et": 1,
                }
            ),
            None,
        ],
    ],
)
async def test_ambiguous_queue_snapshot_never_proves_dispatch(snapshot: object) -> None:
    run_id = UUID("00000000-0000-4000-8000-0000000000a5")
    intent = RunDispatchIntent(run_id=run_id, generation=1, job_id=job_id_for(run_id, generation=1))

    assert not await inspect_queued_run(InspectingArqRedis(snapshot), intent)
