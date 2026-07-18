from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from simula_core.arq_codec import job_id_for
from simula_core.queue_runtime import QueuePublishAmbiguousError
from simula_worker.database import DispatchClaim
from simula_worker.dispatcher import RunDispatcher
from simula_worker.telemetry import WorkerTelemetry


class RecordingDatabase:
    def __init__(self, claims: list[DispatchClaim], *, poisoned: int = 0) -> None:
        self.claims = claims
        self.poisoned = poisoned
        self.confirmations: list[tuple[UUID, UUID]] = []
        self.dispatch_failures: list[tuple[UUID, UUID, str]] = []
        self.finalized_batch_sizes: list[int] = []
        self.poisoned_batch_sizes: list[int] = []
        self.reconciled_batch_sizes: list[tuple[int, bool]] = []

    async def finalize_requested_cancellations(self, requested_batch_size: int = 10) -> int:
        self.finalized_batch_sizes.append(requested_batch_size)
        return 0

    async def finalize_poisoned_dispatches(self, requested_batch_size: int = 10) -> int:
        self.poisoned_batch_sizes.append(requested_batch_size)
        return self.poisoned

    async def reconcile_stale_dispatches(
        self, requested_batch_size: int = 10, *, force_recovery: bool = False
    ) -> int:
        self.reconciled_batch_sizes.append((requested_batch_size, force_recovery))
        return 0

    async def claim_due_dispatches(self, requested_batch_size: int = 10) -> list[DispatchClaim]:
        assert requested_batch_size == 10
        return self.claims

    async def confirm_dispatch(self, outbox_id: UUID, claim_token: UUID) -> bool:
        self.confirmations.append((outbox_id, claim_token))
        return True

    async def fail_dispatch(self, outbox_id: UUID, claim_token: UUID, safe_error_code: str) -> bool:
        self.dispatch_failures.append((outbox_id, claim_token, safe_error_code))
        return True


class RecordingQueue:
    def __init__(self, *, proves: bool, enqueue_error: Exception | None = None) -> None:
        self.proves = proves
        self.enqueue_error = enqueue_error
        self.enqueued_job_ids: list[str] = []

    async def enqueue(self, intent) -> None:  # type: ignore[no-untyped-def]
        self.enqueued_job_ids.append(intent.job_id)
        if self.enqueue_error is not None:
            raise self.enqueue_error

    async def proves_queued(self, intent) -> bool:  # type: ignore[no-untyped-def]
        return self.proves


def _claim() -> DispatchClaim:
    run_id = UUID("00000000-0000-4000-8000-0000000000c1")
    return DispatchClaim(
        outbox_id=UUID("00000000-0000-4000-8000-0000000000c2"),
        run_id=run_id,
        generation=1,
        job_id=job_id_for(run_id, generation=1),
        claim_token=UUID("00000000-0000-4000-8000-0000000000c3"),
        claim_expires_at=datetime.now(UTC),
    )


async def test_dispatcher_confirms_only_after_queue_proof() -> None:
    claim = _claim()
    database = RecordingDatabase([claim])
    queue = RecordingQueue(proves=True)
    telemetry = WorkerTelemetry()

    result = await RunDispatcher(database, queue, telemetry=telemetry).dispatch_once()

    assert result.claimed == 1
    assert result.confirmed == 1
    assert result.canceled == 0
    assert result.poisoned == 0
    assert result.recovered == 0
    assert database.finalized_batch_sizes == [10]
    assert database.poisoned_batch_sizes == [10]
    assert database.reconciled_batch_sizes == [(10, False)]
    assert database.confirmations == [(claim.outbox_id, claim.claim_token)]
    assert queue.enqueued_job_ids == [claim.job_id]
    rendered = telemetry.render().decode()
    assert 'simula_worker_dispatch_total{outcome="claimed"} 1.0' in rendered
    assert 'simula_worker_dispatch_total{outcome="confirmed"} 1.0' in rendered


async def test_dispatcher_leaves_outbox_unconfirmed_when_enqueue_is_ambiguous() -> None:
    database = RecordingDatabase([_claim()])
    queue = RecordingQueue(
        proves=True,
        enqueue_error=QueuePublishAmbiguousError("redis command timed out"),
    )

    result = await RunDispatcher(database, queue).dispatch_once()

    assert result.claimed == 1
    assert result.confirmed == 0
    assert database.confirmations == []
    assert database.dispatch_failures == []


async def test_dispatcher_leaves_outbox_unconfirmed_when_snapshot_is_not_exact() -> None:
    database = RecordingDatabase([_claim()])
    queue = RecordingQueue(proves=False)

    result = await RunDispatcher(database, queue).dispatch_once()

    assert result.claimed == 1
    assert result.confirmed == 0
    assert database.confirmations == []
    assert database.dispatch_failures == []


async def test_dispatcher_records_definite_publish_failures_for_bounded_retry() -> None:
    claim = _claim()
    database = RecordingDatabase([claim])
    queue = RecordingQueue(proves=True, enqueue_error=RuntimeError("redis refused connection"))

    result = await RunDispatcher(database, queue).dispatch_once()

    assert result.claimed == 1
    assert result.confirmed == 0
    assert database.confirmations == []
    assert database.dispatch_failures == [
        (claim.outbox_id, claim.claim_token, "dispatch_transport_failed")
    ]
