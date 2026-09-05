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
    Path(marker).write_text(str(os.getpid()))
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
    async with asyncio.timeout(10):
        while not marker.exists():
            if task.done():
                await task
            await asyncio.sleep(0.01)
    child_pid = int(marker.read_text())
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
