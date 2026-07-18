"""Strict ARQ worker lifecycle and deterministic run execution handler."""

from __future__ import annotations

import asyncio
import signal
from collections.abc import Awaitable, Iterable, Mapping
from datetime import UTC, datetime, timedelta
from time import time
from typing import Literal, Protocol, cast
from uuid import UUID

import structlog
from arq.connections import ArqRedis
from arq.worker import Retry, Worker
from pydantic import ValidationError
from redis.exceptions import RedisError
from simula_core.arq_codec import (
    ARQ_QUEUE_NAME,
    MAX_ARQ_TRIES,
    ArqCodecError,
    RunJobV1,
    arq_json_dumps,
    arq_json_loads,
    parse_job_id,
)
from simula_core.queue_runtime import create_queue_client
from simula_core.runtime import RuntimeMetadata
from simula_core.simulation import (
    AudienceCell,
    DeterministicMockProvider,
    ProviderPreflightUnavailableError,
    ProviderRateLimitedError,
    ProviderRequest,
    SimulationProvider,
    SimulationResultV1,
)
from simula_core.trace_context import TraceContext
from structlog.contextvars import bound_contextvars

from simula_worker.config import WorkerSettings
from simula_worker.database import ExecutionClaim, WorkerDatabase, WorkerExecutionGateway
from simula_worker.dispatcher import RedisDispatchClient, RedisRunQueue, RunDispatcher
from simula_worker.telemetry import JobObservation, WorkerMetricsServer, WorkerTelemetry

logger = structlog.get_logger()

_SAFE_CLAIM_REJECTION_REASONS = frozenset(
    {"awaiting_confirmation", "busy", "no_work", "organization_capacity"}
)
WORKER_RESTART_DELAY_SECONDS = 1.0


def _signals() -> Iterable[signal.Signals]:
    return (signal.SIGINT, signal.SIGTERM)


class ReadinessQueue(Protocol):
    async def ping(self) -> object: ...

    async def zcard(self, name: str) -> object: ...

    async def zrange(self, name: str, start: int, end: int, *, withscores: bool) -> object: ...


class ReadinessDatabase(Protocol):
    async def ready(self) -> bool: ...


async def _probe_ready(probe: Awaitable[object]) -> bool:
    try:
        async with asyncio.timeout(1.0):
            result = await probe
        return bool(result)
    except Exception:
        return False


async def _refresh_dependency_readiness(
    database: ReadinessDatabase,
    queue: ReadinessQueue,
    telemetry: WorkerTelemetry,
) -> None:
    database_ready, queue_ready = await asyncio.gather(
        _probe_ready(database.ready()),
        _probe_ready(queue.ping()),
    )
    telemetry.set_dependency_ready("database", database_ready)
    telemetry.set_dependency_ready("queue", queue_ready)
    if not queue_ready:
        return
    try:
        async with asyncio.timeout(1.0):
            raw_depth, raw_oldest = await asyncio.gather(
                queue.zcard(ARQ_QUEUE_NAME),
                queue.zrange(ARQ_QUEUE_NAME, 0, 0, withscores=True),
            )
        depth = int(cast(int | str, raw_depth))
        if depth < 0:
            raise ValueError("queue depth is negative")
        oldest_ready_age = _oldest_ready_age(raw_oldest)
    except TypeError, ValueError, TimeoutError:
        telemetry.set_dependency_ready("queue", False)
        return
    telemetry.set_queue_snapshot(depth=depth, oldest_ready_age_seconds=oldest_ready_age)


def _oldest_ready_age(raw_oldest: object) -> float:
    if not isinstance(raw_oldest, (list, tuple)) or not raw_oldest:
        return 0.0
    first = raw_oldest[0]
    if not isinstance(first, (list, tuple)) or len(first) != 2:
        raise ValueError("queue snapshot is malformed")
    score = float(cast(float | int | str, first[1]))
    return max(0.0, time() - score / 1000.0)


async def _dispatch_forever(
    dispatcher: RunDispatcher,
    stop: asyncio.Event,
    *,
    database: WorkerDatabase,
    queue: ReadinessQueue,
    telemetry: WorkerTelemetry,
) -> None:
    """Poll durable intent; errors leave claims unconfirmed for lease expiry/redrive."""

    while not stop.is_set():
        try:
            await _refresh_dependency_readiness(database, queue, telemetry)
            await dispatcher.dispatch_once()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.error("run_dispatch_pass_failed", error_class=type(error).__name__)
        try:
            await asyncio.wait_for(stop.wait(), timeout=1.0)
        except TimeoutError:
            continue


