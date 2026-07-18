"""Exact ARQ/Redis runtime proof for the P2-01 foundation gate."""

from __future__ import annotations

import asyncio
import importlib.metadata
import platform
import signal
import subprocess
import sys
from contextlib import suppress
from pathlib import Path
from typing import Any, cast

import pytest
from arq import Retry, create_pool
from arq.connections import RedisSettings
from arq.constants import (
    abort_jobs_ss,
    health_check_key_suffix,
    in_progress_key_prefix,
    job_key_prefix,
    result_key_prefix,
    retry_key_prefix,
)
from arq.typing import WorkerCoroutine
from arq.worker import Worker
from simula_core.json_codec import canonical_json_dumps, canonical_json_loads

from tests.integration.arq_crash_worker import crash_probe
from tests.integration.redis_fixture import (
    CRASH_JOB_ID,
    CRASH_PROBE_ID,
    RETRY_JOB_ID,
    TEST_QUEUE_NAME,
    TEST_REDIS_URL,
    redis_test_settings,
    redis_test_state_key,
)

pytestmark = pytest.mark.integration


async def retry_once(context: dict[Any, Any], value: str) -> dict[str, Any]:
    if context["job_try"] == 1:
        raise Retry(defer=0.05)
    return {"attempt": context["job_try"], "value": value}


class ProbeWorker(Worker):
    def __init__(
        self,
        *functions: WorkerCoroutine,
        redis_pool: Any,
        burst: bool = True,
        on_shutdown: WorkerCoroutine | None = None,
    ) -> None:
        super().__init__(
            list(functions),
            burst=burst,
            handle_signals=True,
            job_deserializer=canonical_json_loads,
            job_serializer=canonical_json_dumps,
            max_jobs=1,
            on_shutdown=on_shutdown,
            poll_delay=0.01,
            queue_name=TEST_QUEUE_NAME,
            redis_pool=redis_pool,
        )

    async def close(self) -> None:
        """Close through the non-deprecated redis-py API used by the pinned client."""
        if not self._pool:
            return
        await asyncio.gather(*self.tasks.values())
        await self.pool.delete(self.health_check_key)
        if self.on_shutdown:
            await self.on_shutdown(self.ctx)
        await self.pool.aclose(close_connection_pool=True)
        self._pool = None


