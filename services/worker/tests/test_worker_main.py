from __future__ import annotations

import asyncio
import json
import sys
from collections.abc import Callable, Coroutine
from types import TracebackType
from typing import Any, cast

import pytest
from arq.connections import ArqRedis
from redis.exceptions import TimeoutError as RedisTimeoutError
from simula_worker import __main__
from simula_worker import main as worker_main
from simula_worker.config import WorkerSettings
from simula_worker.database import WorkerDatabase
from simula_worker.telemetry import WorkerMetricsServer, WorkerTelemetry


def test_windows_worker_uses_a_selector_runner_for_psycopg(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loop_factories: list[Callable[[], asyncio.AbstractEventLoop]] = []

    class FakeRunner:
        def __init__(self, *, loop_factory: Callable[[], asyncio.AbstractEventLoop]) -> None:
            loop_factories.append(loop_factory)

        def __enter__(self) -> FakeRunner:
            return self

        def __exit__(
            self,
            exception_type: type[BaseException] | None,
            exception: BaseException | None,
            traceback: TracebackType | None,
        ) -> None:
            return None

        def run(self, coroutine: Coroutine[Any, Any, Any]) -> None:
            coroutine.close()

    monkeypatch.setattr("simula_worker.__main__.asyncio.Runner", FakeRunner)

    __main__._serve_windows()

    assert loop_factories == [asyncio.SelectorEventLoop]


def test_no_egress_probe_rejects_any_non_loopback_interface() -> None:
    with pytest.raises(RuntimeError, match="isolated network namespace"):
        __main__._assert_no_egress_interfaces(((1, "lo"), (2, "eth0")))


def test_no_egress_probe_runs_the_fixed_deterministic_provider(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr("simula_worker.__main__.socket.if_nameindex", lambda: [(1, "lo")])

    __main__._verify_no_egress()

    assert json.loads(capsys.readouterr().out) == {
        "network_interfaces": ["lo"],
        "provider_id": "deterministic_mock",
        "status": "no_egress_ok",
    }


async def test_worker_health_probe_calls_the_running_process() -> None:
    server = WorkerMetricsServer(WorkerTelemetry(), port=0)
    await server.start()
    try:
        await asyncio.to_thread(__main__._verify_live_worker, port=server.port)
    finally:
        await server.close()


def test_worker_health_check_mode_uses_the_configured_port(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    checked_ports: list[int] = []
    settings = WorkerSettings(
        environment="test",
        release_sha="a" * 40,
        database_url="postgresql://simula_worker:test@127.0.0.1:54322/postgres",
        redis_url="redis://127.0.0.1:6379/15",
        metrics_port=19464,
    )
    monkeypatch.setattr(sys, "argv", ["simula_worker", "--health-check"])
    monkeypatch.setattr(WorkerSettings, "from_environment", lambda: settings)
    monkeypatch.setattr(
        __main__,
        "_verify_live_worker",
        lambda *, port: checked_ports.append(port),
    )

    __main__.main()

    assert checked_ports == [19464]


def test_arq_worker_disables_redis_result_retention(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def fake_worker(**kwargs: object) -> object:
        captured.update(kwargs)
        return object()

    monkeypatch.setenv("SIMULA_RELEASE_SHA", "a" * 40)
    monkeypatch.setattr(worker_main, "Worker", fake_worker)

    worker_main._create_arq_worker(
        cast(ArqRedis, object()),
        cast(WorkerDatabase, object()),
        WorkerTelemetry(),
    )

    assert captured["keep_result"] == 0
    ctx = cast(dict[str, object], captured["ctx"])
    assert ctx["release_sha"] == "a" * 40


async def test_worker_supervisor_restarts_after_bounded_redis_poll_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stop = asyncio.Event()
    created_workers: list[object] = []
    closed_workers: list[object] = []

    class FakeWorker:
        def __init__(self, *, fail: bool) -> None:
            self.fail = fail

        async def async_run(self) -> None:
            if self.fail:
                raise RedisTimeoutError("bounded poll timeout")
            stop.set()

    class FakeRedis:
        pass

    def create_worker(redis: object, database: object, telemetry: object) -> FakeWorker:
        del redis, database, telemetry
        worker = FakeWorker(fail=not created_workers)
        created_workers.append(worker)
        return worker

    async def close_worker(worker: object, redis: object) -> None:
        del redis
        closed_workers.append(worker)

    monkeypatch.setattr(worker_main, "create_queue_client", lambda *_args, **_kwargs: FakeRedis())
    monkeypatch.setattr(worker_main, "_create_arq_worker", create_worker)
    monkeypatch.setattr(worker_main, "_close_arq_worker", close_worker)
    monkeypatch.setattr(worker_main, "WORKER_RESTART_DELAY_SECONDS", 0.001)

    await worker_main._run_arq_worker_forever(
        stop,
        settings=WorkerSettings(
            environment="test",
            release_sha="a" * 40,
            database_url=(
                "postgresql://simula_worker:test@127.0.0.1:54322/postgres?sslmode=disable"
            ),
            redis_url="redis://127.0.0.1:6379/15",
            metrics_port=9464,
        ),
        database=object(),  # type: ignore[arg-type]
        telemetry=WorkerTelemetry(),
    )

    assert len(created_workers) == 2
    assert closed_workers == created_workers


async def test_bullmq_worker_supervisor_closes_gracefully_on_stop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stop = asyncio.Event()
    closed: list[bool] = []

    class FakeRuntime:
        async def run(self) -> None:
            await asyncio.Event().wait()

        async def ping(self) -> bool:
            return True

        async def snapshot(self) -> object:
            raise AssertionError("stop wins before a monitoring snapshot")

        async def close(self, *, force: bool) -> None:
            closed.append(force)

    class FakeDatabase:
        async def ready(self) -> bool:
            return False

    monkeypatch.setattr(
        worker_main,
        "_create_bullmq_runtime",
        lambda *_args: FakeRuntime(),
    )
    task = asyncio.create_task(
        worker_main._run_bullmq_worker_forever(
            stop,
            settings=WorkerSettings(
                environment="test",
                release_sha="a" * 40,
                database_url=(
                    "postgresql://simula_worker:test@127.0.0.1:54322/postgres?sslmode=disable"
                ),
                redis_url="redis://127.0.0.1:6379/13",
                metrics_port=9464,
                queue_transport="bullmq",
            ),
            database=cast(WorkerDatabase, FakeDatabase()),
            telemetry=WorkerTelemetry(),
        )
    )
    await asyncio.sleep(0)
    stop.set()
    await task

    assert closed == [False]


async def test_bullmq_worker_supervisor_fails_closed_on_unexpected_exit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    closed: list[bool] = []

    class FakeRuntime:
        async def run(self) -> None:
            return None

        async def ping(self) -> bool:
            return True

        async def snapshot(self) -> object:
            raise AssertionError("worker exit wins")

        async def close(self, *, force: bool) -> None:
            closed.append(force)

    class FakeDatabase:
        async def ready(self) -> bool:
            return False

    monkeypatch.setattr(
        worker_main,
        "_create_bullmq_runtime",
        lambda *_args: FakeRuntime(),
    )

    with pytest.raises(RuntimeError, match="exited unexpectedly"):
        await worker_main._run_bullmq_worker_forever(
            asyncio.Event(),
            settings=WorkerSettings(
                environment="test",
                release_sha="a" * 40,
                database_url=(
                    "postgresql://simula_worker:test@127.0.0.1:54322/postgres?sslmode=disable"
                ),
                redis_url="redis://127.0.0.1:6379/13",
                metrics_port=9464,
                queue_transport="bullmq",
            ),
            database=cast(WorkerDatabase, FakeDatabase()),
            telemetry=WorkerTelemetry(),
        )

    assert closed == [True]
