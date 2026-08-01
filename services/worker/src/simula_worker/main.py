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
from simula_core.behavioral_demo import authored_demo_behavioral_command
from simula_core.behavioral_engine import BehavioralRunCommand, BehavioralRunResult
from simula_core.bullmq_codec import BullMqBindingError, bind_bullmq_delivery
from simula_core.queue_runtime import create_queue_client
from simula_core.runtime import RuntimeMetadata
from simula_core.simulation import (
    AudienceCell,
    DeterministicMockProvider,
    ProviderExecutionReceiptV1,
    ProviderPreflightUnavailableError,
    ProviderRateLimitedError,
    ProviderRequest,
    SimulationProvider,
)
from simula_core.trace_context import TraceContext
from structlog.contextvars import bound_contextvars

from simula_worker.behavioral_engine_client import (
    BehavioralEngineHttpClient,
    BehavioralEngineRateLimitedError,
    BehavioralEngineRejectedError,
    BehavioralEngineUnavailableError,
    serialize_behavioral_result,
)
from simula_worker.campaign_evidence import campaign_evidence_loop
from simula_worker.config import WorkerSettings
from simula_worker.database import (
    ExecutionClaim,
    RunCreationControl,
    RuntimeObservabilitySnapshot,
    WorkerDatabase,
    WorkerExecutionGateway,
)
from simula_worker.dispatcher import RedisDispatchClient, RedisRunQueue, RunDispatcher
from simula_worker.telemetry import JobObservation, WorkerMetricsServer, WorkerTelemetry

logger = structlog.get_logger()

_SAFE_CLAIM_REJECTION_REASONS = frozenset(
    {"awaiting_confirmation", "busy", "no_work", "organization_capacity"}
)
WORKER_RESTART_DELAY_SECONDS = 1.0
RUN_CONTROL_ALERT_OWNER = "release_on_call"
RUN_CONTROL_ALERT_RUNBOOK = "brain/Operations/RUNBOOK_RUN_CREATION_DISABLED.md"
RUN_CONTROL_ALERT_SILENCE_RULE = "recovery_verified"


def _signals() -> Iterable[signal.Signals]:
    return (signal.SIGINT, signal.SIGTERM)


class ReadinessQueue(Protocol):
    async def ping(self) -> object: ...

    async def zcard(self, name: str) -> object: ...

    async def zrange(self, name: str, start: int, end: int, *, withscores: bool) -> object: ...

    async def info(self, section: str) -> object: ...


class ReadinessDatabase(Protocol):
    async def ready(self) -> bool: ...

    async def runtime_observability_snapshot(self) -> RuntimeObservabilitySnapshot: ...


class RunControlDatabase(Protocol):
    async def evaluate_run_creation_control(
        self, redis_memory_percent: float, poisoned_count: int
    ) -> RunCreationControl: ...


class BullMqWorkerExecutionGateway(WorkerExecutionGateway, Protocol):
    async def claim_execution_v2(
        self, run_id: UUID, generation: int, job_id: str
    ) -> ExecutionClaim: ...


class BehavioralEngineExecutor(Protocol):
    def execute(self, command: BehavioralRunCommand) -> BehavioralRunResult: ...

    def close(self) -> None: ...


class BullMqRuntimeSnapshot(Protocol):
    @property
    def depth(self) -> int: ...

    @property
    def oldest_ready_age_seconds(self) -> float: ...

    @property
    def memory_percent(self) -> float: ...


class BullMqRuntimePort(Protocol):
    async def run(self) -> None: ...

    async def ping(self) -> bool: ...

    async def snapshot(self) -> BullMqRuntimeSnapshot: ...

    async def close(self, *, force: bool) -> None: ...


class BullMqDeliveryRetry(RuntimeError):
    """A database-authorized delivery deferral that the BullMQ adapter must apply."""

    def __init__(self, delay_seconds: int) -> None:
        if delay_seconds not in range(1, 61):
            raise ValueError("BullMQ delivery delay is outside its bounded contract")
        super().__init__("BullMQ delivery requires a database-authorized delay")
        self.delay_seconds = delay_seconds


