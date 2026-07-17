"""Windows-only integration harness compatibility."""

from __future__ import annotations

import asyncio
import os
import warnings


def pytest_configure() -> None:
    """Make pytest's integration loop match the local API launcher."""
    if os.name != "nt":
        return
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
