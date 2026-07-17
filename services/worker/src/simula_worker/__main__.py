from __future__ import annotations

import argparse
import asyncio
import json

from simula_core.runtime import RuntimeMetadata

from simula_worker.logging import configure_logging
from simula_worker.main import serve


def main() -> None:
    parser = argparse.ArgumentParser(description="SIMULA payload-inert worker shell")
    parser.add_argument("--check", action="store_true", help="validate the worker import/runtime")
    args = parser.parse_args()
    if args.check:
        metadata = RuntimeMetadata.from_environment(service="worker")
        print(json.dumps({**metadata.model_dump(), "status": "ok"}, sort_keys=True))
        return
    configure_logging()
    asyncio.run(serve())


if __name__ == "__main__":
    main()
