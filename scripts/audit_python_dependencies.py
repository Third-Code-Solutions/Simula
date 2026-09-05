from __future__ import annotations

import importlib
import importlib.metadata
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FALLBACK_PYTHON = "3.12"


def _run(command: list[str]) -> int:
    # Commands are fixed below; only tool-generated temporary paths and a
    # package version read from the frozen environment are interpolated.
    return subprocess.run(command, cwd=ROOT, check=False).returncode  # noqa: S603


def _uv_executable() -> str:
    # uv exports its own absolute executable path to child processes. Reuse it
    # so an incompatible ambient uv earlier on PATH cannot alter the audit.
    return os.environ.get("UV", "uv")


def main() -> int:
    try:
        venv_module = importlib.import_module("venv")
    except ModuleNotFoundError as error:
        if error.name != "venv":
            raise
        venv_module = None
    if venv_module is not None and hasattr(venv_module, "EnvBuilder"):
        return _run([sys.executable, "-m", "pip_audit", "--skip-editable"])

    # CPython's Windows embeddable distribution intentionally omits the venv
    # implementation imported by pip-audit. Audit the exact, hashed uv export
    # without dependency resolution in an isolated full CPython tool runtime.
    pip_audit_version = importlib.metadata.version("pip-audit")
    uv_executable = _uv_executable()
    with tempfile.TemporaryDirectory(prefix="simula-sca-") as directory:
        requirements = Path(directory) / "requirements.txt"
        export_status = _run(
            [
                uv_executable,
                "export",
                "--quiet",
                "--frozen",
                "--all-packages",
                "--all-groups",
                "--no-emit-workspace",
                "--no-emit-local",
                "--output-file",
                str(requirements),
            ]
        )
        if export_status != 0:
            return export_status

        return _run(
            [
                uv_executable,
                "run",
                "--quiet",
                "--no-project",
                "--isolated",
                "--python",
                FALLBACK_PYTHON,
                "--with",
                f"pip-audit=={pip_audit_version}",
                "--",
                "pip-audit",
                "--requirement",
                str(requirements),
                "--no-deps",
                "--disable-pip",
            ]
        )


if __name__ == "__main__":
    raise SystemExit(main())
