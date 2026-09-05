from __future__ import annotations

import asyncio
import multiprocessing
import os
import socket
from pathlib import Path
from time import sleep
from uuid import UUID

import httpx
import pytest
import uvicorn
from simula_ai_engine.app import EngineServices, create_app
from simula_ai_engine.config import EngineSettings
from simula_ai_engine.registry import AdmittedBehavioralProvider, BehavioralProviderRegistry
from simula_core.behavioral_demo import authored_demo_behavioral_command
from simula_core.behavioral_engine import (
    AgentDecisionRequest,
    AgentDecisionResponse,
    BehavioralRunResult,
    DeterministicNarrativeSynthesizer,
    DeterministicTieredProvider,
)
from simula_worker.behavioral_engine_client import BehavioralEngineHttpClient

pytestmark = pytest.mark.integration

TOKEN = "t" * 32


async def test_real_private_http_server_executes_one_bound_behavioral_run() -> None:
    app = create_app(
        services=EngineServices(
            settings=EngineSettings(
                environment="test",
                release_sha="a" * 40,
                internal_tokens=(TOKEN,),
                port=8010,
            ),
            registry=BehavioralProviderRegistry.experimental_deterministic_only(),
        )
    )
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    port = listener.getsockname()[1]
    server = uvicorn.Server(
        uvicorn.Config(
            app,
            access_log=False,
            lifespan="on",
            log_config=None,
            loop="asyncio",
        )
    )
    server_task = asyncio.create_task(
        server.serve(sockets=[listener]),
        name="behavioral-engine-integration-server",
    )
    try:
        for _ in range(100):
            if server.started:
                break
            if server_task.done():
                await server_task
            await asyncio.sleep(0.01)
        assert server.started

        command = authored_demo_behavioral_command(
            organization_id=UUID("00000000-0000-4000-8000-000000000001"),
            run_id=UUID("00000000-0000-4000-8000-000000000007"),
            study_id=UUID("00000000-0000-4000-8000-000000000008"),
            variant_key="baseline",
            stimulus="A fictional private HTTP integration message.",
        )

        def execute() -> BehavioralRunResult:
            with BehavioralEngineHttpClient(
                base_url=f"http://127.0.0.1:{port}",
                token=TOKEN,
            ) as client:
                return client.execute(command)

        result = await asyncio.wait_for(asyncio.to_thread(execute), timeout=5)
        assert result.run_id == command.run_id
        assert result.receipt.provider_calls == 10
        assert result.report.validation_label == "experimental"
    finally:
        server.should_exit = True
        await asyncio.wait_for(server_task, timeout=5)
        listener.close()


class _BlockedProvider(DeterministicTieredProvider):
    def __init__(self, marker: Path) -> None:
        self.marker = marker

    def decide(self, request: AgentDecisionRequest) -> AgentDecisionResponse:
        del request
        self.marker.write_text(str(os.getpid()))
        while True:
            sleep(0.05)


async def test_real_client_disconnect_terminates_engine_child_and_recovers_capacity(
    tmp_path: Path,
) -> None:
    marker = tmp_path / "engine-child"
    settings = EngineSettings(
        environment="test", release_sha="a" * 40, internal_tokens=(TOKEN,), port=8010
    )
    services = EngineServices(
        settings=settings,
        registry=BehavioralProviderRegistry(
            (
                AdmittedBehavioralProvider(
                    provider=_BlockedProvider(marker),
                    synthesizer=DeterministicNarrativeSynthesizer(),
                ),
            )
        ),
    )
    app = create_app(services=services)
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, access_log=False, log_config=None, loop="asyncio"))
    server_task = asyncio.create_task(server.serve(sockets=[listener]))
    command = authored_demo_behavioral_command(
        organization_id=UUID("00000000-0000-4000-8000-000000000001"),
        run_id=UUID("00000000-0000-4000-8000-000000000007"),
        study_id=UUID("00000000-0000-4000-8000-000000000008"),
        variant_key="baseline",
        stimulus="A fictional disconnect recovery fixture.",
    )
    try:
        async with asyncio.timeout(10):
            while not server.started:
                if server_task.done():
                    await server_task
                await asyncio.sleep(0.01)
        async with httpx.AsyncClient(timeout=15) as client:
            url = f"http://127.0.0.1:{port}/internal/v1/behavioral-runs:execute"
            headers = {"Authorization": f"Bearer {TOKEN}"}
            execution = asyncio.create_task(
                client.post(url, headers=headers, json=command.model_dump(mode="json"))
            )
            async with asyncio.timeout(10):
                while not marker.exists():
                    if execution.done():
                        pytest.fail(f"provider did not start; HTTP {(await execution).status_code}")
                    await asyncio.sleep(0.01)
            child_pid = int(marker.read_text())
            execution.cancel()
            with pytest.raises(asyncio.CancelledError):
                await execution
            async with asyncio.timeout(5):
                for _ in range(500):
                    if child_pid not in {child.pid for child in multiprocessing.active_children()}:
                        break
                    await asyncio.sleep(0.01)
            assert child_pid not in {child.pid for child in multiprocessing.active_children()}
            app.state.engine_services = EngineServices(
                settings=settings,
                registry=BehavioralProviderRegistry.experimental_deterministic_only(),
            )
            recovered = await client.post(
                url, headers=headers, json=command.model_dump(mode="json")
            )
            assert recovered.status_code == 200
            assert recovered.json()["receipt"]["provider_calls"] == 10
    finally:
        server.should_exit = True
        await asyncio.wait_for(server_task, 10)
        listener.close()
