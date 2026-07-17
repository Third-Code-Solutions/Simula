import asyncio

from simula_core.runtime import RuntimeMetadata
from simula_worker.main import serve


def test_worker_metadata_is_private_service() -> None:
    metadata = RuntimeMetadata.from_environment(service="worker")

    assert metadata.service == "worker"


async def test_worker_shell_is_payload_inert(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    waits = 0

    async def stop_immediately(_: asyncio.Event) -> bool:
        nonlocal waits
        waits += 1
        return True

    monkeypatch.setattr(asyncio.Event, "wait", stop_immediately)

    await serve()

    assert waits == 1
