"""Pinned BullMQ-Python adapter for strict v2 delivery and bounded deferral."""

from __future__ import annotations

import warnings
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from time import time_ns
from typing import Protocol

from bullmq import Queue, Worker  # type: ignore[import-untyped]
from bullmq.custom_errors import WaitingChildrenError  # type: ignore[import-untyped]
from simula_core.bullmq_codec import BULLMQ_QUEUE_NAME
from simula_core.simulation import SimulationProvider

from simula_worker.database import WorkerExecutionGateway
from simula_worker.main import (
    BehavioralEngineExecutor,
    BullMqDeliveryRetry,
    BullMqWorkerExecutionGateway,
    process_run_v2,
)
from simula_worker.telemetry import WorkerTelemetry

_BULLMQ_PREFIX = "simula:v2"


class BullMqScriptsPort(Protocol):
    async def moveToDelayed(
        self,
        job_id: str,
        timestamp: int,
        delay: int,
        token: str,
    ) -> None: ...


class BullMqJobPort(Protocol):
    @property
    def id(self) -> str | None: ...

    @property
    def name(self) -> str: ...

    @property
    def data(self) -> object: ...

    @property
    def attemptsStarted(self) -> int: ...

    @property
    def scripts(self) -> BullMqScriptsPort: ...


class BullMqRunProcessor:
    """Adapts the pinned BullMQ callback without giving Redis business authority."""

    def __init__(
        self,
        *,
        database: BullMqWorkerExecutionGateway,
        provider: SimulationProvider,
        behavioral_engine: BehavioralEngineExecutor | None = None,
        telemetry: WorkerTelemetry,
        release_sha: str,
        now_milliseconds: Callable[[], int] = lambda: time_ns() // 1_000_000,
    ) -> None:
        self._database = database
        self._provider = provider
        self._behavioral_engine = behavioral_engine
        self._telemetry = telemetry
        self._release_sha = release_sha
        self._now_milliseconds = now_milliseconds

    async def __call__(self, job: BullMqJobPort, token: str) -> None:
        context: Mapping[str, object] = {
            "attempts_started": job.attemptsStarted,
            "job_id": job.id,
            "job_name": job.name,
            "queue_name": BULLMQ_QUEUE_NAME,
            "release_sha": self._release_sha,
        }
        try:
            await process_run_v2(
                context,
                job.data,
                database=self._database,
                provider=self._provider,
                behavioral_engine=self._behavioral_engine,
                telemetry=self._telemetry,
            )
        except BullMqDeliveryRetry as retry:
            if not isinstance(job.id, str):
                raise RuntimeError("BullMQ job identity disappeared before deferral") from None
            delay_milliseconds = retry.delay_seconds * 1_000
            await job.scripts.moveToDelayed(
                job.id,
                self._now_milliseconds(),
                delay_milliseconds,
                token,
            )
            # BullMQ-Python 2.14.0 treats this sentinel as "already moved" and
            # does not issue a conflicting completion/failure transition.
            raise WaitingChildrenError from None


def require_worker_gateway(database: WorkerExecutionGateway) -> BullMqWorkerExecutionGateway:
    """Narrow the concrete worker database only at the composition boundary."""

    if not hasattr(database, "claim_execution_v2"):
        raise RuntimeError("worker database lacks the BullMQ v2 claim capability")
    return database  # type: ignore[return-value]


@dataclass(frozen=True, slots=True)
class BullMqQueueSnapshot:
    depth: int
    oldest_ready_age_seconds: float
    memory_percent: float


def _memory_percent(raw_memory: object) -> float:
    if not isinstance(raw_memory, Mapping):
        raise ValueError("BullMQ Redis memory snapshot is malformed")
    used_memory = raw_memory.get("used_memory")
    max_memory = raw_memory.get("maxmemory")
    if (
        not isinstance(used_memory, int)
        or isinstance(used_memory, bool)
        or used_memory < 0
        or not isinstance(max_memory, int)
        or isinstance(max_memory, bool)
        or max_memory < 0
    ):
        raise ValueError("BullMQ Redis memory snapshot is malformed")
    if max_memory == 0:
        return 0.0
    return min(100.0, used_memory * 100.0 / max_memory)


class PinnedBullMqRuntime:
    """BullMQ-Python 2.14.0 runtime isolated behind conformance-tested calls."""

    def __init__(
        self,
        *,
        redis_url: str,
        database: BullMqWorkerExecutionGateway,
        provider: SimulationProvider,
        behavioral_engine: BehavioralEngineExecutor | None = None,
        telemetry: WorkerTelemetry,
        release_sha: str,
    ) -> None:
        processor = BullMqRunProcessor(
            database=database,
            provider=provider,
            behavioral_engine=behavioral_engine,
            telemetry=telemetry,
            release_sha=release_sha,
        )
        options = {
            "autorun": False,
            "connection": redis_url,
            "concurrency": 4,
            "drainDelay": 0.25,
            "lockDuration": 30_000,
            "maxStalledCount": 1,
            "prefix": _BULLMQ_PREFIX,
            "stalledInterval": 30_000,
        }
        self._worker = Worker(BULLMQ_QUEUE_NAME, processor, options)
        self._queue = Queue(
            BULLMQ_QUEUE_NAME,
            {"connection": redis_url, "prefix": _BULLMQ_PREFIX},
        )
        self._behavioral_engine = behavioral_engine

    async def run(self) -> None:
        await self._worker.run()

    async def ping(self) -> bool:
        return bool(await self._queue.client.ping())

    async def snapshot(self) -> BullMqQueueSnapshot:
        counts = await self._queue.getJobCounts("wait", "prioritized", "delayed")
        depth = 0
        for name in ("wait", "prioritized", "delayed"):
            value = counts.get(name)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                raise ValueError("BullMQ queue depth is malformed")
            depth += value
        jobs = (
            await self._queue.getJobs(
                ["wait", "prioritized", "delayed"],
                0,
                99,
                False,
            )
            if depth > 0
            else []
        )
        timestamps = [
            job.timestamp
            for job in jobs
            if isinstance(job.timestamp, int)
            and not isinstance(job.timestamp, bool)
            and job.timestamp >= 0
        ]
        if len(timestamps) != len(jobs):
            raise ValueError("BullMQ job timestamp is malformed")
        now_milliseconds = time_ns() // 1_000_000
        oldest_ready_age_seconds = (
            max(0.0, (now_milliseconds - min(timestamps)) / 1_000) if timestamps else 0.0
        )
        memory = await self._queue.client.info("memory")
        return BullMqQueueSnapshot(
            depth=depth,
            oldest_ready_age_seconds=oldest_ready_age_seconds,
            memory_percent=_memory_percent(memory),
        )

    async def close(self, *, force: bool) -> None:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message=r"Call to deprecated close\. \(Use aclose\(\) instead\).*",
                category=DeprecationWarning,
                module=r"bullmq\..*",
            )
            await self._worker.close(force=force)
            await self._queue.close()
        if self._behavioral_engine is not None:
            self._behavioral_engine.close()
