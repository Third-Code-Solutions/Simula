from collections.abc import Mapping
from uuid import UUID

import pytest
from arq.worker import Retry
from simula_core.runtime import RuntimeMetadata
from simula_core.simulation import (
    DeterministicMockProvider,
    ProviderPreflightUnavailableError,
    ProviderRateLimitedError,
    ProviderRequest,
    SimulationResultV1,
)
from simula_worker.database import ExecutionClaim, FailureResolution
from simula_worker.main import process_run_v1
from simula_worker.telemetry import WorkerTelemetry
from structlog.testing import capture_logs


def test_worker_metadata_is_private_service() -> None:
    metadata = RuntimeMetadata.from_environment(service="worker")

    assert metadata.service == "worker"


class RecordingDatabase:
    def __init__(
        self,
        claim: ExecutionClaim,
        failure_resolution: FailureResolution | None = None,
        *,
        heartbeat_result: bool = True,
    ) -> None:
        self.claim = claim
        self.failure_resolution = failure_resolution or FailureResolution(state="failed")
        self.heartbeat_result = heartbeat_result
        self.claim_calls: list[tuple[UUID, int, str]] = []
        self.heartbeats: list[tuple[UUID, UUID, UUID]] = []
        self.completions: list[tuple[UUID, UUID, UUID, Mapping[str, object]]] = []
        self.failures: list[tuple[UUID, UUID, UUID, str, bool]] = []

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

    async def heartbeat_execution(self, run_id: UUID, attempt_id: UUID, lease_token: UUID) -> bool:
        self.heartbeats.append((run_id, attempt_id, lease_token))
        return self.heartbeat_result

    async def fail_execution(
        self,
        run_id: UUID,
        attempt_id: UUID,
        lease_token: UUID,
        safe_error_code: str,
        retryable: bool,
    ) -> FailureResolution:
        self.failures.append((run_id, attempt_id, lease_token, safe_error_code, retryable))
        return self.failure_resolution


class RecordingProvider:
    def __init__(self) -> None:
        self.requests: list[object] = []

    def run(self, request: ProviderRequest) -> SimulationResultV1:
        self.requests.append(request)
        raise AssertionError("test uses rejection paths only")


class TimeoutProvider:
    def __init__(self) -> None:
        self.requests: list[object] = []

    def run(self, request: ProviderRequest) -> SimulationResultV1:
        self.requests.append(request)
        raise TimeoutError


class PreflightUnavailableProvider:
    def __init__(self) -> None:
        self.requests: list[object] = []

    def run(self, request: ProviderRequest) -> SimulationResultV1:
        self.requests.append(request)
        raise ProviderPreflightUnavailableError


class RateLimitedProvider:
    def __init__(self) -> None:
        self.requests: list[object] = []

    def run(self, request: ProviderRequest) -> SimulationResultV1:
        self.requests.append(request)
        raise ProviderRateLimitedError


def _claim(*, status: str) -> ExecutionClaim:
    return ExecutionClaim(
        status=status,
        attempt_id=None,
        lease_token=None,
        frozen_manifest=None,
        frozen_manifest_sha256=None,
        deterministic_seed=None,
    )


