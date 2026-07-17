import asyncio
import os
import warnings

import uvicorn

from simula_api.logging import configure_logging


def _configure_event_loop_policy() -> None:
    """Use the psycopg-compatible selector loop for local Windows execution."""
    if os.name != "nt":
        return
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def main() -> None:
    _configure_event_loop_policy()
    configure_logging()
    uvicorn.run(
        "simula_api.app:app",
        host="0.0.0.0",  # noqa: S104 - container listener; publication is deployment-owned.
        port=8000,
        access_log=False,
        log_config=None,
        proxy_headers=False,
        server_header=False,
    )


if __name__ == "__main__":
    main()
