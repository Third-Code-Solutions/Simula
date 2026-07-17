from simula_core.runtime import RuntimeMetadata


def test_runtime_metadata_uses_safe_defaults(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.delenv("SIMULA_ENVIRONMENT", raising=False)
    monkeypatch.delenv("SIMULA_RELEASE_SHA", raising=False)

    metadata = RuntimeMetadata.from_environment(service="api")

    assert metadata.model_dump() == {
        "environment": "local",
        "release_sha": "dev",
        "service": "api",
    }