def _create_arq_worker(
    redis: ArqRedis,
    database: WorkerDatabase,
    telemetry: WorkerTelemetry,
) -> Worker:
    return Worker(
        functions=[process_run_v1],
        queue_name=ARQ_QUEUE_NAME,
        redis_pool=redis,
        handle_signals=False,
        max_jobs=4,
        max_tries=MAX_ARQ_TRIES,
        job_timeout=30,
        poll_delay=0.25,
        job_serializer=arq_json_dumps,
        job_deserializer=arq_json_loads,
        ctx={
            "database": database,
            "provider": DeterministicMockProvider(),
            "telemetry": telemetry,
        },
    )


async def _close_arq_worker(worker: Worker, redis: ArqRedis) -> None:
    """Close pinned ARQ safely on Windows and always release its private pool."""

    if not hasattr(signal, "SIGUSR1"):
        # ARQ 0.28 close() unconditionally references POSIX-only SIGUSR1 when
        # handle_signals=False. Signal with the available equivalent first,
        # then suppress only that duplicate internal signal step.
        worker.handle_sig(signal.SIGTERM)
        worker._handle_signals = True
    try:
        await worker.close()
    except RedisError as error:
        logger.warning("run_worker_close_failed", error_class=type(error).__name__)
    finally:
        await redis.aclose(close_connection_pool=True)


async def _run_arq_worker_forever(
    stop: asyncio.Event,
    *,
    settings: WorkerSettings,
    database: WorkerDatabase,
    telemetry: WorkerTelemetry,
) -> None:
    """Restart only bounded transport-poll failures; unknown failures remain fatal."""

    while not stop.is_set():
        redis = create_queue_client(settings.redis_url, max_connections=4)
        worker = _create_arq_worker(redis, database, telemetry)
        worker_task = asyncio.create_task(worker.async_run(), name="arq-poll-loop")
        stop_task = asyncio.create_task(stop.wait(), name="arq-poll-stop")
        try:
            done, _pending = await asyncio.wait(
                {worker_task, stop_task}, return_when=asyncio.FIRST_COMPLETED
            )
            if stop_task in done:
                worker_task.cancel()
                await asyncio.gather(worker_task, return_exceptions=True)
                return
            await worker_task
            if not stop.is_set():
                raise RuntimeError("ARQ worker poll loop exited unexpectedly")
        except asyncio.CancelledError:
            raise
        except RedisError as error:
            telemetry.set_dependency_ready("queue", False)
            logger.error(
                "run_worker_poll_failed",
                error_class=type(error).__name__,
                restart_delay_seconds=WORKER_RESTART_DELAY_SECONDS,
            )
            try:
                await asyncio.wait_for(stop.wait(), timeout=WORKER_RESTART_DELAY_SECONDS)
            except TimeoutError:
                continue
        finally:
            for task in (worker_task, stop_task):
                if not task.done():
                    task.cancel()
            await asyncio.gather(worker_task, stop_task, return_exceptions=True)
            await _close_arq_worker(worker, redis)


