"""Narrow database capability used by ARQ run execution handlers."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID


@dataclass(frozen=True)
class ExecutionClaim:
    """The only manifest-bearing worker database response, issued after binding checks."""

    status: str
    attempt_id: UUID | None
    lease_token: UUID | None
    frozen_manifest: Mapping[str, object] | None
    frozen_manifest_sha256: str | None
    deterministic_seed: int | None


class WorkerExecutionGateway(Protocol):
    """Lease-bound database mutations available to the run execution handler."""

    async def claim_execution(
        self, run_id: UUID, generation: int, job_id: str
    ) -> ExecutionClaim: ...

    async def complete_execution(
        self,
        run_id: UUID,
        attempt_id: UUID,
        lease_token: UUID,
        artifact: Mapping[str, object],
    ) -> bool: ...
