from __future__ import annotations

import asyncio
import multiprocessing
import os
from pathlib import Path
from time import sleep

import pytest
from simula_worker.isolated_evaluation import evaluate_isolated


def _identity(value: int) -> tuple[int, int]:
    return os.getpid(), value


def _block(marker: str) -> None:
    Path(marker).write_text(str(os.getpid()))
    while True:
        sleep(0.05)


def _invalid(_: None) -> None:
    raise ValueError("private-payload-must-not-escape")


def _deadline(_: None) -> None:
    raise TimeoutError("private deadline details")


def _crash(_: None) -> None:
    os._exit(3)


async def test_child_returns_result_and_is_reaped() -> None:
    pid, value = await evaluate_isolated(_identity, 42, timeout_seconds=10)
    assert value == 42
    assert pid != os.getpid()
    assert pid not in {child.pid for child in multiprocessing.active_children()}


async def test_child_validation_does_not_echo_private_inputs() -> None:
    with pytest.raises(ValueError, match=r"^evaluation input failed validation$"):
        await evaluate_isolated(_invalid, None, timeout_seconds=10)


async def test_abrupt_child_exit_is_bounded() -> None:
    with pytest.raises(RuntimeError, match="exited without a result"):
        await asyncio.wait_for(evaluate_isolated(_crash, None, timeout_seconds=10), 15)


@pytest.mark.parametrize("cancel", [False, True])
async def test_blocked_child_is_killed_before_timeout_or_cancellation_returns(
    tmp_path: Path, cancel: bool
) -> None:
    marker = tmp_path / "started"
    task = asyncio.create_task(
        evaluate_isolated(_block, str(marker), timeout_seconds=3 if not cancel else 30)
    )
    async with asyncio.timeout(10):
        while not marker.exists():
            if task.done():
                await task
            await asyncio.sleep(0.01)
    pid = int(marker.read_text())
    if cancel:
        task.cancel()
    with pytest.raises(asyncio.CancelledError if cancel else TimeoutError):
        await asyncio.wait_for(task, 10)
    assert pid not in {child.pid for child in multiprocessing.active_children()}
    # Capacity remains usable after forcibly terminating a stuck evaluator.
    assert (await evaluate_isolated(_identity, 7, timeout_seconds=10))[1] == 7


async def test_child_cooperative_timeout_preserves_terminal_timeout_classification() -> None:
    with pytest.raises(TimeoutError, match=r"^evaluation deadline exceeded$"):
        await evaluate_isolated(_deadline, None, timeout_seconds=10)


@pytest.mark.parametrize("renewal_raises", [False, True])
async def test_lease_loss_reaps_blocked_child_without_a_result(
    tmp_path: Path, renewal_raises: bool
) -> None:
    from simula_worker.isolated_evaluation import EvaluationLeaseLost, evaluate_with_lease

    marker = tmp_path / "lease-child"

    async def renew() -> bool:
        if not marker.exists():
            return True
        if renewal_raises:
            raise ConnectionError("synthetic database interruption")
        return False

    with pytest.raises(EvaluationLeaseLost):
        await asyncio.wait_for(
            evaluate_with_lease(
                _block, str(marker), timeout_seconds=20, renew_lease=renew, heartbeat_seconds=0.05
            ),
            15,
        )
    pid = int(marker.read_text())
    assert pid not in {child.pid for child in multiprocessing.active_children()}
