from __future__ import annotations

import asyncio
import threading
from collections.abc import Mapping
from uuid import UUID

import pytest
import simula_worker.campaign_evidence as campaign_evidence
from simula_worker.database import CampaignEvidenceClaim


def _claim() -> CampaignEvidenceClaim:
    return CampaignEvidenceClaim(
        evidence_id=UUID("65000000-0000-4000-8000-000000000001"),
        kind="survey_calibration",
        request={},
        secret_payload=None,
        lease_token=UUID("65000000-0000-4000-8000-000000000002"),
        attempt_count=1,
    )


class _Database:
    def __init__(self, progress_results: list[bool] | None = None) -> None:
        self.progress_results = list(progress_results or [])
        self.progress: list[tuple[str, int]] = []
        self.completed: Mapping[str, object] | None = None
        self.failed: list[tuple[str, bool]] = []
        self.claim_sizes: list[int] = []

    async def expire_campaign_evidence_runs(self, requested_batch_size: int = 50) -> int:
        del requested_batch_size
        return 0

    async def claim_campaign_evidence_runs(
        self, requested_batch_size: int = 5
    ) -> list[CampaignEvidenceClaim]:
        self.claim_sizes.append(requested_batch_size)
        return []

    async def update_campaign_evidence_progress(
        self,
        evidence_id: UUID,
        lease_token: UUID,
        stage: str,
        progress: int,
        message: str,
    ) -> bool:
        del evidence_id, lease_token, message
        self.progress.append((stage, progress))
        return self.progress_results.pop(0) if self.progress_results else True

    async def finalize_canceled_campaign_evidence_run(
        self, evidence_id: UUID, lease_token: UUID
    ) -> bool:
        del evidence_id, lease_token
        return False

    async def complete_campaign_evidence_run(
        self,
        evidence_id: UUID,
        lease_token: UUID,
        result: Mapping[str, object],
    ) -> bool:
        del evidence_id, lease_token
        self.completed = result
        return True

    async def fail_campaign_evidence_run(
        self,
        evidence_id: UUID,
        lease_token: UUID,
        error_code: str,
        error_detail: str,
        retryable: bool,
    ) -> str:
        del evidence_id, lease_token, error_detail
        self.failed.append((error_code, retryable))
        return "failed"


async def test_campaign_evidence_evaluation_runs_off_the_asyncio_event_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    event_loop_thread = threading.get_ident()
    evaluator_threads: list[int] = []

    def evaluate(claim: CampaignEvidenceClaim) -> Mapping[str, object]:
        del claim
        evaluator_threads.append(threading.get_ident())
        return {"status": "ok"}

    monkeypatch.setattr(campaign_evidence, "evaluate_campaign_evidence_claim", evaluate)
    database = _Database()

    state = await campaign_evidence.process_campaign_evidence_claim(database, _claim())

    assert state == "completed"
    assert evaluator_threads and evaluator_threads[0] != event_loop_thread
    assert database.completed == {"status": "ok"}


async def test_campaign_evidence_heartbeat_discards_result_after_lease_loss(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    evaluation_started = threading.Event()
    release_evaluation = threading.Event()

    def evaluate(claim: CampaignEvidenceClaim) -> Mapping[str, object]:
        del claim
        evaluation_started.set()
        if not release_evaluation.wait(timeout=2):
            raise RuntimeError("test evaluation was not released")
        return {"status": "must-not-persist"}

    monkeypatch.setattr(campaign_evidence, "evaluate_campaign_evidence_claim", evaluate)
    database = _Database(progress_results=[True, True, False])

    processing = asyncio.create_task(
        campaign_evidence.process_campaign_evidence_claim(
            database,
            _claim(),
            heartbeat_seconds=0.01,
        )
    )
    for _ in range(100):
        if evaluation_started.is_set():
            break
        await asyncio.sleep(0.001)
    assert evaluation_started.is_set()
    await asyncio.sleep(0.03)
    release_evaluation.set()

    state = await processing

    assert state == "stale"
    assert database.progress[:3] == [
        ("validating", 15),
        ("evaluating", 55),
        ("evaluating", 55),
    ]
    assert database.completed is None
    assert database.failed == []


async def test_campaign_evidence_cancellation_keeps_heartbeat_until_thread_exits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    evaluation_started = threading.Event()
    release_evaluation = threading.Event()

    def evaluate(claim: CampaignEvidenceClaim) -> Mapping[str, object]:
        del claim
        evaluation_started.set()
        if not release_evaluation.wait(timeout=2):
            raise RuntimeError("test evaluation was not released")
        return {"status": "must-not-persist"}

    monkeypatch.setattr(campaign_evidence, "evaluate_campaign_evidence_claim", evaluate)
    database = _Database()
    processing = asyncio.create_task(
        campaign_evidence.process_campaign_evidence_claim(
            database,
            _claim(),
            heartbeat_seconds=0.01,
        )
    )
    try:
        for _ in range(100):
            if evaluation_started.is_set() and len(database.progress) >= 2:
                break
            await asyncio.sleep(0.001)
        assert evaluation_started.is_set()
        assert len(database.progress) >= 2
        heartbeats_before_cancel = len(database.progress)

        processing.cancel()
        await asyncio.sleep(0.03)

        assert not processing.done()
        assert len(database.progress) > heartbeats_before_cancel
    finally:
        release_evaluation.set()

    with pytest.raises(asyncio.CancelledError):
        await processing
    assert database.completed is None
    assert database.failed == []


async def test_campaign_evidence_loop_claims_one_lease_at_a_time() -> None:
    stop = asyncio.Event()

    class _LoopDatabase(_Database):
        async def claim_campaign_evidence_runs(
            self, requested_batch_size: int = 5
        ) -> list[CampaignEvidenceClaim]:
            self.claim_sizes.append(requested_batch_size)
            stop.set()
            return []

    database = _LoopDatabase()

    await campaign_evidence.campaign_evidence_loop(stop, database, poll_seconds=0.001)

    assert database.claim_sizes == [1]


def test_production_campaign_evidence_worker_rejects_unbound_payloads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "production")

    with pytest.raises(ValueError, match="immutable registry binding"):
        campaign_evidence.evaluate_campaign_evidence_claim(_claim())


@pytest.mark.parametrize("failure", ["first_write", "cancel_finalize", "failure_write"])
async def test_campaign_evidence_initial_database_failure_is_contained(
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    database = _Database()

    async def progress(*args: object) -> bool:
        if failure == "cancel_finalize":
            return False
        raise ConnectionError("synthetic database interruption")

    async def fail(*args: object) -> str:
        raise ConnectionError("synthetic unavailable persistence")

    async def finalize(*args: object) -> bool:
        raise ConnectionError("synthetic cancellation persistence interruption")

    monkeypatch.setattr(database, "update_campaign_evidence_progress", progress)
    monkeypatch.setattr(database, "finalize_canceled_campaign_evidence_run", finalize)
    if failure == "failure_write":
        monkeypatch.setattr(database, "fail_campaign_evidence_run", fail)
    state = await campaign_evidence.process_campaign_evidence_claim(database, _claim())
    assert state == ("failure_persist_failed" if failure == "failure_write" else "failed")
    assert database.completed is None
    if failure != "failure_write":
        assert database.failed == [("evidence_worker_error", True)]
