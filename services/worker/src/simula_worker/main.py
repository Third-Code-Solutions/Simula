"""Payload-inert worker lifecycle shell for P2-01."""

from __future__ import annotations

import asyncio
import signal
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

import structlog
from arq.worker import Retry
from pydantic import ValidationError
from simula_core.arq_codec import ArqCodecError, RunJobV1, parse_job_id
from simula_core.runtime import RuntimeMetadata
from simula_core.simulation import (
    AudienceCell,
    ProviderRequest,
    SimulationProvider,
    SimulationResultV1,
)

from simula_worker.database import WorkerExecutionGateway

logger = structlog.get_logger()


def _signals() -> Iterable[signal.Signals]:
    return (signal.SIGINT, signal.SIGTERM)


async def serve() -> None:
    """Remain alive without consuming jobs until P2-04 installs the worker contract."""

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for stop_signal in _signals():
        try:
            loop.add_signal_handler(stop_signal, stop.set)
        except NotImplementedError, RuntimeError:
            # Signal handlers are unavailable on some local Windows loops and child threads.
            continue

    metadata = RuntimeMetadata.from_environment(service="worker")
    logger.info("service_started", payload_contract="disabled", **metadata.model_dump())
    try:
        await stop.wait()
    finally:
        logger.info("service_stopped", payload_contract="disabled", **metadata.model_dump())


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
        return None
    if job is None or job.run_id != context_run_id:
        return None

    database = database or cast(WorkerExecutionGateway, _context_dependency(ctx, "database"))
    provider = provider or cast(SimulationProvider, _context_dependency(ctx, "provider"))
    claim = await database.claim_execution(context_run_id, generation, str(ctx["job_id"]))
    job_try = ctx.get("job_try")
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

    request = _provider_request(
        run_id=context_run_id,
        claim_attempt_id=claim.attempt_id,
        frozen_manifest=claim.frozen_manifest,
        frozen_manifest_sha256=claim.frozen_manifest_sha256,
        deterministic_seed=claim.deterministic_seed,
    )
    result: SimulationResultV1 = provider.run(request)
    await database.complete_execution(
        context_run_id,
        claim.attempt_id,
        claim.lease_token,
        result.model_dump(mode="json"),
    )
    return None
