from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID

import httpx
import pytest
from pydantic import ValidationError
from simula_core.behavioral_demo import authored_demo_behavioral_command
from simula_core.behavioral_engine import (
    BehavioralRunCommand,
    DeterministicNarrativeSynthesizer,
    DeterministicTieredProvider,
    execute_behavioral_run,
)
from simula_core.json_codec import canonical_json_dumps_bounded
from simula_worker.behavioral_engine_client import (
    MAX_COMMAND_BYTES,
    MAX_RESULT_BYTES,
    BehavioralEngineHttpClient,
    BehavioralEngineRateLimitedError,
    BehavioralEngineRejectedError,
    BehavioralEngineUnavailableError,
    BehavioralExecutionReceipt,
    serialize_behavioral_result,
)

TOKEN = "t" * 32
ORGANIZATION_ID = UUID("00000000-0000-4000-8000-000000000001")


def _command() -> BehavioralRunCommand:
    return authored_demo_behavioral_command(
        organization_id=ORGANIZATION_ID,
        run_id=UUID("00000000-0000-4000-8000-000000000007"),
        study_id=UUID("00000000-0000-4000-8000-000000000008"),
        variant_key="baseline",
        stimulus="A fictional campaign message.",
    )


def _result_json() -> dict[str, object]:
    command = _command()
    result = execute_behavioral_run(
        command,
        provider=DeterministicTieredProvider(),
        synthesizer=DeterministicNarrativeSynthesizer(),
    )
    return result.model_dump(mode="json")


def _different_result_json() -> dict[str, object]:
    command = authored_demo_behavioral_command(
        organization_id=ORGANIZATION_ID,
        run_id=UUID("00000000-0000-4000-8000-000000000099"),
        study_id=UUID("00000000-0000-4000-8000-000000000008"),
        variant_key="baseline",
        stimulus="A different fictional campaign message.",
    )
    result = execute_behavioral_run(
        command,
        provider=DeterministicTieredProvider(),
        synthesizer=DeterministicNarrativeSynthesizer(),
    )
    return result.model_dump(mode="json")


def test_private_engine_client_sends_exact_minimized_request_and_validates_result() -> None:
    command = _command()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url == httpx.URL("http://127.0.0.1:8010/internal/v1/behavioral-runs:execute")
        assert request.headers["authorization"] == f"Bearer {TOKEN}"
        assert request.headers["content-type"] == "application/json"
        assert request.headers["accept"] == "application/json"
        assert request.content == canonical_json_dumps_bounded(
            command.model_dump(mode="json"),
            maximum_bytes=MAX_COMMAND_BYTES,
        )
        return httpx.Response(200, json=_result_json())

    with BehavioralEngineHttpClient(
        base_url="http://127.0.0.1:8010",
        token=TOKEN,
        transport=httpx.MockTransport(handler),
    ) as client:
        result = client.execute(command)

    assert result.run_id == command.run_id
    assert result.receipt.provider == command.provider


def test_private_engine_client_rejects_a_valid_result_for_another_command() -> None:
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(200, json=_different_result_json())
    )

    with BehavioralEngineHttpClient(
        base_url="http://127.0.0.1:8010",
        token=TOKEN,
        transport=transport,
    ) as client:
        with pytest.raises(BehavioralEngineUnavailableError, match="binding"):
            client.execute(_command())


def test_behavioral_result_serialization_binds_exact_bytes_to_attempt() -> None:
    result = execute_behavioral_run(
        _command(),
        provider=DeterministicTieredProvider(),
        synthesizer=DeterministicNarrativeSynthesizer(),
    )
    started_at = datetime(2026, 7, 29, tzinfo=UTC)
    artifact, receipt = serialize_behavioral_result(
        result,
        attempt_id=UUID("00000000-0000-4000-8000-000000000009"),
        started_at=started_at,
        ended_at=started_at + timedelta(seconds=1),
    )

    assert receipt.run_id == result.run_id
    assert receipt.request_id == receipt.attempt_id
    assert receipt.artifact_sha256 == sha256(artifact).hexdigest()
    assert len(artifact) <= MAX_RESULT_BYTES


