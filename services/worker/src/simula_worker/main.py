"""Strict ARQ worker lifecycle and deterministic run execution handler."""

from __future__ import annotations

import asyncio
import signal
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime, timedelta
from typing import Literal, cast
from uuid import UUID

import structlog
from arq.worker import Retry
from pydantic import ValidationError
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

from simula_worker.config import WorkerSettings
from simula_worker.database import WorkerDatabase, WorkerExecutionGateway
from simula_worker.dispatcher import RedisDispatchClient, RedisRunQueue, RunDispatcher

logger = structlog.get_logger()

_SAFE_CLAIM_REJECTION_REASONS = frozenset(
    {"awaiting_confirmation", "busy", "no_work", "organization_capacity"}
)


def _signals() -> Iterable[signal.Signals]:
    return (signal.SIGINT, signal.SIGTERM)


async def _dispatch_forever(dispatcher: RunDispatcher, stop: asyncio.Event) -> None:
    """Poll durable intent; errors leave claims unconfirmed for lease expiry/redrive."""

    while not stop.is_set():
        try:
            await dispatcher.dispatch_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("run_dispatch_pass_failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=1.0)
        except TimeoutError:
            continue


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
    redis = create_queue_client(settings.redis_url, max_connections=8)
    worker = None
    worker_task: asyncio.Task[None] | None = None
    dispatcher_task: asyncio.Task[None] | None = None
    try:
        from arq.worker import Worker

        worker = Worker(
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
            },
        )
        dispatcher = RunDispatcher(database, RedisRunQueue(cast(RedisDispatchClient, redis)))
        worker_task = asyncio.create_task(worker.async_run(), name="arq-worker")
        dispatcher_task = asyncio.create_task(
            _dispatch_forever(dispatcher, stop), name="run-dispatcher"
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
        if worker is not None:
            await worker.close()
        await database.close()
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


async def process_run_v1(
    ctx: Mapping[str, object],
    payload: object,
    *,
    database: WorkerExecutionGateway | None = None,
    provider: SimulationProvider | None = None,
) -> None:
    """Claim a confirmed current run before manifest access or deterministic provider work."""

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

    database = database or cast(WorkerExecutionGateway, _context_dependency(ctx, "database"))
    provider = provider or cast(SimulationProvider, _context_dependency(ctx, "provider"))
    claim = await database.claim_execution(context_run_id, generation, str(ctx["job_id"]))
    job_try = ctx.get("job_try")
    if claim.status != "claimed":
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
    ):
        return None

    if not await _heartbeat_execution(
        database,
        context_run_id,
        claim.attempt_id,
        claim.lease_token,
        checkpoint="before_provider",
    ):
        return None

    try:
        request = _provider_request(
            run_id=context_run_id,
            claim_attempt_id=claim.attempt_id,
            frozen_manifest=claim.frozen_manifest,
            frozen_manifest_sha256=claim.frozen_manifest_sha256,
            deterministic_seed=claim.deterministic_seed,
        )
        result: SimulationResultV1 = provider.run(request)
    except asyncio.CancelledError:
        raise
    except (TimeoutError, ProviderPreflightUnavailableError, ProviderRateLimitedError) as error:
        if isinstance(error, TimeoutError):
            safe_error_code = "execution_timed_out"
        elif isinstance(error, ProviderRateLimitedError):
            safe_error_code = "execution_rate_limited"
        else:
            safe_error_code = "execution_provider_preflight_unavailable"
        logger.warning("run_execution_retryable_failure", run_id=str(context_run_id))
        resolution = await database.fail_execution(
            context_run_id,
            claim.attempt_id,
            claim.lease_token,
            safe_error_code,
            True,
        )
        if resolution.state == "retrying":
            if resolution.retry_after_seconds is None:
                raise RuntimeError("retrying resolution is missing its delay") from None
            raise Retry(defer=resolution.retry_after_seconds) from None
        return None
    except Exception:
        logger.exception("run_execution_provider_failed", run_id=str(context_run_id))
        await database.fail_execution(
            context_run_id,
            claim.attempt_id,
            claim.lease_token,
            "execution_provider_failure",
            False,
        )
        return None
    completed = await database.complete_execution(
        context_run_id,
        claim.attempt_id,
        claim.lease_token,
        result.model_dump(mode="json"),
    )
    if not completed:
        logger.warning("run_execution_completion_rejected", run_id=str(context_run_id))
    return None