def _claimed_run() -> tuple[UUID, ExecutionClaim]:
    run_id = UUID("00000000-0000-4000-8000-0000000000b3")
    return (
        run_id,
        ExecutionClaim(
            status="claimed",
            attempt_id=UUID("00000000-0000-4000-8000-0000000000b4"),
            lease_token=UUID("00000000-0000-4000-8000-0000000000b5"),
            frozen_manifest={
                "stimulus": {"content": "Test the deterministic execution path."},
                "audience": {
                    "manifest": {"audience_cells": [{"key": "authored_demo", "weight": 1.0}]}
                },
            },
            frozen_manifest_sha256="a" * 64,
            deterministic_seed=42,
        ),
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


@pytest.mark.parametrize(
    ("context_job_id", "payload", "reason"),
    [
        (
            "forged-sensitive-job-canary",
            {"schema_version": 1, "run_id": "00000000-0000-4000-8000-0000000000b1"},
            "invalid_job_id",
        ),
        (
            "run:00000000-0000-4000-8000-0000000000b1:dispatch:1",
            {"schema_version": 1, "run_id": "sensitive-payload-canary"},
            "invalid_payload",
        ),
        (
            "run:00000000-0000-4000-8000-0000000000b1:dispatch:1",
            {"schema_version": 1, "run_id": "00000000-0000-4000-8000-0000000000b2"},
            "run_id_mismatch",
        ),
    ],
)
async def test_worker_emits_allowlisted_binding_rejection_without_payload(
    context_job_id: str,
    payload: object,
    reason: str,
) -> None:
    database = RecordingDatabase(_claim(status="no_work"))
    provider = RecordingProvider()

    with capture_logs() as logs:
        await process_run_v1(
            {"job_id": context_job_id}, payload, database=database, provider=provider
        )

    assert logs == [
        {
            "event": "run_execution_binding_rejected",
            "log_level": "warning",
            "reason": reason,
        }
    ]
    assert "sensitive" not in str(logs)
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


@pytest.mark.parametrize(
    ("claim_status", "safe_reason"),
    [("no_work", "no_work"), ("sensitive-status-canary", "invalid_status")],
)
async def test_worker_emits_allowlisted_database_claim_rejection(
    claim_status: str, safe_reason: str
) -> None:
    run_id = UUID("00000000-0000-4000-8000-0000000000b2")
    database = RecordingDatabase(_claim(status=claim_status))
    provider = RecordingProvider()

    with capture_logs() as logs:
        await process_run_v1(
            {"job_id": f"run:{run_id}:dispatch:1"},
            {"schema_version": 1, "run_id": str(run_id)},
            database=database,
            provider=provider,
        )

    rejected = next(log for log in logs if log["event"] == "run_execution_claim_rejected")
    assert rejected["reason"] == safe_reason
    assert rejected["run_id"] == str(run_id)
    assert "sensitive-status-canary" not in str(logs)
    assert provider.requests == []


async def test_worker_completes_a_claimed_deterministic_run() -> None:
    run_id, claim = _claimed_run()
    database = RecordingDatabase(claim)
    telemetry = WorkerTelemetry()

    await process_run_v1(
        {"job_id": f"run:{run_id}:dispatch:1"},
        {"schema_version": 1, "run_id": str(run_id)},
        database=database,
        provider=DeterministicMockProvider(),
        telemetry=telemetry,
    )

    assert database.failures == []
    assert database.heartbeats == [
        (run_id, claim.attempt_id, claim.lease_token),
    ]
    assert len(database.completions) == 1
    _, attempt_id, lease_token, artifact = database.completions[0]
    assert attempt_id == claim.attempt_id
    assert lease_token == claim.lease_token
    assert artifact["schema_version"] == "1.0.0"
    assert artifact["run_id"] == str(run_id)
    rendered = telemetry.render().decode()
    assert 'simula_worker_jobs_total{outcome="completed"} 1.0' in rendered
    assert 'simula_worker_deterministic_provider_calls_total{outcome="completed"} 1.0' in rendered
    assert "simula_worker_external_provider_calls_total 0.0" in rendered


async def test_worker_discards_work_when_the_current_lease_cannot_heartbeat() -> None:
    run_id, claim = _claimed_run()
    database = RecordingDatabase(claim, heartbeat_result=False)
    provider = RecordingProvider()

    with capture_logs() as logs:
        await process_run_v1(
            {"job_id": f"run:{run_id}:dispatch:1"},
            {"schema_version": 1, "run_id": str(run_id)},
            database=database,
            provider=provider,
        )

    assert database.heartbeats == [(run_id, claim.attempt_id, claim.lease_token)]
    assert provider.requests == []
    assert database.completions == []
    assert database.failures == []
    rejected = next(log for log in logs if log["event"] == "run_execution_lease_rejected")
    assert rejected["checkpoint"] == "before_provider"
    assert rejected["run_id"] == str(run_id)


async def test_worker_records_a_safe_terminal_failure_for_provider_error() -> None:
    run_id, claim = _claimed_run()
    database = RecordingDatabase(claim)
    provider = RecordingProvider()

    await process_run_v1(
        {"job_id": f"run:{run_id}:dispatch:1"},
        {"schema_version": 1, "run_id": str(run_id)},
        database=database,
        provider=provider,
    )

    assert database.completions == []
    assert database.failures == [
        (
            run_id,
            claim.attempt_id,
            claim.lease_token,
            "execution_provider_failure",
            False,
        )
    ]


async def test_worker_defers_only_the_database_authorized_timeout_retry() -> None:
    run_id, claim = _claimed_run()
    database = RecordingDatabase(claim, FailureResolution(state="retrying", retry_after_seconds=5))
    provider = TimeoutProvider()

    with pytest.raises(Retry) as raised:
        await process_run_v1(
            {"job_id": f"run:{run_id}:dispatch:1"},
            {"schema_version": 1, "run_id": str(run_id)},
            database=database,
            provider=provider,
        )

    assert raised.value.defer_score == 5000
    assert database.completions == []
    assert database.failures == [
        (
            run_id,
            claim.attempt_id,
            claim.lease_token,
            "execution_timed_out",
            True,
        )
    ]


@pytest.mark.parametrize(
    ("provider_type", "safe_error_code"),
    [
        (PreflightUnavailableProvider, "execution_provider_preflight_unavailable"),
        (RateLimitedProvider, "execution_rate_limited"),
    ],
)
async def test_worker_defers_only_database_authorized_safe_provider_failures(
    provider_type: type[PreflightUnavailableProvider] | type[RateLimitedProvider],
    safe_error_code: str,
) -> None:
    run_id, claim = _claimed_run()
    database = RecordingDatabase(claim, FailureResolution(state="retrying", retry_after_seconds=5))
    provider = provider_type()

    with pytest.raises(Retry) as raised:
        await process_run_v1(
            {"job_id": f"run:{run_id}:dispatch:1"},
            {"schema_version": 1, "run_id": str(run_id)},
            database=database,
            provider=provider,
        )

    assert raised.value.defer_score == 5000
    assert database.completions == []
    assert database.failures == [
        (run_id, claim.attempt_id, claim.lease_token, safe_error_code, True)
    ]