class _DatabaseAuthorizedRetry(RuntimeError):
    def __init__(self, delay_seconds: int) -> None:
        if delay_seconds not in range(1, 61):
            raise ValueError("database-authorized retry delay is outside its bounded contract")
        super().__init__("run delivery requires a database-authorized retry")
        self.delay_seconds = delay_seconds


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
) -> float | None:
    database_ready, queue_ready = await asyncio.gather(
        _probe_ready(database.ready()),
        _probe_ready(queue.ping()),
    )
    telemetry.set_dependency_ready("database", database_ready)
    telemetry.set_dependency_ready("queue", queue_ready)
    if database_ready:
        try:
            async with asyncio.timeout(1.0):
                snapshot = await database.runtime_observability_snapshot()
            telemetry.set_runtime_snapshot(
                migration_version=snapshot.migration_version,
                rls_force_enabled=snapshot.rls_force_enabled,
                state_counts=dict(snapshot.state_counts),
                stuck_lease_count=snapshot.stuck_lease_count,
                oldest_cancellation_age_seconds=snapshot.oldest_cancellation_age_seconds,
            )
        except Exception:
            telemetry.set_dependency_ready("database", False)
    if not queue_ready:
        return None
    try:
        async with asyncio.timeout(1.0):
            raw_depth, raw_oldest, raw_memory = await asyncio.gather(
                queue.zcard(ARQ_QUEUE_NAME),
                queue.zrange(ARQ_QUEUE_NAME, 0, 0, withscores=True),
                queue.info("memory"),
            )
        depth = int(cast(int | str, raw_depth))
        if depth < 0:
            raise ValueError("queue depth is negative")
        oldest_ready_age = _oldest_ready_age(raw_oldest)
        memory_percent = _queue_memory_percent(raw_memory)
    except RedisError, TypeError, ValueError, TimeoutError:
        telemetry.set_dependency_ready("queue", False)
        return None
    telemetry.set_queue_snapshot(
        depth=depth,
        oldest_ready_age_seconds=oldest_ready_age,
        memory_percent=memory_percent,
    )
    return memory_percent


def _oldest_ready_age(raw_oldest: object) -> float:
    if not isinstance(raw_oldest, (list, tuple)) or not raw_oldest:
        return 0.0
    first = raw_oldest[0]
    if not isinstance(first, (list, tuple)) or len(first) != 2:
        raise ValueError("queue snapshot is malformed")
    score = float(cast(float | int | str, first[1]))
    return max(0.0, time() - score / 1000.0)


def _queue_memory_percent(raw_memory: object) -> float:
    if not isinstance(raw_memory, Mapping):
        raise ValueError("queue memory snapshot is malformed")
    used_memory = int(cast(int | str, raw_memory.get("used_memory")))
    maxmemory = int(cast(int | str, raw_memory.get("maxmemory")))
    if used_memory < 0 or maxmemory < 0:
        raise ValueError("queue memory snapshot is negative")
    if maxmemory == 0:
        return 0.0
    return min(100.0, used_memory * 100.0 / maxmemory)


