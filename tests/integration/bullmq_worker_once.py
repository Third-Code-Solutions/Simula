"""Run the production BullMQ worker composition until one exact job settles.

This helper exists for the explicit NestJS/PostgreSQL/Redis/Python database
integration.  It does not create fixtures or mutate state outside the worker's
least-privilege database and BullMQ capabilities.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import socket
import sys
import warnings
from typing import Any, cast
from uuid import UUID

import uvicorn
from bullmq import Job, Queue  # type: ignore[import-untyped]
from simula_ai_engine.app import EngineServices, create_app
from simula_ai_engine.config import EngineSettings
from simula_ai_engine.registry import BehavioralProviderRegistry
from simula_core.bullmq_codec import BULLMQ_QUEUE_NAME
from simula_core.simulation import (
    DeterministicMockProvider,
    ProviderRequest,
    ProviderResponse,
)
from simula_worker.behavioral_engine_client import BehavioralEngineHttpClient
from simula_worker.bullmq_runtime import PinnedBullMqRuntime, require_worker_gateway
from simula_worker.config import WorkerSettings
from simula_worker.database import ExecutionClaim, WorkerDatabase
from simula_worker.telemetry import WorkerTelemetry

_PREFIX = "simula:v2"
_RESULT_PREFIX = "SIMULA_BULLMQ_RESULT="
_CRASH_MODE = "crash_after_claim"
_PAUSE_PROVIDER_MODE = "pause_in_provider"
_BEHAVIORAL_MODE = "behavioral"
_STALLED_MODE = "settle_stalled"
_BATCH_MODE = "settle_batch"
_ENGINE_TOKEN = "t" * 32
_JOB_ID = re.compile(
    r"^run-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-"
    r"[0-9a-f]{12}-generation-[1-3]$"
)


class _PausingDeterministicProvider(DeterministicMockProvider):
    def __init__(self, job_id: str) -> None:
        self._job_id = job_id

    def run(self, request: ProviderRequest) -> ProviderResponse:
        print(
            "SIMULA_BULLMQ_PROVIDER_STARTED="
            + json.dumps(
                {"job_id": self._job_id},
                sort_keys=True,
                separators=(",", ":"),
            ),
            flush=True,
        )
        if sys.stdin.readline().strip() != "continue":
            raise RuntimeError("running-cancellation integration gate was not released")
        return super().run(request)


class _ObservedWorkerDatabase(WorkerDatabase):
    def __init__(self, settings: WorkerSettings) -> None:
        super().__init__(settings)
        self.claimed_job_ids: list[str] = []

    async def claim_execution_v2(
        self, run_id: UUID, generation: int, job_id: str
    ) -> ExecutionClaim:
        claim = await super().claim_execution_v2(run_id, generation, job_id)
        if claim.status == "claimed":
            self.claimed_job_ids.append(job_id)
        print(
            "SIMULA_BULLMQ_CLAIM="
            + json.dumps(
                {"job_id": job_id, "status": claim.status},
                sort_keys=True,
                separators=(",", ":"),
            ),
            flush=True,
        )
        if (
            os.getenv("SIMULA_TEST_BULLMQ_WORKER_MODE", "settle") == _CRASH_MODE
            and claim.status == "claimed"
        ):
            print(
                "SIMULA_BULLMQ_CRASH="
                + json.dumps(
                    {"job_id": job_id, "status": claim.status},
                    sort_keys=True,
                    separators=(",", ":"),
                ),
                flush=True,
            )
            os._exit(97)
        return claim


async def _settled_job(queue: Queue, job_id: str, *, timeout_seconds: int) -> dict[str, object]:
    async with asyncio.timeout(timeout_seconds):
        while True:
            stored = await Job.fromId(queue, job_id)
            if stored is not None:
                state = await stored.getState()
                if state == "failed":
                    raise RuntimeError(f"BullMQ worker job failed: {job_id}: {stored.failedReason}")
                if state == "completed":
                    return {
                        "attempts_started": stored.attemptsStarted,
                        "job_id": job_id,
                        "state": state,
                    }
            await asyncio.sleep(0.05)


def _batch_job_ids() -> tuple[str, ...]:
    try:
        raw = json.loads(os.environ["SIMULA_TEST_BULLMQ_JOB_IDS"])
    except (KeyError, json.JSONDecodeError) as error:
        raise RuntimeError("BullMQ batch job identities are malformed") from error
    if (
        not isinstance(raw, list)
        or not 1 <= len(raw) <= 100
        or any(not isinstance(job_id, str) or _JOB_ID.fullmatch(job_id) is None for job_id in raw)
        or len(set(raw)) != len(raw)
    ):
        raise RuntimeError("BullMQ batch job identities are malformed")
    return tuple(raw)


async def _settled_jobs(
    queue: Queue,
    job_ids: tuple[str, ...],
    *,
    timeout_seconds: int,
) -> dict[str, object]:
    attempts_started: dict[str, int] = {}
    remaining = set(job_ids)
    async with asyncio.timeout(timeout_seconds):
        while remaining:
            for job_id in tuple(remaining):
                stored = await Job.fromId(queue, job_id)
                if stored is None:
                    continue
                state = await stored.getState()
                if state == "failed":
                    raise RuntimeError(f"BullMQ worker job failed: {job_id}: {stored.failedReason}")
                if state == "completed":
                    attempts_started[job_id] = stored.attemptsStarted
                    remaining.remove(job_id)
            if remaining:
                await asyncio.sleep(0.05)
    return {
        "attempts_started": attempts_started,
        "job_ids": sorted(job_ids),
        "state": "completed",
    }


async def _start_behavioral_engine() -> tuple[
    uvicorn.Server,
    asyncio.Task[None],
    socket.socket,
    BehavioralEngineHttpClient,
]:
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    port = cast(tuple[str, int], listener.getsockname())[1]
    server = uvicorn.Server(
        uvicorn.Config(
            create_app(
                services=EngineServices(
                    settings=EngineSettings(
                        environment="test",
                        release_sha="a" * 40,
                        internal_tokens=(_ENGINE_TOKEN,),
                        port=port,
                    ),
                    registry=BehavioralProviderRegistry.experimental_deterministic_only(),
                )
            ),
            access_log=False,
            lifespan="on",
            log_config=None,
            loop="asyncio",
        )
    )
    task = asyncio.create_task(
        server.serve(sockets=[listener]),
        name="bullmq-behavioral-engine-integration-server",
    )
    for _ in range(100):
        if server.started:
            break
        if task.done():
            await task
        await asyncio.sleep(0.01)
    if not server.started:
        server.should_exit = True
        await asyncio.gather(task, return_exceptions=True)
        listener.close()
        raise RuntimeError("private behavioral engine did not start")
    return (
        server,
        task,
        listener,
        BehavioralEngineHttpClient(
            base_url=f"http://127.0.0.1:{port}",
            token=_ENGINE_TOKEN,
        ),
    )


async def _run() -> dict[str, object]:
    settings = WorkerSettings.from_environment()
    mode = os.getenv("SIMULA_TEST_BULLMQ_WORKER_MODE", "settle")
    batch_job_ids = _batch_job_ids() if mode == _BATCH_MODE else None
    job_id = (
        batch_job_ids[0] if batch_job_ids is not None else os.environ["SIMULA_TEST_BULLMQ_JOB_ID"]
    )
    replica_id = os.getenv("SIMULA_TEST_BULLMQ_REPLICA_ID", "")
    if mode == _BATCH_MODE and (
        not 1 <= len(replica_id) <= 64 or re.fullmatch(r"[a-z0-9-]+", replica_id) is None
    ):
        raise RuntimeError("BullMQ batch replica identity is malformed")
    database = _ObservedWorkerDatabase(settings)
    telemetry = WorkerTelemetry()
    behavioral_server: uvicorn.Server | None = None
    behavioral_server_task: asyncio.Task[None] | None = None
    behavioral_listener: socket.socket | None = None
    behavioral_engine: BehavioralEngineHttpClient | None = None
    if mode == _BEHAVIORAL_MODE:
        (
            behavioral_server,
            behavioral_server_task,
            behavioral_listener,
            behavioral_engine,
        ) = await _start_behavioral_engine()
    runtime = PinnedBullMqRuntime(
        redis_url=settings.redis_url,
        database=require_worker_gateway(database),
        provider=(
            _PausingDeterministicProvider(job_id)
            if mode == _PAUSE_PROVIDER_MODE
            else DeterministicMockProvider()
        ),
        behavioral_engine=behavioral_engine,
        telemetry=telemetry,
        release_sha=settings.release_sha,
    )
    queue = Queue(
        BULLMQ_QUEUE_NAME,
        {"connection": settings.redis_url, "prefix": _PREFIX},
    )
    worker_task: asyncio.Task[None] | None = None
    try:
        await database.open()
        if mode == _BATCH_MODE:
            print(
                "SIMULA_BULLMQ_BATCH_READY="
                + json.dumps(
                    {"replica_id": replica_id},
                    sort_keys=True,
                    separators=(",", ":"),
                ),
                flush=True,
            )
            if (await asyncio.to_thread(sys.stdin.readline)).strip() != "start":
                raise RuntimeError("BullMQ batch worker start was not authorized")
        worker_task = asyncio.create_task(runtime.run())
        if batch_job_ids is not None:
            result = await _settled_jobs(queue, batch_job_ids, timeout_seconds=30)
            result["claimed_job_ids"] = sorted(database.claimed_job_ids)
            result["replica_id"] = replica_id
        else:
            result = await _settled_job(
                queue,
                job_id,
                timeout_seconds=75 if mode == _STALLED_MODE else 15,
            )
        return result
    finally:
        try:
            await runtime.close(force=True)
            if worker_task is not None:
                await asyncio.gather(worker_task, return_exceptions=True)
            await database.close()
            with warnings.catch_warnings():
                warnings.filterwarnings(
                    "ignore",
                    message=r"Call to deprecated close\. \(Use aclose\(\) instead\).*",
                    category=DeprecationWarning,
                    module=r"bullmq\..*",
                )
                await queue.close()
        finally:
            if behavioral_server is not None:
                behavioral_server.should_exit = True
            if behavioral_server_task is not None:
                await asyncio.wait_for(behavioral_server_task, timeout=5)
            if behavioral_listener is not None:
                behavioral_listener.close()


def main() -> None:
    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
        result = runner.run(_run())
    print(
        _RESULT_PREFIX
        + json.dumps(cast(dict[str, Any], result), sort_keys=True, separators=(",", ":")),
        flush=True,
    )


if __name__ == "__main__":
    main()
