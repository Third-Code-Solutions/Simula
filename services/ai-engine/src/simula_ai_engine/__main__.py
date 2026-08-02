"""Run the private behavioral engine without proxy-header trust."""

from __future__ import annotations

import uvicorn
from simula_core.observability import initialize_observability

from simula_ai_engine.config import EngineSettings


def main() -> None:
    observability = initialize_observability("ai-engine")
    settings = EngineSettings.from_environment()
    try:
        uvicorn.run(
            "simula_ai_engine.app:app",
            host="0.0.0.0",  # noqa: S104 - container listener; network publication is deployment-owned.
            port=settings.port,
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
