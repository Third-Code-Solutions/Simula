"""Runtime services owned by the FastAPI lifespan."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from simula_core.queue_runtime import RunDispatchIntent

from simula_api.auth import SupabaseTokenVerifier
from simula_api.cursor import CursorCodec
from simula_api.database import DatabaseGateway
from simula_api.rate_limits import RateLimiter


class RunAdmission(Protocol):
    """Read-only global queue guard for creating new runs."""

    async def require_run_creation_capacity(self) -> None: ...


class RunPublisher(Protocol):
    """Best-effort post-commit publisher with no outbox confirmation authority."""

    async def publish(self, intent: RunDispatchIntent) -> None: ...


@dataclass(frozen=True)
class AppServices:
    verifier: SupabaseTokenVerifier
    database: DatabaseGateway
    cursors: CursorCodec
    rate_limiter: RateLimiter
    run_publisher: RunPublisher | None = None
    run_admission: RunAdmission | None = None
