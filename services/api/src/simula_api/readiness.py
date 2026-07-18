"""Bounded live dependency readiness for the API runtime."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Mapping

from simula_api.telemetry import ApiTelemetry

ReadinessCheck = Callable[[], Awaitable[bool]]


class DependencyReadiness:
    def __init__(
        self,
        checks: Mapping[str, ReadinessCheck],
        telemetry: ApiTelemetry,
        *,
        timeout_seconds: float = 1.0,
    ) -> None:
        self._checks = dict(checks)
        self._telemetry = telemetry
        self._timeout_seconds = timeout_seconds
        for name in self._checks:
            self._telemetry.set_dependency_ready(name, False)

    async def ready(self) -> bool:
        results = await asyncio.gather(
            *(self._check(name, check) for name, check in self._checks.items())
        )
        return all(results)

    async def _check(self, name: str, check: ReadinessCheck) -> bool:
        try:
            async with asyncio.timeout(self._timeout_seconds):
                ready = await check()
        except Exception:  # fail closed for every dependency client failure
            ready = False
        self._telemetry.set_dependency_ready(name, ready)
        return ready
