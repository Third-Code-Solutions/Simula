import asyncio
import os

import uvicorn

from simula_api.logging import configure_logging


def _serve_windows() -> None:
    """Run Uvicorn on a selector loop required by psycopg async on Windows."""
    config = uvicorn.Config(
        "simula_api.app:app",
        host="0.0.0.0",  # noqa: S104 - container listener; publication is deployment-owned.
        port=8000,
        access_log=False,
        log_config=None,
        proxy_headers=False,
        server_header=False,
    )
    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
        runner.run(uvicorn.Server(config).serve())


def main() -> None:
    configure_logging()
    if os.name == "nt":
        _serve_windows()
        return
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
