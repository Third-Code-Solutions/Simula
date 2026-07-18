from __future__ import annotations

import argparse
import asyncio
import json
import os
import socket
from collections.abc import Iterable
from datetime import UTC, datetime
from uuid import UUID

from simula_core.runtime import RuntimeMetadata
from simula_core.simulation import DeterministicMockProvider, ProviderRequest

from simula_worker.logging import configure_logging
from simula_worker.main import serve


def _serve_windows() -> None:
    """Run psycopg async work on the Windows-compatible selector loop."""

    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
        runner.run(serve())


def _assert_no_egress_interfaces(interfaces: Iterable[tuple[int, str]]) -> tuple[str, ...]:
    names = tuple(sorted(name for _, name in interfaces))
    if names != ("lo",):
        raise RuntimeError("no-egress probe requires an isolated network namespace")
    return names


def _verify_no_egress() -> None:
    """Run the fixed Phase 2 provider only inside a loopback-only namespace."""

    interfaces = _assert_no_egress_interfaces(socket.if_nameindex())
    run_id = UUID("00000000-0000-4000-8000-000000000201")
    result = DeterministicMockProvider().run(
        ProviderRequest(
            request_id=UUID("00000000-0000-4000-8000-000000000203"),
            attempt_id=UUID("00000000-0000-4000-8000-000000000202"),
            run_id=run_id,
            method_version="phase2_demo_v1",
            language="en",
            stimulus_content="A fictional no-egress worker probe.",
            deterministic_seed=7,
            output_schema_version=1,
            frozen_manifest_sha256="a" * 64,
            deadline_at=datetime(2026, 7, 18, tzinfo=UTC),
            cost_ceiling=0,
        )
    )
    if result.run_id != run_id or result.provenance.provider_id != "deterministic_mock":
        raise RuntimeError("no-egress provider probe returned an unexpected contract")
    print(
        json.dumps(
            {
                "network_interfaces": list(interfaces),
                "provider_id": result.provenance.provider_id,
                "status": "no_egress_ok",
            },
            sort_keys=True,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="SIMULA payload-inert worker shell")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="validate the worker import/runtime")
    mode.add_argument(
        "--verify-no-egress",
        action="store_true",
        help="prove the deterministic provider in a network-none container",
    )
    args = parser.parse_args()
    if args.check:
        metadata = RuntimeMetadata.from_environment(service="worker")
        print(json.dumps({**metadata.model_dump(), "status": "ok"}, sort_keys=True))
        return
    if args.verify_no_egress:
        _verify_no_egress()
        return
    configure_logging()
    if os.name == "nt":
        _serve_windows()
        return
    asyncio.run(serve())


if __name__ == "__main__":
    main()
