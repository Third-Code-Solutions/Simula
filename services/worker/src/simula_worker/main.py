"""Payload-inert worker lifecycle shell for P2-01."""

from __future__ import annotations

import asyncio
import signal
from collections.abc import Iterable

import structlog
from simula_core.runtime import RuntimeMetadata

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