@pytest.mark.parametrize(
    ("started_at", "ended_at"),
    (
        (
            datetime(2026, 7, 29),
            datetime(2026, 7, 29) + timedelta(seconds=1),
        ),
        (
            datetime(2026, 7, 29, tzinfo=UTC),
            datetime(2026, 7, 29, tzinfo=UTC) - timedelta(seconds=1),
        ),
        (
            datetime(2026, 7, 29, tzinfo=UTC),
            datetime(2026, 7, 29, tzinfo=UTC) + timedelta(seconds=301),
        ),
    ),
)
def test_behavioral_execution_receipt_rejects_unsafe_windows(
    started_at: datetime,
    ended_at: datetime,
) -> None:
    with pytest.raises(ValidationError, match="execution receipt"):
        BehavioralExecutionReceipt(
            request_id=UUID("00000000-0000-4000-8000-000000000009"),
            attempt_id=UUID("00000000-0000-4000-8000-000000000009"),
            run_id=_command().run_id,
            started_at=started_at,
            ended_at=ended_at,
            artifact_sha256="a" * 64,
        )


@pytest.mark.parametrize(
    ("status", "error_type"),
    (
        (307, BehavioralEngineUnavailableError),
        (429, BehavioralEngineRateLimitedError),
        (422, BehavioralEngineRejectedError),
        (503, BehavioralEngineUnavailableError),
    ),
)
def test_private_engine_client_never_redirects_or_silently_falls_back(
    status: int,
    error_type: type[Exception],
) -> None:
    transport = httpx.MockTransport(lambda _request: httpx.Response(status))

    with BehavioralEngineHttpClient(
        base_url="http://127.0.0.1:8010",
        token=TOKEN,
        transport=transport,
    ) as client:
        with pytest.raises(error_type):
            client.execute(_command())


@pytest.mark.parametrize(
    "response",
    (
        httpx.Response(200, text="not-json", headers={"Content-Type": "application/json"}),
        httpx.Response(
            200,
            content=b"",
            headers={
                "Content-Encoding": "gzip",
                "Content-Type": "application/json",
            },
        ),
        httpx.Response(200, json={}, headers={"Content-Type": "text/plain"}),
        httpx.Response(
            200,
            content=b"{}",
            headers={
                "Content-Type": "application/json",
                "Content-Length": str(MAX_RESULT_BYTES + 1),
            },
        ),
    ),
)
def test_private_engine_client_rejects_unsafe_response_boundaries(
    response: httpx.Response,
) -> None:
    transport = httpx.MockTransport(lambda _request: response)

    with BehavioralEngineHttpClient(
        base_url="http://127.0.0.1:8010",
        token=TOKEN,
        transport=transport,
    ) as client:
        with pytest.raises(BehavioralEngineUnavailableError):
            client.execute(_command())


@pytest.mark.parametrize("stall", [False, True])
async def test_spawned_http_client_has_a_total_deadline_and_preserves_binding(stall: bool) -> None:
    import asyncio
    import json
    import threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from secrets import token_urlsafe

    from simula_worker.isolated_evaluation import evaluate_isolated

    stop = threading.Event()
    accepted = threading.Event()
    payload = json.dumps(_result_json()).encode()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, _format: str, *args: object) -> None:
            pass

        def do_POST(self) -> None:
            self.rfile.read(int(self.headers["Content-Length"]))
            accepted.set()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(1_000_000 if stall else len(payload)))
            self.end_headers()
            try:
                if stall:
                    while not stop.wait(0.05):
                        self.wfile.write(b" ")
                        self.wfile.flush()
                else:
                    self.wfile.write(payload)
            except BrokenPipeError, ConnectionResetError, ConnectionAbortedError:
                pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with BehavioralEngineHttpClient(
            base_url=f"http://127.0.0.1:{server.server_port}", token=token_urlsafe(32)
        ) as client:
            task = evaluate_isolated(client.execute, _command(), timeout_seconds=3 if stall else 10)
            if stall:
                with pytest.raises(TimeoutError):
                    await asyncio.wait_for(task, 10)
            else:
                result = await asyncio.wait_for(task, 15)
                assert result.run_id == _command().run_id
                assert result.model_dump(mode="json") == _result_json()
        assert accepted.is_set()
    finally:
        stop.set()
        await asyncio.to_thread(server.shutdown)
        server.server_close()
        thread.join(timeout=2)