async def _refresh_run_creation_control(
    database: RunControlDatabase,
    telemetry: WorkerTelemetry,
    *,
    redis_memory_percent: float,
    poisoned_count: int,
) -> None:
    try:
        control = await database.evaluate_run_creation_control(
            redis_memory_percent,
            poisoned_count,
        )
        telemetry.set_run_creation_control(
            enabled=control.enabled,
            alert_reason=control.alert_reason,
        )
    except asyncio.CancelledError:
        raise
    except Exception as error:
        logger.error(
            "run_creation_control_evaluation_failed",
            error_class=type(error).__name__,
        )
        return
    if control.changed:
        logger.warning(
            "run_creation_disabled",
            alert_owner=RUN_CONTROL_ALERT_OWNER,
            reason=control.alert_reason,
            runbook=RUN_CONTROL_ALERT_RUNBOOK,
            severity="page",
            silence_rule=RUN_CONTROL_ALERT_SILENCE_RULE,
        )


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
            memory_percent = await _refresh_dependency_readiness(database, queue, telemetry)
            await _refresh_run_creation_control(
                database,
                telemetry,
                redis_memory_percent=memory_percent or 0.0,
                poisoned_count=0,
            )
            result = await dispatcher.dispatch_once()
            if result.poisoned > 0:
                await _refresh_run_creation_control(
                    database,
                    telemetry,
                    redis_memory_percent=memory_percent or 0.0,
                    poisoned_count=result.poisoned,
                )
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
        keep_result=0,
        job_timeout=30,
        poll_delay=0.25,
        job_serializer=arq_json_dumps,
        job_deserializer=arq_json_loads,
        ctx={
            "database": database,
            "provider": DeterministicMockProvider(),
            "telemetry": telemetry,
            "release_sha": RuntimeMetadata.from_environment(service="worker").release_sha,
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


def _create_bullmq_runtime(
    settings: WorkerSettings,
    database: WorkerDatabase,
    telemetry: WorkerTelemetry,
) -> BullMqRuntimePort:
    from simula_worker.bullmq_runtime import (
        PinnedBullMqRuntime,
        require_worker_gateway,
    )

    behavioral_engine: BehavioralEngineExecutor | None = None
    if settings.behavioral_engine_transport == "private_http":
        if settings.behavioral_engine_url is None or settings.behavioral_engine_token is None:
            raise RuntimeError("private behavioral engine configuration is incomplete")
        behavioral_engine = BehavioralEngineHttpClient(
            base_url=settings.behavioral_engine_url,
            token=settings.behavioral_engine_token,
        )

    return PinnedBullMqRuntime(
        redis_url=settings.redis_url,
        database=require_worker_gateway(database),
        provider=DeterministicMockProvider(),
        behavioral_engine=behavioral_engine,
        telemetry=telemetry,
        release_sha=settings.release_sha,
    )


async def _monitor_bullmq_dependencies(
    stop: asyncio.Event,
    *,
    runtime: BullMqRuntimePort,
    database: WorkerDatabase,
    telemetry: WorkerTelemetry,
) -> None:
    while not stop.is_set():
        database_ready, queue_ready = await asyncio.gather(
            _probe_ready(database.ready()),
            _probe_ready(runtime.ping()),
        )
        telemetry.set_dependency_ready("database", database_ready)
        telemetry.set_dependency_ready("queue", queue_ready)
        if database_ready:
            try:
                async with asyncio.timeout(1.0):
                    snapshot = await database.runtime_observability_snapshot()
                telemetry.set_runtime_snapshot(
                    migration_version=snapshot.migration_version,
                    rls_force_enabled=snapshot.rls_force_enabled,
                    state_counts=dict(snapshot.state_counts),
                    stuck_lease_count=snapshot.stuck_lease_count,
                    oldest_cancellation_age_seconds=snapshot.oldest_cancellation_age_seconds,
                )
            except Exception:
                telemetry.set_dependency_ready("database", False)
        if queue_ready:
            try:
                async with asyncio.timeout(1.0):
                    queue_snapshot = await runtime.snapshot()
                telemetry.set_queue_snapshot(
                    depth=queue_snapshot.depth,
                    oldest_ready_age_seconds=queue_snapshot.oldest_ready_age_seconds,
                    memory_percent=queue_snapshot.memory_percent,
                )
            except Exception:
                telemetry.set_dependency_ready("queue", False)
        try:
            await asyncio.wait_for(stop.wait(), timeout=1.0)
        except TimeoutError:
            continue


async def _run_bullmq_worker_forever(
    stop: asyncio.Event,
    *,
    settings: WorkerSettings,
    database: WorkerDatabase,
    telemetry: WorkerTelemetry,
) -> None:
    runtime = _create_bullmq_runtime(settings, database, telemetry)
    worker_task = asyncio.create_task(runtime.run(), name="bullmq-poll-loop")
    monitor_task = asyncio.create_task(
        _monitor_bullmq_dependencies(
            stop,
            runtime=runtime,
            database=database,
            telemetry=telemetry,
        ),
        name="bullmq-readiness-monitor",
    )
    stop_task = asyncio.create_task(stop.wait(), name="bullmq-poll-stop")
    try:
        done, _pending = await asyncio.wait(
            {worker_task, stop_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        if stop_task in done:
            return
        await worker_task
        if not stop.is_set():
            raise RuntimeError("BullMQ worker poll loop exited unexpectedly")
    finally:
        for task in (worker_task, monitor_task, stop_task):
            if not task.done():
                task.cancel()
        await asyncio.gather(
            worker_task,
            monitor_task,
            stop_task,
            return_exceptions=True,
        )
        await runtime.close(force=not stop.is_set())


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
    telemetry = WorkerTelemetry()
    database = WorkerDatabase(settings, telemetry=telemetry)
    await database.open()
    dispatcher_redis: ArqRedis | None = None
    metrics_server = WorkerMetricsServer(telemetry, port=settings.metrics_port)
    await metrics_server.start()
    worker_task: asyncio.Task[None] | None = None
    dispatcher_task: asyncio.Task[None] | None = None
    campaign_evidence_task: asyncio.Task[None] | None = None
    payload_contract = "run_v1" if settings.queue_transport == "arq" else "run_v2"
    try:
        if settings.queue_transport == "arq":
            dispatcher_redis = create_queue_client(settings.redis_url, max_connections=4)
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
        else:
            worker_task = asyncio.create_task(
                _run_bullmq_worker_forever(
                    stop,
                    settings=settings,
                    database=database,
                    telemetry=telemetry,
                ),
                name="bullmq-worker-supervisor",
            )
        campaign_evidence_task = asyncio.create_task(
            campaign_evidence_loop(stop, database),
            name="campaign-evidence-worker",
        )
        logger.info(
            "service_started",
            payload_contract=payload_contract,
            queue_transport=settings.queue_transport,
            **metadata.model_dump(),
        )
        stop_task = asyncio.create_task(stop.wait(), name="worker-stop")
        wait_tasks = {stop_task, worker_task}
        if campaign_evidence_task is not None:
            wait_tasks.add(campaign_evidence_task)
        done, pending = await asyncio.wait(
            wait_tasks, return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        if worker_task in done:
            await worker_task
        if campaign_evidence_task in done:
            await campaign_evidence_task
    finally:
        if dispatcher_task is not None:
            dispatcher_task.cancel()
            await asyncio.gather(dispatcher_task, return_exceptions=True)
        if worker_task is not None and not worker_task.done():
            worker_task.cancel()
            await asyncio.gather(worker_task, return_exceptions=True)
        if campaign_evidence_task is not None and not campaign_evidence_task.done():
            campaign_evidence_task.cancel()
            await asyncio.gather(campaign_evidence_task, return_exceptions=True)
        if dispatcher_redis is not None:
            await dispatcher_redis.aclose(close_connection_pool=True)
        telemetry.set_dependency_ready("database", False)
        telemetry.set_dependency_ready("queue", False)
        await database.close()
        await metrics_server.close()
        logger.info(
            "service_stopped",
            payload_contract=payload_contract,
            queue_transport=settings.queue_transport,
            **metadata.model_dump(),
        )


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
    telemetry: WorkerTelemetry | None,
) -> bool:
    current = await database.heartbeat_execution(run_id, attempt_id, lease_token)
    if current and telemetry is not None:
        telemetry.observe_run_event("visibility_extension")
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
    runtime_release_sha: str,
    deadline_at: datetime,
) -> ProviderRequest:
    stimulus = cast(Mapping[str, object], frozen_manifest["stimulus"])
    audience = cast(Mapping[str, object], frozen_manifest["audience"])
    audience_manifest = cast(Mapping[str, object], audience["manifest"])
    raw_cells = cast(list[object], audience_manifest["audience_cells"])
    code = cast(Mapping[str, object], frozen_manifest["code"])
    configuration = cast(Mapping[str, object], frozen_manifest["configuration"])
    execution = cast(Mapping[str, object], frozen_manifest["execution"])
    if code.get("release_sha") != runtime_release_sha:
        raise ValueError("worker release does not match the frozen run release")
    if execution.get("provider_id") != "deterministic_mock":
        raise ValueError("worker provider does not match the frozen run provider")
    if execution.get("provider_version") != 1:
        raise ValueError("worker provider version does not match the frozen run provider")
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
        provider_id="deterministic_mock",
        provider_version=1,
        model_id="deterministic_fixture_v1",
        template_id="phase2_deterministic_mock_v1",
        code_release_sha=runtime_release_sha,
        configuration_sha256=cast(str, configuration["sha256"]),
        frozen_manifest_sha256=frozen_manifest_sha256,
        deadline_at=deadline_at,
        cost_ceiling=0,
    )


def _behavioral_command(
    *,
    run_id: UUID,
    frozen_manifest: Mapping[str, object],
    deterministic_seed: int,
    runtime_release_sha: str,
) -> BehavioralRunCommand:
    if set(frozen_manifest) != {"behavioral_demo_input", "code", "contract"}:
        raise ValueError("behavioral run manifest has an invalid shape")
    if frozen_manifest.get("contract") != "behavioral_demo_run_v1":
        raise ValueError("behavioral run manifest contract is unsupported")
    code = frozen_manifest.get("code")
    if not isinstance(code, Mapping) or set(code) != {"release_sha"}:
        raise ValueError("behavioral run release binding is invalid")
    if code.get("release_sha") != runtime_release_sha:
        raise ValueError("worker release does not match the behavioral run")
    raw_input = frozen_manifest.get("behavioral_demo_input")
    if not isinstance(raw_input, Mapping) or set(raw_input) != {
        "organization_id",
        "run_id",
        "study_id",
        "stimulus",
        "variant_key",
    }:
        raise ValueError("behavioral demo input is invalid")
    command = authored_demo_behavioral_command(
        organization_id=UUID(str(raw_input.get("organization_id"))),
        run_id=UUID(str(raw_input.get("run_id"))),
        study_id=UUID(str(raw_input.get("study_id"))),
        variant_key=cast(str, raw_input.get("variant_key")),
        stimulus=cast(str, raw_input.get("stimulus")),
    )
    if command.run_id != run_id or command.engine_configuration.seed != deterministic_seed:
        raise ValueError("behavioral command does not match the durable run")
    return command


async def _resolve_execution_failure(
    *,
    database: WorkerExecutionGateway,
    run_id: UUID,
    attempt_id: UUID,
    lease_token: UUID,
    safe_error_code: str,
    retryable: bool,
    observation: JobObservation,
    telemetry: WorkerTelemetry | None,
) -> None:
    resolution = await database.fail_execution(
        run_id,
        attempt_id,
        lease_token,
        safe_error_code,
        retryable,
    )
    if resolution.state == "retrying":
        observation.outcome = "retrying"
        if telemetry is not None:
            telemetry.observe_run_event("retry")
        if resolution.retry_after_seconds is None:
            raise RuntimeError("retrying resolution is missing its delay")
        raise _DatabaseAuthorizedRetry(resolution.retry_after_seconds)
    observation.outcome = resolution.state
    if telemetry is not None and resolution.state == "failed":
        telemetry.observe_run_event("terminal_failure")


async def _process_claimed_behavioral_run(
    *,
    run_id: UUID,
    claim: ExecutionClaim,
    database: WorkerExecutionGateway,
    behavioral_engine: BehavioralEngineExecutor,
    telemetry: WorkerTelemetry | None,
    observation: JobObservation,
    runtime_release_sha: str,
) -> None:
    attempt_id = cast(UUID, claim.attempt_id)
    lease_token = cast(UUID, claim.lease_token)
    frozen_manifest = cast(Mapping[str, object], claim.frozen_manifest)
    deterministic_seed = cast(int, claim.deterministic_seed)

    observation.outcome = "failed"
    if not await _heartbeat_execution(
        database,
        run_id,
        attempt_id,
        lease_token,
        checkpoint="before_provider",
        telemetry=telemetry,
    ):
        observation.outcome = "lease_rejected"
        return

    started_at = datetime.now(UTC)
    try:
        command = _behavioral_command(
            run_id=run_id,
            frozen_manifest=frozen_manifest,
            deterministic_seed=deterministic_seed,
            runtime_release_sha=runtime_release_sha,
        )
        result = await asyncio.to_thread(behavioral_engine.execute, command)
        ended_at = datetime.now(UTC)
        canonical_artifact, receipt = serialize_behavioral_result(
            result,
            attempt_id=attempt_id,
            started_at=started_at,
            ended_at=ended_at,
        )
        if telemetry is not None:
            telemetry.observe_provider("completed")
    except asyncio.CancelledError:
        raise
    except (
        BehavioralEngineRateLimitedError,
        BehavioralEngineUnavailableError,
        TimeoutError,
    ) as error:
        safe_error_code = (
            "behavioral_engine_rate_limited"
            if isinstance(error, BehavioralEngineRateLimitedError)
            else "behavioral_engine_unavailable"
        )
        if telemetry is not None:
            telemetry.observe_provider("retryable_failure")
            telemetry.observe_provider_failure(
                "rate_limit"
                if isinstance(error, BehavioralEngineRateLimitedError)
                else "unavailable"
            )
        logger.warning(
            "behavioral_run_retryable_failure",
            reason=safe_error_code,
            run_id=str(run_id),
        )
        await _resolve_execution_failure(
            database=database,
            run_id=run_id,
            attempt_id=attempt_id,
            lease_token=lease_token,
            safe_error_code=safe_error_code,
            retryable=True,
            observation=observation,
            telemetry=telemetry,
        )
        return
    except (BehavioralEngineRejectedError, ValidationError, ValueError) as error:
        if telemetry is not None:
            telemetry.observe_provider("failed")
            telemetry.observe_provider_failure("policy")
        logger.error(
            "behavioral_run_rejected",
            error_class=type(error).__name__,
            run_id=str(run_id),
        )
        await _resolve_execution_failure(
            database=database,
            run_id=run_id,
            attempt_id=attempt_id,
            lease_token=lease_token,
            safe_error_code="behavioral_execution_rejected",
            retryable=False,
            observation=observation,
            telemetry=telemetry,
        )
        return
    except Exception as error:
        if telemetry is not None:
            telemetry.observe_provider("failed")
            telemetry.observe_provider_failure("schema")
        logger.error(
            "behavioral_run_failed",
            error_class=type(error).__name__,
            run_id=str(run_id),
        )
        await _resolve_execution_failure(
            database=database,
            run_id=run_id,
            attempt_id=attempt_id,
            lease_token=lease_token,
            safe_error_code="behavioral_execution_failed",
            retryable=False,
            observation=observation,
            telemetry=telemetry,
        )
        return

    completed = await database.complete_behavioral_execution(
        run_id,
        attempt_id,
        lease_token,
        canonical_artifact,
        receipt.model_dump(mode="json"),
    )
    observation.outcome = "completed" if completed else "completion_rejected"
    if not completed:
        if telemetry is not None:
            telemetry.observe_run_event("invalid_transition")
        logger.warning(
            "behavioral_run_completion_rejected",
            run_id=str(run_id),
        )


async def _process_claimed_run(
    *,
    run_id: UUID,
    claim: ExecutionClaim,
    database: WorkerExecutionGateway,
    provider: SimulationProvider,
    telemetry: WorkerTelemetry | None,
    observation: JobObservation,
    runtime_release_sha: str,
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
        telemetry=telemetry,
    ):
        observation.outcome = "lease_rejected"
        return

    provider_called = False
    try:
        provider_started_at = datetime.now(UTC)
        request = _provider_request(
            run_id=run_id,
            claim_attempt_id=attempt_id,
            frozen_manifest=frozen_manifest,
            frozen_manifest_sha256=frozen_manifest_sha256,
            deterministic_seed=deterministic_seed,
            runtime_release_sha=runtime_release_sha,
            deadline_at=provider_started_at + timedelta(seconds=30),
        )
        if telemetry is not None and not isinstance(provider, DeterministicMockProvider):
            telemetry.observe_external_provider_call()
        provider_called = True
        provider_response = provider.run(request)
        provider_ended_at = datetime.now(UTC)
        result = provider_response.result
        artifact = result.model_dump(mode="json")
        receipt = ProviderExecutionReceiptV1.from_success(
            request=request,
            response=provider_response,
            started_at=provider_started_at,
            ended_at=provider_ended_at,
        )
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
            provider_failure_kind = "timeout"
        elif isinstance(error, ProviderRateLimitedError):
            safe_error_code = "execution_rate_limited"
            provider_failure_kind = "rate_limit"
        else:
            safe_error_code = "execution_provider_preflight_unavailable"
            provider_failure_kind = "unavailable"
        if telemetry is not None:
            telemetry.observe_provider_failure(provider_failure_kind)
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
            if telemetry is not None:
                telemetry.observe_run_event("retry")
            if resolution.retry_after_seconds is None:
                raise RuntimeError("retrying resolution is missing its delay") from None
            raise _DatabaseAuthorizedRetry(resolution.retry_after_seconds) from None
        return
    except Exception as error:
        if telemetry is not None:
            if provider_called:
                telemetry.observe_provider("failed")
            telemetry.observe_provider_failure(
                "policy" if isinstance(error, ValueError) else "schema"
            )
        logger.error(
            "run_execution_provider_failed",
            error_class=type(error).__name__,
            run_id=str(run_id),
        )
        resolution = await database.fail_execution(
            run_id,
            attempt_id,
            lease_token,
            "execution_provider_failure",
            False,
        )
        if telemetry is not None:
            if resolution.state == "failed":
                telemetry.observe_run_event("terminal_failure")
            elif resolution.state == "no_work":
                telemetry.observe_run_event("invalid_transition")
        return
    completed = await database.complete_execution(
        run_id,
        attempt_id,
        lease_token,
        artifact,
        receipt.model_dump(mode="json"),
    )
    observation.outcome = "completed" if completed else "completion_rejected"
    if not completed:
        if telemetry is not None:
            telemetry.observe_run_event("invalid_transition")
        logger.warning("run_execution_completion_rejected", run_id=str(run_id))


async def _execute_delivery_claim(
    *,
    run_id: UUID,
    claim: ExecutionClaim,
    delivery_attempt: int | None,
    database: WorkerExecutionGateway,
    provider: SimulationProvider,
    behavioral_engine: BehavioralEngineExecutor | None,
    telemetry: WorkerTelemetry | None,
    observation: JobObservation,
    runtime_release_sha: str,
) -> None:
    if claim.status != "claimed":
        observation.outcome = "claim_rejected"
        if telemetry is not None and claim.status in {"busy", "no_work"}:
            telemetry.observe_run_event("duplicate_delivery")
        logger.info(
            "run_execution_claim_rejected",
            reason=_safe_claim_rejection_reason(claim.status),
            run_id=str(run_id),
        )
    if (
        claim.status == "awaiting_confirmation"
        and isinstance(delivery_attempt, int)
        and not isinstance(delivery_attempt, bool)
        and delivery_attempt <= 3
    ):
        raise _DatabaseAuthorizedRetry(1)
    if (
        claim.status == "organization_capacity"
        and isinstance(delivery_attempt, int)
        and not isinstance(delivery_attempt, bool)
        and delivery_attempt <= 13
    ):
        raise _DatabaseAuthorizedRetry(5)
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
        return

    trace = TraceContext.from_header(claim.traceparent)
    claim_manifest = claim.frozen_manifest
    claim_code = cast(Mapping[str, object], claim_manifest["code"])
    active_release_sha = runtime_release_sha or cast(str, claim_code["release_sha"])
    with bound_contextvars(
        correlation_id=str(claim.correlation_id),
        span_id=trace.span_id,
        trace_id=trace.trace_id,
    ):
        if claim_manifest.get("contract") == "behavioral_demo_run_v1":
            if behavioral_engine is None:
                await _resolve_execution_failure(
                    database=database,
                    run_id=run_id,
                    attempt_id=claim.attempt_id,
                    lease_token=claim.lease_token,
                    safe_error_code="behavioral_engine_unavailable",
                    retryable=True,
                    observation=observation,
                    telemetry=telemetry,
                )
                return
            await _process_claimed_behavioral_run(
                run_id=run_id,
                claim=claim,
                database=database,
                behavioral_engine=behavioral_engine,
                telemetry=telemetry,
                observation=observation,
                runtime_release_sha=active_release_sha,
            )
        else:
            await _process_claimed_run(
                run_id=run_id,
                claim=claim,
                database=database,
                provider=provider,
                telemetry=telemetry,
                observation=observation,
                runtime_release_sha=active_release_sha,
            )


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
        try:
            await _execute_delivery_claim(
                run_id=context_run_id,
                claim=claim,
                delivery_attempt=cast(int | None, ctx.get("job_try")),
                database=database,
                provider=provider,
                behavioral_engine=None,
                telemetry=active_telemetry,
                observation=observation,
                runtime_release_sha=cast(str, ctx.get("release_sha") or ""),
            )
        except _DatabaseAuthorizedRetry as retry:
            raise Retry(defer=retry.delay_seconds) from None
        return None
    finally:
        observation.finish()


async def process_run_v2(
    ctx: Mapping[str, object],
    payload: object,
    *,
    database: BullMqWorkerExecutionGateway | None = None,
    provider: SimulationProvider | None = None,
    behavioral_engine: BehavioralEngineExecutor | None = None,
    telemetry: WorkerTelemetry | None = None,
) -> None:
    """Bind one BullMQ delivery before database claim or provider work."""

    candidate_telemetry = telemetry or ctx.get("telemetry")
    active_telemetry = (
        candidate_telemetry if isinstance(candidate_telemetry, WorkerTelemetry) else None
    )
    observation = JobObservation(active_telemetry)
    try:
        try:
            job = bind_bullmq_delivery(
                queue_name=ctx.get("queue_name"),
                job_name=ctx.get("job_name"),
                job_id=ctx.get("job_id"),
                data=payload,
            )
        except BullMqBindingError:
            logger.warning("run_execution_binding_rejected", reason="invalid_bullmq_binding")
            return
        attempts_started = ctx.get("attempts_started")
        if (
            not isinstance(attempts_started, int)
            or isinstance(attempts_started, bool)
            or attempts_started not in range(1, 17)
        ):
            logger.warning(
                "run_execution_binding_rejected",
                reason="invalid_delivery_attempt",
            )
            return

        observation.outcome = "failed"
        database = database or cast(
            BullMqWorkerExecutionGateway,
            _context_dependency(ctx, "database"),
        )
        provider = provider or cast(SimulationProvider, _context_dependency(ctx, "provider"))
        claim = await database.claim_execution_v2(
            job.run_uuid,
            job.dispatch_generation,
            job.job_id,
        )
        try:
            await _execute_delivery_claim(
                run_id=job.run_uuid,
                claim=claim,
                delivery_attempt=attempts_started,
                database=database,
                provider=provider,
                behavioral_engine=behavioral_engine,
                telemetry=active_telemetry,
                observation=observation,
                runtime_release_sha=cast(str, ctx.get("release_sha") or ""),
            )
        except _DatabaseAuthorizedRetry as retry:
            raise BullMqDeliveryRetry(retry.delay_seconds) from None
    finally:
        observation.finish()
