from __future__ import annotations

import asyncio
import os
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

    def run(app: str, **kwargs: Any) -> None:
        invocation["app"] = app
        invocation.update(kwargs)

    monkeypatch.setattr(__main__, "configure_logging", configure_logging)
    monkeypatch.setattr("simula_api.__main__.uvicorn.run", run)

    __main__.main()

    assert configured is True
    assert invocation["app"] == "simula_api.app:app"
    assert invocation["access_log"] is False
    assert invocation["log_config"] is None
    assert invocation["proxy_headers"] is False
    assert invocation["server_header"] is False


@pytest.mark.skipif(os.name != "nt", reason="Windows event-loop compatibility")
def test_main_configures_selector_event_loop_for_psycopg(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configured: list[object] = []

    monkeypatch.setattr(
        "simula_api.__main__.asyncio.set_event_loop_policy",
        configured.append,
    )

    __main__._configure_event_loop_policy()

    assert len(configured) == 1
    assert configured[0].__class__.__name__.endswith("WindowsSelectorEventLoopPolicy")