def _start_crash_worker() -> subprocess.Popen[bytes]:
    return subprocess.Popen(
        [
            sys.executable,
            "-m",
            "arq",
            "tests.integration.arq_crash_worker.WorkerSettings",
            "--no-burst",
        ],
        cwd=Path(__file__).resolve().parents[2],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def redis_settings() -> RedisSettings:
    return redis_test_settings()


async def clean_test_owned_state(
    pool: Any,
    *,
    job_ids: tuple[str, ...] = (),
    probe_ids: tuple[str, ...] = (),
) -> None:
    """Delete only exact keys reserved by this test suite; never flush a database."""
    keys = [TEST_QUEUE_NAME, TEST_QUEUE_NAME + health_check_key_suffix]
    for job_id in job_ids:
        keys.extend(
            (
                job_key_prefix + job_id,
                in_progress_key_prefix + job_id,
                result_key_prefix + job_id,
                retry_key_prefix + job_id,
            )
        )
    for probe_id in probe_ids:
        keys.extend(
            (
                redis_test_state_key("delivery", probe_id),
                redis_test_state_key("effect", probe_id),
                redis_test_state_key("started", probe_id),
            )
        )
    await pool.delete(*keys)
    if job_ids:
        await pool.zrem(abort_jobs_ss, *job_ids)


async def wait_for_redis(pool: Any) -> None:
    for _ in range(50):
        try:
            if await pool.ping():
                return
        except OSError:
            pass
        await asyncio.sleep(0.1)
    pytest.fail(f"Disposable Redis did not become ready at {TEST_REDIS_URL}")


async def wait_for_key(pool: Any, key: str, *, present: bool, deadline_seconds: float) -> None:
    async with asyncio.timeout(deadline_seconds):
        while bool(await pool.exists(key)) is not present:  # noqa: ASYNC110 - cross-process Redis state.
            await asyncio.sleep(0.05)


async def test_exact_arq_redis_startup_enqueue_retry_and_result() -> None:
    assert platform.python_version() == "3.14.6"
    assert importlib.metadata.version("arq") == "0.28.0"
    assert importlib.metadata.version("redis") == "5.3.1"

    pool = await create_pool(
        redis_settings(),
        default_queue_name=TEST_QUEUE_NAME,
        job_deserializer=canonical_json_loads,
        job_serializer=canonical_json_dumps,
    )
    try:
        await wait_for_redis(pool)
        server = await pool.info("server")
        assert server["redis_version"] == "8.2.7"
        await clean_test_owned_state(pool, job_ids=(RETRY_JOB_ID,))

        job = await pool.enqueue_job("retry_once", "safe", _job_id=RETRY_JOB_ID)
        assert job is not None
        await ProbeWorker(cast(WorkerCoroutine, retry_once), redis_pool=pool).async_run()

        assert await job.result(timeout=2, poll_delay=0.01) == {
            "attempt": 2,
            "value": "safe",
        }
    finally:
        await clean_test_owned_state(pool, job_ids=(RETRY_JOB_ID,))
        await pool.aclose()


async def test_hard_crash_redelivers_without_duplicate_durable_effect() -> None:
    pool = await create_pool(
        redis_settings(),
        default_queue_name=TEST_QUEUE_NAME,
        job_deserializer=canonical_json_loads,
        job_serializer=canonical_json_dumps,
    )
    process: subprocess.Popen[bytes] | None = None
    probe_id = CRASH_PROBE_ID
    job_id = CRASH_JOB_ID
    try:
        await wait_for_redis(pool)
        await clean_test_owned_state(pool, job_ids=(job_id,), probe_ids=(probe_id,))
        job = await pool.enqueue_job("crash_probe", probe_id, _job_id=job_id)
        assert job is not None

        process = await asyncio.to_thread(_start_crash_worker)
        await wait_for_key(
            pool,
            redis_test_state_key("started", probe_id),
            present=True,
            deadline_seconds=5,
        )
        process.kill()
        await asyncio.to_thread(process.communicate, timeout=5)

        await wait_for_key(
            pool,
            in_progress_key_prefix + job_id,
            present=False,
            deadline_seconds=12,
        )
        await ProbeWorker(cast(WorkerCoroutine, crash_probe), redis_pool=pool).async_run()

        assert await job.result(timeout=2, poll_delay=0.01) == {
            "delivery": 2,
            "first_effect": False,
            "token": probe_id,
        }
        assert await pool.get(redis_test_state_key("effect", probe_id)) == b"once"
        assert int(await pool.get(redis_test_state_key("delivery", probe_id))) == 2
    finally:
        if process is not None and process.poll() is None:
            process.kill()
            await asyncio.to_thread(process.communicate, timeout=5)
        await clean_test_owned_state(pool, job_ids=(job_id,), probe_ids=(probe_id,))
        await pool.aclose()


async def test_worker_runs_shutdown_hook_on_sigterm() -> None:
    pool = await create_pool(
        redis_settings(),
        default_queue_name=TEST_QUEUE_NAME,
        job_deserializer=canonical_json_loads,
        job_serializer=canonical_json_dumps,
    )
    shutdown_called = False

    async def on_shutdown(_: dict[Any, Any]) -> None:
        nonlocal shutdown_called
        shutdown_called = True

    worker = ProbeWorker(
        cast(WorkerCoroutine, retry_once),
        redis_pool=pool,
        burst=False,
        on_shutdown=cast(WorkerCoroutine, on_shutdown),
    )
    task = asyncio.create_task(worker.async_run())
    try:
        await wait_for_redis(pool)
        await asyncio.sleep(0.05)
        worker.handle_sig(signal.SIGTERM)
        with suppress(asyncio.CancelledError):
            await task
        await worker.close()
        assert shutdown_called is True
    finally:
        if not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
        await clean_test_owned_state(pool)
        await pool.aclose()
