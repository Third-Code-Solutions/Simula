"""Durable outbox dispatcher with post-enqueue proof before confirmation."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

import structlog
from simula_core.queue_runtime import (
    ArqEnqueuer,
    ArqInspector,
    QueuePublishAmbiguousError,
    RunDispatchIntent,
    enqueue_run,
    inspect_queued_run,
)

from simula_worker.database import DispatchClaim

logger = structlog.get_logger()
RECOVERY_INTERVAL_SECONDS = 30.0


class DispatcherDatabase(Protocol):
    async def finalize_requested_cancellations(self, requested_batch_size: int = 10) -> int: ...

    async def finalize_poisoned_dispatches(self, requested_batch_size: int = 10) -> int: ...

    async def reconcile_stale_dispatches(
        self, requested_batch_size: int = 10, *, force_recovery: bool = False
    ) -> int: ...

    async def claim_due_dispatches(self, requested_batch_size: int = 10) -> list[DispatchClaim]: ...

    async def confirm_dispatch(self, outbox_id: UUID, claim_token: UUID) -> bool: ...

    async def fail_dispatch(
        self, outbox_id: UUID, claim_token: UUID, safe_error_code: str
    ) -> bool: ...


class DispatcherQueue(Protocol):
    async def enqueue(self, intent: RunDispatchIntent) -> None: ...

    async def proves_queued(self, intent: RunDispatchIntent) -> bool: ...


class RedisDispatchClient(ArqEnqueuer, ArqInspector, Protocol):
    pass


class RedisRunQueue(DispatcherQueue):
    """Adapter that prevents dispatcher code from issuing arbitrary Redis commands."""

    def __init__(self, redis: RedisDispatchClient) -> None:
        self._redis = redis

    async def enqueue(self, intent: RunDispatchIntent) -> None:
        await enqueue_run(self._redis, intent)

    async def proves_queued(self, intent: RunDispatchIntent) -> bool:
        return await inspect_queued_run(self._redis, intent)


@dataclass(frozen=True, slots=True)
class DispatchPass:
    canceled: int
    poisoned: int
    recovered: int
    claimed: int
    confirmed: int


class RunDispatcher:
    """Moves durable intent to ARQ without treating publish acknowledgement as truth."""

    def __init__(self, database: DispatcherDatabase, queue: DispatcherQueue) -> None:
        self._database = database
        self._queue = queue
        self._next_recovery_at = 0.0

    async def dispatch_once(self, *, batch_size: int = 10) -> DispatchPass:
        canceled = await self._database.finalize_requested_cancellations(batch_size)
        poisoned = await self._database.finalize_poisoned_dispatches(batch_size)
        now = asyncio.get_running_loop().time()
        recovered = 0
        if now >= self._next_recovery_at:
            recovered = await self._database.reconcile_stale_dispatches(batch_size)
            self._next_recovery_at = now + RECOVERY_INTERVAL_SECONDS
        claims = await self._database.claim_due_dispatches(batch_size)
        confirmed = 0
        for claim in claims:
            intent = RunDispatchIntent(
                run_id=claim.run_id,
                generation=claim.generation,
                job_id=claim.job_id,
            )
            try:
                await self._queue.enqueue(intent)
                proved = await self._queue.proves_queued(intent)
                if not proved:
                    logger.warning("run_dispatch_unproven", outbox_id=str(claim.outbox_id))
                    continue
                changed = await self._database.confirm_dispatch(claim.outbox_id, claim.claim_token)
            except asyncio.CancelledError:
                raise
            except QueuePublishAmbiguousError:
                logger.warning("run_dispatch_ambiguous", outbox_id=str(claim.outbox_id))
                continue
            except Exception:
                logger.exception("run_dispatch_failed", outbox_id=str(claim.outbox_id))
                try:
                    failure_recorded = await self._database.fail_dispatch(
                        claim.outbox_id, claim.claim_token, "dispatch_transport_failed"
                    )
                except Exception:
                    logger.exception(
                        "run_dispatch_failure_record_failed", outbox_id=str(claim.outbox_id)
                    )
                else:
                    if not failure_recorded:
                        logger.warning(
                            "run_dispatch_failure_record_rejected", outbox_id=str(claim.outbox_id)
                        )
                continue
            if changed:
                confirmed += 1
            else:
                logger.warning("run_dispatch_confirmation_rejected", outbox_id=str(claim.outbox_id))
        return DispatchPass(
            canceled=canceled,
            poisoned=poisoned,
            recovered=recovered,
            claimed=len(claims),
            confirmed=confirmed,
        )
