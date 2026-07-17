"""API-only best-effort run publisher; durable confirmation belongs to the worker."""

from __future__ import annotations

from simula_core.queue_runtime import ArqEnqueuer, RunDispatchIntent, enqueue_run

from simula_api.services import RunPublisher


class ArqRunPublisher(RunPublisher):
    def __init__(self, queue: ArqEnqueuer) -> None:
        self._queue = queue

    async def publish(self, intent: RunDispatchIntent) -> None:
        await enqueue_run(self._queue, intent)
