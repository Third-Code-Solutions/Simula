from __future__ import annotations

import asyncio
import multiprocessing
import os
from pathlib import Path
from time import sleep
from types import SimpleNamespace
from typing import cast

import pytest
from fastapi import Request
from simula_ai_engine.app import EngineProblem, _run_request_evaluation


def _blocked(marker: str) -> None:
    scratch = Path(f"{marker}.partial")
    scratch.write_text(str(os.getpid()))
    os.replace(scratch, Path(marker))
    while True:
        sleep(0.05)


class _Request:
    def __init__(self, marker: Path, *, disconnect: bool, slots: int = 1) -> None:
        self.marker = marker
        self.disconnect = disconnect
        self.slots = asyncio.Semaphore(slots)
        self.app = SimpleNamespace(state=SimpleNamespace(execution_slots=self.slots))

    async def is_disconnected(self) -> bool:
        return self.disconnect and self.marker.exists()


@pytest.mark.parametrize("reason", ["disconnect", "deadline", "cancel"])
async def test_engine_reaps_blocked_provider_before_releasing_capacity(
    tmp_path: Path, reason: str
) -> None:
    marker = tmp_path / "provider-started"
    request = _Request(marker, disconnect=reason == "disconnect")
    task = asyncio.create_task(
        _run_request_evaluation(
            cast(Request, request),
            _blocked,
            str(marker),
            timeout_seconds=3 if reason == "deadline" else 30,
        )
    )
    async with asyncio.timeout(30):
        while True:
            try:
                child_pid = int(marker.read_text())
            except OSError, ValueError:
                if task.done():
                    await task
                await asyncio.sleep(0.01)
            else:
                break
    if reason == "cancel":
        task.cancel()
    expected = (
        EngineProblem
        if reason == "disconnect"
        else TimeoutError
        if reason == "deadline"
        else asyncio.CancelledError
    )
    with pytest.raises(expected) as error:
        await asyncio.wait_for(task, 10)
    if reason == "disconnect":
        assert isinstance(error.value, EngineProblem)
        assert error.value.code == "execution_cancelled"
        assert error.value.status == 409
    assert child_pid not in {child.pid for child in multiprocessing.active_children()}
    async with asyncio.timeout(1):
        await request.slots.acquire()
    request.slots.release()


async def test_engine_capacity_rejects_before_starting_another_process(tmp_path: Path) -> None:
    marker = tmp_path / "must-not-start"
    request = _Request(marker, disconnect=False, slots=0)
    before = {child.pid for child in multiprocessing.active_children()}
    with pytest.raises(EngineProblem) as error:
        await _run_request_evaluation(
            cast(Request, request), _blocked, str(marker), timeout_seconds=30
        )
    assert error.value.status == 429
    assert error.value.code == "execution_capacity_exceeded"
    assert not marker.exists()
    assert before == {child.pid for child in multiprocessing.active_children()}


def _value(value: int) -> int:
    return value


async def test_actual_capacity_keeps_siblings_running_and_reuses_reaped_slot(
    tmp_path: Path,
) -> None:
    markers = [tmp_path / f"provider-{index}" for index in range(4)]
    request = _Request(markers[0], disconnect=False, slots=4)
    tasks = [
        asyncio.create_task(
            _run_request_evaluation(
                cast(Request, request), _blocked, str(marker), timeout_seconds=30
            )
        )
        for marker in markers
    ]
    try:
        async with asyncio.timeout(15):
            while not all(marker.exists() for marker in markers):
                for task in tasks:
                    if task.done():
                        await task
                await asyncio.sleep(0.01)
        pids = {int(marker.read_text()) for marker in markers}
        assert len(pids) == 4
        with pytest.raises(EngineProblem) as error:
            await _run_request_evaluation(cast(Request, request), _value, 5, timeout_seconds=10)
        assert error.value.status == 429
        assert pids <= {child.pid for child in multiprocessing.active_children()}
        tasks[0].cancel()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(tasks[0], 5)
        assert int(markers[0].read_text()) not in {
            child.pid for child in multiprocessing.active_children()
        }
        assert all(not task.done() for task in tasks[1:])
        assert (
            await _run_request_evaluation(cast(Request, request), _value, 42, timeout_seconds=10)
            == 42
        )
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    assert not (
        {int(marker.read_text()) for marker in markers}
        & {child.pid for child in multiprocessing.active_children()}
    )
