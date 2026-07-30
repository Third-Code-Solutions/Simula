from __future__ import annotations

import asyncio
import warnings
from typing import Any, cast
from uuid import UUID

import pytest
from bullmq import Job, Queue  # type: ignore[import-untyped]
from simula_core.bullmq_codec import BULLMQ_JOB_NAME, BULLMQ_QUEUE_NAME
from simula_core.simulation import DeterministicMockProvider
from simula_worker.bullmq_runtime import PinnedBullMqRuntime
from simula_worker.database import ExecutionClaim
from simula_worker.main import BullMqWorkerExecutionGateway
from simula_worker.telemetry import WorkerTelemetry

pytestmark = pytest.mark.integration

REDIS_URL = "redis://127.0.0.1:6379/13"
TEST_PREFIX = "simula:v2"


class SequencedDatabase:
    def __init__(self) -> None:
        self.calls: list[tuple[UUID, int, str]] = []

    async def claim_execution_v2(
        self, run_id: UUID, generation: int, job_id: str
    ) -> ExecutionClaim:
        self.calls.append((run_id, generation, job_id))
        return ExecutionClaim(
            status="awaiting_confirmation" if len(self.calls) == 1 else "no_work",
            attempt_id=None,
            lease_token=None,
            frozen_manifest=None,
            frozen_manifest_sha256=None,
            deterministic_seed=None,
        )


async def test_python_bullmq_worker_redelivers_a_database_deferred_job() -> None:
    run_id = UUID("00000000-0000-4000-8000-0000000000b3")
    job_id = f"run-{run_id}-generation-1"
    database = SequencedDatabase()
    queue = Queue(
        BULLMQ_QUEUE_NAME,
        {"connection": REDIS_URL, "prefix": TEST_PREFIX},
    )
    runtime = PinnedBullMqRuntime(
        redis_url=REDIS_URL,
        database=cast(BullMqWorkerExecutionGateway, database),
        provider=DeterministicMockProvider(),
        telemetry=WorkerTelemetry(),
        release_sha="a" * 40,
    )
    worker_task: asyncio.Task[None] | None = None
    try:
        await queue.obliterate(force=cast(Any, 1))
        await queue.add(
            BULLMQ_JOB_NAME,
            {
                "dispatch_generation": 1,
                "run_id": str(run_id),
                "schema_version": 2,
            },
            {
                "attempts": 1,
                "jobId": job_id,
                "removeOnComplete": False,
                "removeOnFail": False,
            },
        )
        worker_task = asyncio.create_task(runtime.run())

        async def completed() -> None:
            while True:
                stored = await Job.fromId(queue, job_id)
                if stored is not None and await stored.getState() == "completed":
                    return
                await asyncio.sleep(0.05)

        await asyncio.wait_for(completed(), timeout=5)

        assert database.calls == [(run_id, 1, job_id), (run_id, 1, job_id)]
        stored = await Job.fromId(queue, job_id)
        assert stored is not None
        assert await stored.getState() == "completed"
        assert stored.attemptsStarted == 2
        snapshot = await runtime.snapshot()
        assert snapshot.depth == 0
        assert snapshot.memory_percent >= 0
    finally:
        await runtime.close(force=True)
        if worker_task is not None:
            await asyncio.gather(worker_task, return_exceptions=True)
        await queue.obliterate(force=cast(Any, 1))
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message=r"Call to deprecated close\. \(Use aclose\(\) instead\).*",
                category=DeprecationWarning,
                module=r"bullmq\..*",
            )
            await queue.close()
