from __future__ import annotations

import asyncio
from collections.abc import Callable, Coroutine
from types import TracebackType
from typing import Any

import pytest
from simula_worker import __main__


def test_windows_worker_uses_a_selector_runner_for_psycopg(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loop_factories: list[Callable[[], asyncio.AbstractEventLoop]] = []

    class FakeRunner:
        def __init__(self, *, loop_factory: Callable[[], asyncio.AbstractEventLoop]) -> None:
            loop_factories.append(loop_factory)

        def __enter__(self) -> FakeRunner:
            return self

        def __exit__(
            self,
            exception_type: type[BaseException] | None,
            exception: BaseException | None,
            traceback: TracebackType | None,
        ) -> None:
            return None

        def run(self, coroutine: Coroutine[Any, Any, Any]) -> None:
            coroutine.close()

    monkeypatch.setattr("simula_worker.__main__.asyncio.Runner", FakeRunner)

    __main__._serve_windows()

    assert loop_factories == [asyncio.SelectorEventLoop]