async def serve() -> None:
    """Run the strict worker with bounded dependencies and graceful signal shutdown."""

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for stop_signal in _signals():
        try:
            loop.add_signal_handler(stop_signal, stop.set)
        except NotImplementedError, RuntimeError:
            # Signal handlers are unavailable on some local Windows loops and child threads.
            continue

    settings = WorkerSettings.from_environment()
    metadata = RuntimeMetadata.from_environment(service="worker")
    database = WorkerDatabase(settings)
    await database.open()
    dispatcher_redis = create_queue_client(settings.redis_url, max_connections=4)
    telemetry = WorkerTelemetry()
    metrics_server = WorkerMetricsServer(telemetry, port=settings.metrics_port)
    await metrics_server.start()
    worker_task: asyncio.Task[None] | None = None
    dispatcher_task: asyncio.Task[None] | None = None
    try:
        dispatcher = RunDispatcher(
            database,
            RedisRunQueue(cast(RedisDispatchClient, dispatcher_redis)),
            telemetry=telemetry,
        )
        worker_task = asyncio.create_task(
            _run_arq_worker_forever(
                stop,
                settings=settings,
                database=database,
                telemetry=telemetry,
            ),
            name="arq-worker-supervisor",
        )
        dispatcher_task = asyncio.create_task(
            _dispatch_forever(
                dispatcher,
                stop,
                database=database,
                queue=cast(ReadinessQueue, dispatcher_redis),
                telemetry=telemetry,
            ),
            name="run-dispatcher",
        )
        logger.info("service_started", payload_contract="run_v1", **metadata.model_dump())
        stop_task = asyncio.create_task(stop.wait(), name="worker-stop")
        done, pending = await asyncio.wait(
            {stop_task, worker_task}, return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        if worker_task in done:
            await worker_task
    finally:
        if dispatcher_task is not None:
            dispatcher_task.cancel()
            await asyncio.gather(dispatcher_task, return_exceptions=True)
        if worker_task is not None and not worker_task.done():
            worker_task.cancel()
            await asyncio.gather(worker_task, return_exceptions=True)
        await dispatcher_redis.aclose(close_connection_pool=True)
        telemetry.set_dependency_ready("database", False)
        telemetry.set_dependency_ready("queue", False)
        await database.close()
        await metrics_server.close()
        logger.info("service_stopped", payload_contract="run_v1", **metadata.model_dump())


def _context_dependency(ctx: Mapping[str, object], name: str) -> object:
    value = ctx.get(name)
    if value is None:
        raise RuntimeError(f"worker context dependency {name} is unavailable")
    return value


def _run_job(payload: object) -> RunJobV1 | None:
    try:
        return RunJobV1.model_validate(payload)
    except ValidationError:
        return None


def _safe_claim_rejection_reason(status: str) -> str:
    if status in _SAFE_CLAIM_REJECTION_REASONS:
        return status
    return "invalid_status"


async def _heartbeat_execution(
    database: WorkerExecutionGateway,
    run_id: UUID,
    attempt_id: UUID,
    lease_token: UUID,
    *,
    checkpoint: Literal["before_provider"],
) -> bool:
    current = await database.heartbeat_execution(run_id, attempt_id, lease_token)
    if not current:
        logger.warning(
            "run_execution_lease_rejected",
            checkpoint=checkpoint,
            run_id=str(run_id),
        )
    return current


def _provider_request(
    *,
    run_id: UUID,
    claim_attempt_id: UUID,
    frozen_manifest: Mapping[str, object],
    frozen_manifest_sha256: str,
    deterministic_seed: int,
) -> ProviderRequest:
    stimulus = cast(Mapping[str, object], frozen_manifest["stimulus"])
    audience = cast(Mapping[str, object], frozen_manifest["audience"])
    audience_manifest = cast(Mapping[str, object], audience["manifest"])
    raw_cells = cast(list[object], audience_manifest["audience_cells"])
    return ProviderRequest(
        request_id=claim_attempt_id,
        attempt_id=claim_attempt_id,
        run_id=run_id,
        method_version="phase2_demo_v1",
        language="en",
        stimulus_content=cast(str, stimulus["content"]),
        audience_cells=tuple(AudienceCell.model_validate(cell) for cell in raw_cells),
        deterministic_seed=deterministic_seed,
        output_schema_version=1,
        frozen_manifest_sha256=frozen_manifest_sha256,
        deadline_at=datetime.now(UTC) + timedelta(seconds=30),
        cost_ceiling=0,
    )


async def _process_claimed_run(
    *,
    run_id: UUID,
    claim: ExecutionClaim,
    database: WorkerExecutionGateway,
    provider: SimulationProvider,
    telemetry: WorkerTelemetry | None,
    observation: JobObservation,
) -> None:
    attempt_id = cast(UUID, claim.attempt_id)
    lease_token = cast(UUID, claim.lease_token)
    frozen_manifest = cast(Mapping[str, object], claim.frozen_manifest)
    frozen_manifest_sha256 = cast(str, claim.frozen_manifest_sha256)
    deterministic_seed = cast(int, claim.deterministic_seed)

    observation.outcome = "failed"
    if not await _heartbeat_execution(
        database,
        run_id,
        attempt_id,
        lease_token,
        checkpoint="before_provider",
    ):
        observation.outcome = "lease_rejected"
        return

    provider_called = False
    try:
        request = _provider_request(
            run_id=run_id,
            claim_attempt_id=attempt_id,
            frozen_manifest=frozen_manifest,
            frozen_manifest_sha256=frozen_manifest_sha256,
            deterministic_seed=deterministic_seed,
        )
        if telemetry is not None and not isinstance(provider, DeterministicMockProvider):
            telemetry.observe_external_provider_call()
        provider_called = True
        result: SimulationResultV1 = provider.run(request)
        if telemetry is not None:
            telemetry.observe_provider("completed")
    except asyncio.CancelledError:
        raise
    except (
        TimeoutError,
        ProviderPreflightUnavailableError,
        ProviderRateLimitedError,
    ) as error:
        if telemetry is not None and provider_called:
            telemetry.observe_provider("retryable_failure")
        if isinstance(error, TimeoutError):
            safe_error_code = "execution_timed_out"
        elif isinstance(error, ProviderRateLimitedError):
            safe_error_code = "execution_rate_limited"
        else:
            safe_error_code = "execution_provider_preflight_unavailable"
        logger.warning(
            "run_execution_retryable_failure",
            reason=safe_error_code,
            run_id=str(run_id),
        )
        resolution = await database.fail_execution(
            run_id,
            attempt_id,
            lease_token,
            safe_error_code,
            True,
        )
        if resolution.state == "retrying":
            observation.outcome = "retrying"
            if resolution.retry_after_seconds is None:
                raise RuntimeError("retrying resolution is missing its delay") from None
            raise Retry(defer=resolution.retry_after_seconds) from None
        return
    except Exception as error:
        if telemetry is not None and provider_called:
            telemetry.observe_provider("failed")
        logger.error(
            "run_execution_provider_failed",
            error_class=type(error).__name__,
            run_id=str(run_id),
        )
        await database.fail_execution(
            run_id,
            attempt_id,
            lease_token,
            "execution_provider_failure",
            False,
        )
        return
    completed = await database.complete_execution(
        run_id,
        attempt_id,
        lease_token,
        result.model_dump(mode="json"),
    )
    observation.outcome = "completed" if completed else "completion_rejected"
    if not completed:
        logger.warning("run_execution_completion_rejected", run_id=str(run_id))


async def process_run_v1(
    ctx: Mapping[str, object],
    payload: object,
    *,
    database: WorkerExecutionGateway | None = None,
    provider: SimulationProvider | None = None,
    telemetry: WorkerTelemetry | None = None,
) -> None:
    """Claim a confirmed current run before manifest access or deterministic provider work."""

    candidate_telemetry = telemetry or ctx.get("telemetry")
    active_telemetry = (
        candidate_telemetry if isinstance(candidate_telemetry, WorkerTelemetry) else None
    )
    observation = JobObservation(active_telemetry)
    try:
        job = _run_job(payload)
        try:
            context_run_id, generation = parse_job_id(ctx.get("job_id"))
        except ArqCodecError:
            logger.warning("run_execution_binding_rejected", reason="invalid_job_id")
            return None
        if job is None:
            logger.warning("run_execution_binding_rejected", reason="invalid_payload")
            return None
        if job.run_id != context_run_id:
            logger.warning("run_execution_binding_rejected", reason="run_id_mismatch")
            return None

        observation.outcome = "failed"
        database = database or cast(WorkerExecutionGateway, _context_dependency(ctx, "database"))
        provider = provider or cast(SimulationProvider, _context_dependency(ctx, "provider"))
        claim = await database.claim_execution(context_run_id, generation, str(ctx["job_id"]))
        job_try = ctx.get("job_try")
        if claim.status != "claimed":
            observation.outcome = "claim_rejected"
            logger.info(
                "run_execution_claim_rejected",
                reason=_safe_claim_rejection_reason(claim.status),
                run_id=str(context_run_id),
            )
        if claim.status == "awaiting_confirmation" and isinstance(job_try, int) and job_try <= 3:
            raise Retry(defer=1)
        if claim.status == "organization_capacity" and isinstance(job_try, int) and job_try <= 13:
            raise Retry(defer=5)
        if (
            claim.status != "claimed"
            or claim.attempt_id is None
            or claim.lease_token is None
            or claim.frozen_manifest is None
            or claim.frozen_manifest_sha256 is None
            or claim.deterministic_seed is None
            or claim.correlation_id is None
            or claim.traceparent is None
        ):
            return None

        trace = TraceContext.from_header(claim.traceparent)
        with bound_contextvars(
            correlation_id=str(claim.correlation_id),
            span_id=trace.span_id,
            trace_id=trace.trace_id,
        ):
            await _process_claimed_run(
                run_id=context_run_id,
                claim=claim,
                database=database,
                provider=provider,
                telemetry=active_telemetry,
                observation=observation,
            )
        return None
    finally:
        observation.finish()
