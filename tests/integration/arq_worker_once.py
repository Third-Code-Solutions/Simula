"""Run the production ARQ dispatcher and worker until one exact run settles."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any, cast
from uuid import UUID

from simula_core.arq_codec import job_id_for
from simula_core.queue_runtime import create_queue_client
from simula_worker.config import WorkerSettings
from simula_worker.database import WorkerDatabase
from simula_worker.dispatcher import RedisDispatchClient, RedisRunQueue, RunDispatcher
from simula_worker.main import _close_arq_worker, _create_arq_worker
from simula_worker.telemetry import WorkerTelemetry

_RESULT_PREFIX = "SIMULA_ARQ_RESULT="


async def _run() -> dict[str, object]:
    settings = WorkerSettings.from_environment()
    if settings.queue_transport != "arq":
        raise RuntimeError("one-shot ARQ worker requires the ARQ transport")
    raw_run_id = os.environ["SIMULA_TEST_ARQ_RUN_ID"]
    run_id = UUID(raw_run_id)
    if str(run_id) != raw_run_id:
        raise RuntimeError("one-shot ARQ run id is not canonical")
    job_id = job_id_for(run_id, generation=1)

    telemetry = WorkerTelemetry()
    database = WorkerDatabase(settings, telemetry=telemetry)
    dispatcher_redis = create_queue_client(settings.redis_url, max_connections=2)
    worker_redis = create_queue_client(settings.redis_url, max_connections=2)
    worker = None
    database_open = False
    try:
        await database.open()
        database_open = True
        dispatch = await RunDispatcher(
            database,
            RedisRunQueue(cast(RedisDispatchClient, dispatcher_redis)),
            telemetry=telemetry,
        ).dispatch_once(batch_size=1)
        if dispatch.claimed != 1 or dispatch.confirmed != 1:
            raise RuntimeError("one-shot ARQ dispatcher did not confirm one exact run")

        # Production dispatch defers fresh jobs by one second. Wait until that
        # same durable intent is eligible, then use the production worker
        # composition in bounded burst mode.
        await asyncio.sleep(1.25)
        worker = _create_arq_worker(worker_redis, database, telemetry)
        worker.burst = True
        worker.max_burst_jobs = 1
        await worker.async_run()
        if worker.jobs_complete != 1 or worker.jobs_failed != 0 or worker.jobs_retried != 0:
            raise RuntimeError("one-shot ARQ worker did not complete one exact run")
        return {
            "claimed": dispatch.claimed,
            "confirmed": dispatch.confirmed,
            "job_id": job_id,
            "run_id": str(run_id),
            "state": "completed",
        }
    finally:
        if worker is None:
            await worker_redis.aclose(close_connection_pool=True)
        else:
            await _close_arq_worker(worker, worker_redis)
        await dispatcher_redis.aclose(close_connection_pool=True)
        if database_open:
            await database.close()


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
