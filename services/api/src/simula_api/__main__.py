import asyncio
import os

import uvicorn
from simula_core.observability import initialize_observability

from simula_api.logging import configure_logging


def _server_port() -> int:
    raw_port = os.getenv("PORT", "8000")
    if not raw_port.isascii() or not raw_port.isdecimal():
        raise RuntimeError("PORT must be an integer from 1 through 65535")
    port = int(raw_port)
    if port not in range(1, 65_536):
        raise RuntimeError("PORT must be an integer from 1 through 65535")
    return port


def _serve_windows(*, port: int) -> None:
    """Run Uvicorn on a selector loop required by psycopg async on Windows."""
    config = uvicorn.Config(
        "simula_api.app:app",
        host="0.0.0.0",  # noqa: S104 - container listener; publication is deployment-owned.
        port=port,
        access_log=False,
        log_config=None,
        proxy_headers=False,
        server_header=False,
    )
    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
        runner.run(uvicorn.Server(config).serve())


def main() -> None:
    observability = initialize_observability("api")
    configure_logging()
    port = _server_port()
    try:
        if os.name == "nt":
            _serve_windows(port=port)
            return
        uvicorn.run(
            "simula_api.app:app",
            host="0.0.0.0",  # noqa: S104 - container listener; publication is deployment-owned.
            port=port,
            access_log=False,
            log_config=None,
            proxy_headers=False,
            server_header=False,
        )
    except BaseException as error:
        observability.capture_exception(error)
        raise
    finally:
        observability.shutdown()


if __name__ == "__main__":
    main()
