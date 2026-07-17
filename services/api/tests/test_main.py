from __future__ import annotations

import asyncio
import os
from collections.abc import Callable, Coroutine
from types import TracebackType
from typing import Any

import pytest
from simula_api import __main__


def test_uvicorn_access_log_is_disabled_and_root_logging_is_preserved(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configured = False
    invocation: dict[str, Any] = {}

    def configure_logging() -> None:
        nonlocal configured
        configured = True

    def run(*args: Any, **kwargs: Any) -> None:
        invocation["args"] = args
        invocation.update(kwargs)

    monkeypatch.setattr(__main__, "configure_logging", configure_logging)
    if os.name == "nt":
        monkeypatch.setattr(__main__, "_serve_windows", run)
    else:
        monkeypatch.setattr("simula_api.__main__.uvicorn.run", run)

    __main__.main()

    assert configured is True
    if os.name == "nt":
        assert invocation["args"] == ()
    else:
        assert invocation["args"] == ("simula_api.app:app",)
        assert invocation["access_log"] is False
        assert invocation["log_config"] is None
        assert invocation["proxy_headers"] is False
        assert invocation["server_header"] is False


@pytest.mark.skipif(os.name != "nt", reason="Windows event-loop compatibility")
def test_windows_server_uses_a_selector_runner_for_psycopg(
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

    monkeypatch.setattr("simula_api.__main__.asyncio.Runner", FakeRunner)

    __main__._serve_windows()

    assert loop_factories == [asyncio.SelectorEventLoop]
