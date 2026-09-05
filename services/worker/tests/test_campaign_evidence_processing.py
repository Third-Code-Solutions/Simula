from __future__ import annotations

import asyncio
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


async def test_campaign_evidence_evaluation_uses_isolated_boundary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def evaluate(
        function: object, claim: object, *, timeout_seconds: float
    ) -> Mapping[str, object]:
        assert function is campaign_evidence.evaluate_campaign_evidence_claim
        assert claim == _claim()
        assert timeout_seconds == 600.0
        return {"status": "ok"}

    monkeypatch.setattr(campaign_evidence, "evaluate_isolated", evaluate)
    database = _Database()
    assert (
        await campaign_evidence.process_campaign_evidence_claim(database, _claim()) == "completed"
    )
    assert database.completed == {"status": "ok"}


async def test_campaign_evidence_heartbeat_terminates_evaluation_after_lease_loss(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    terminated = asyncio.Event()

    async def evaluate(
        function: object, claim: object, *, timeout_seconds: float
    ) -> Mapping[str, object]:
        del function, claim, timeout_seconds
        try:
            await asyncio.Event().wait()
            return {}
        finally:
            terminated.set()

    monkeypatch.setattr(campaign_evidence, "evaluate_isolated", evaluate)
    database = _Database(progress_results=[True, True, False])
    state = await asyncio.wait_for(
        campaign_evidence.process_campaign_evidence_claim(
            database, _claim(), heartbeat_seconds=0.01
        ),
        1.0,
    )
    assert state == "stale"
    assert terminated.is_set()
    assert database.completed is None
    assert database.failed == []


async def test_campaign_evidence_cancellation_reaps_evaluator_before_returning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    started = asyncio.Event()
    terminated = asyncio.Event()

    async def evaluate(
        function: object, claim: object, *, timeout_seconds: float
    ) -> Mapping[str, object]:
        del function, claim, timeout_seconds
        started.set()
        try:
            await asyncio.Event().wait()
            return {}
        finally:
            terminated.set()

    monkeypatch.setattr(campaign_evidence, "evaluate_isolated", evaluate)
    database = _Database()
    processing = asyncio.create_task(
        campaign_evidence.process_campaign_evidence_claim(
            database, _claim(), heartbeat_seconds=0.01
        )
    )
    await asyncio.wait_for(started.wait(), 1.0)
    processing.cancel()
    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(processing, 1.0)
    assert terminated.is_set()
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


async def test_campaign_evidence_hard_timeout_is_terminal_and_does_not_persist_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def expired(
        function: object, claim: object, *, timeout_seconds: float
    ) -> Mapping[str, object]:
        del function, claim, timeout_seconds
        raise TimeoutError

    monkeypatch.setattr(campaign_evidence, "evaluate_isolated", expired)
    database = _Database()
    assert await campaign_evidence.process_campaign_evidence_claim(database, _claim()) == "failed"
    assert database.failed == [("evidence_timeout", False)]
    assert database.completed is None
