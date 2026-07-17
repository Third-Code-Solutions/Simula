import asyncio
from collections.abc import Mapping
from uuid import UUID

import pytest
from arq.worker import Retry
from simula_core.runtime import RuntimeMetadata
from simula_core.simulation import ProviderRequest, SimulationResultV1
from simula_worker.database import ExecutionClaim
from simula_worker.main import process_run_v1, serve


def test_worker_metadata_is_private_service() -> None:
    metadata = RuntimeMetadata.from_environment(service="worker")

    assert metadata.service == "worker"


async def test_worker_shell_is_payload_inert(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    waits = 0

    async def stop_immediately(_: asyncio.Event) -> bool:
        nonlocal waits
        waits += 1
        return True

    monkeypatch.setattr(asyncio.Event, "wait", stop_immediately)

    await serve()

    assert waits == 1


class RecordingDatabase:
    def __init__(self, claim: ExecutionClaim) -> None:
        self.claim = claim
        self.claim_calls: list[tuple[UUID, int, str]] = []
        self.completions: list[tuple[UUID, UUID, UUID, Mapping[str, object]]] = []

    async def claim_execution(self, run_id: UUID, generation: int, job_id: str) -> ExecutionClaim:
        self.claim_calls.append((run_id, generation, job_id))
        return self.claim

    async def complete_execution(
        self,
        run_id: UUID,
        attempt_id: UUID,
        lease_token: UUID,
        artifact: Mapping[str, object],
    ) -> bool:
        self.completions.append((run_id, attempt_id, lease_token, artifact))
        return True


class RecordingProvider:
    def __init__(self) -> None:
        self.requests: list[object] = []

    def run(self, request: ProviderRequest) -> SimulationResultV1:
        self.requests.append(request)
        raise AssertionError("test uses rejection paths only")


def _claim(*, status: str) -> ExecutionClaim:
    return ExecutionClaim(
        status=status,
        attempt_id=None,
        lease_token=None,
        frozen_manifest=None,
        frozen_manifest_sha256=None,
        deterministic_seed=None,
    )


async def test_worker_rejects_malformed_context_before_database_or_provider_work() -> None:
    database = RecordingDatabase(_claim(status="no_work"))
    provider = RecordingProvider()

    await process_run_v1(
        {"job_id": "forged"},
        {"schema_version": 1, "run_id": "00000000-0000-4000-8000-0000000000b1"},
        database=database,
        provider=provider,
    )

    assert database.claim_calls == []
    assert provider.requests == []


async def test_worker_unconfirmed_dispatch_defers_without_manifest_or_provider_work() -> None:
    run_id = UUID("00000000-0000-4000-8000-0000000000b2")
    database = RecordingDatabase(_claim(status="awaiting_confirmation"))
    provider = RecordingProvider()

    with pytest.raises(Retry) as raised:
        await process_run_v1(
            {"job_id": f"run:{run_id}:dispatch:1", "job_try": 1},
            {"schema_version": 1, "run_id": str(run_id)},
            database=database,
            provider=provider,
        )

    assert raised.value.defer_score is not None
    assert database.claim_calls == [(run_id, 1, f"run:{run_id}:dispatch:1")]
    assert database.completions == []
    assert provider.requests == []
