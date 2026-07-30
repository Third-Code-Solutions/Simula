from __future__ import annotations

from time import time_ns
from typing import cast
from uuid import UUID

import pytest
from bullmq.custom_errors import WaitingChildrenError  # type: ignore[import-untyped]
from simula_core.bullmq_codec import BULLMQ_JOB_NAME, BULLMQ_QUEUE_NAME
from simula_core.simulation import DeterministicMockProvider
from simula_worker import bullmq_runtime
from simula_worker.bullmq_runtime import BullMqRunProcessor, PinnedBullMqRuntime
from simula_worker.database import ExecutionClaim
from simula_worker.main import BullMqWorkerExecutionGateway
from simula_worker.telemetry import WorkerTelemetry


class RecordingScripts:
    def __init__(self) -> None:
        self.calls: list[tuple[str, int, int, str]] = []

    async def moveToDelayed(
        self,
        job_id: str,
        timestamp: int,
        delay: int,
        token: str,
    ) -> None:
        self.calls.append((job_id, timestamp, delay, token))


class StubJob:
    def __init__(self, run_id: UUID, *, attempts_started: int = 1) -> None:
        self.id = f"run-{run_id}-generation-1"
        self.name = BULLMQ_JOB_NAME
        self.data = {
            "schema_version": 2,
            "run_id": str(run_id),
            "dispatch_generation": 1,
        }
        self.attemptsStarted = attempts_started
        self.scripts = RecordingScripts()


class StubDatabase:
    def __init__(self, status: str) -> None:
        self.status = status
        self.calls: list[tuple[UUID, int, str]] = []

    async def claim_execution_v2(
        self, run_id: UUID, generation: int, job_id: str
    ) -> ExecutionClaim:
        self.calls.append((run_id, generation, job_id))
        return ExecutionClaim(
            status=self.status,
            attempt_id=None,
            lease_token=None,
            frozen_manifest=None,
            frozen_manifest_sha256=None,
            deterministic_seed=None,
        )


async def test_bullmq_adapter_moves_database_deferral_before_suppressing_completion() -> None:
    run_id = UUID("00000000-0000-4000-8000-0000000000b3")
    database = StubDatabase("awaiting_confirmation")
    job = StubJob(run_id)
    processor = BullMqRunProcessor(
        database=database,  # type: ignore[arg-type]
        provider=DeterministicMockProvider(),
        telemetry=WorkerTelemetry(),
        release_sha="a" * 40,
        now_milliseconds=lambda: 1_785_303_135_000,
    )

    with pytest.raises(WaitingChildrenError):
        await processor(job, "lease-token")

    assert job.scripts.calls == [
        (
            f"run-{run_id}-generation-1",
            1_785_303_135_000,
            1_000,
            "lease-token",
        )
    ]


async def test_bullmq_adapter_completes_safe_no_work_without_delay() -> None:
    run_id = UUID("00000000-0000-4000-8000-0000000000b3")
    database = StubDatabase("no_work")
    job = StubJob(run_id)
    processor = BullMqRunProcessor(
        database=database,  # type: ignore[arg-type]
        provider=DeterministicMockProvider(),
        telemetry=WorkerTelemetry(),
        release_sha="a" * 40,
    )

    await processor(job, "lease-token")

    assert database.calls == [(run_id, 1, f"run-{run_id}-generation-1")]
    assert job.scripts.calls == []


async def test_pinned_bullmq_runtime_uses_the_exact_cross_language_queue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class FakeClient:
        async def ping(self) -> bool:
            return True

        async def info(self, section: str) -> dict[str, int]:
            assert section == "memory"
            return {"used_memory": 250, "maxmemory": 1_000}

    class FakeQueue:
        def __init__(self, name: str, options: dict[str, object]) -> None:
            captured["queue_name"] = name
            captured["queue_options"] = options
            self.client = FakeClient()

        async def getJobCounts(self, *_types: str) -> dict[str, int]:
            return {"wait": 1, "prioritized": 2, "delayed": 3}

        async def getJobs(
            self,
            _types: list[str],
            _start: int,
            _end: int,
            _ascending: bool,
        ) -> list[object]:
            return [type("Job", (), {"timestamp": time_ns() // 1_000_000})()]

        async def close(self) -> None:
            captured["queue_closed"] = True

    class FakeWorker:
        def __init__(
            self,
            name: str,
            processor: object,
            options: dict[str, object],
        ) -> None:
            captured["worker_name"] = name
            captured["processor"] = processor
            captured["worker_options"] = options

        async def run(self) -> None:
            return None

        async def close(self, *, force: bool) -> None:
            captured["worker_force"] = force

    class FakeBehavioralEngine:
        def execute(self, _command: object) -> object:
            raise AssertionError("no job is executed in this lifecycle test")

        def close(self) -> None:
            captured["behavioral_engine_closed"] = True

    monkeypatch.setattr(bullmq_runtime, "Queue", FakeQueue)
    monkeypatch.setattr(bullmq_runtime, "Worker", FakeWorker)
    runtime = PinnedBullMqRuntime(
        redis_url="redis://127.0.0.1:6379/13",
        database=cast(BullMqWorkerExecutionGateway, StubDatabase("no_work")),
        provider=DeterministicMockProvider(),
        behavioral_engine=FakeBehavioralEngine(),  # type: ignore[arg-type]
        telemetry=WorkerTelemetry(),
        release_sha="a" * 40,
    )

    assert captured["worker_name"] == BULLMQ_QUEUE_NAME
    assert captured["queue_name"] == BULLMQ_QUEUE_NAME
    assert captured["worker_options"] == {
        "autorun": False,
        "connection": "redis://127.0.0.1:6379/13",
        "concurrency": 4,
        "drainDelay": 0.25,
        "lockDuration": 30_000,
        "maxStalledCount": 1,
        "prefix": "simula:v2",
        "stalledInterval": 30_000,
    }
    snapshot = await runtime.snapshot()
    assert snapshot.depth == 6
    assert snapshot.oldest_ready_age_seconds >= 0
    assert snapshot.memory_percent == 25
    await runtime.close(force=True)
    assert captured["worker_force"] is True
    assert captured["queue_closed"] is True
    assert captured["behavioral_engine_closed"] is True
