import venv

import pytest

from scripts import audit_python_dependencies


def test_embedded_python_fallback_audits_a_frozen_export(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    commands: list[list[str]] = []

    def record_command(command: list[str]) -> int:
        commands.append(command)
        return 0

    monkeypatch.delattr(venv, "EnvBuilder", raising=False)
    monkeypatch.setenv("UV", "/toolchains/uv-0.11.19/uv")
    monkeypatch.setattr(
        audit_python_dependencies,
        "_run",
        record_command,
    )

    assert audit_python_dependencies.main() == 0
    assert commands[0][0:4] == [
        "/toolchains/uv-0.11.19/uv",
        "export",
        "--quiet",
        "--frozen",
    ]
    assert "--all-packages" in commands[0]
    assert "--all-groups" in commands[0]
    assert commands[1][0:5] == [
        "/toolchains/uv-0.11.19/uv",
        "run",
        "--quiet",
        "--no-project",
        "--isolated",
    ]
    assert "--no-deps" in commands[1]
    assert "--disable-pip" in commands[1]
