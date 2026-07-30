"""Regenerate contracts in isolation and byte-compare committed artifacts."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from shutil import which

from scripts.generate_contracts import generate
from scripts.openapi_compatibility import find_breaking_changes

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "packages" / "contracts"
FILES = (
    "behavioral-comparison.schema.json",
    "behavioral-evaluation-report.schema.json",
    "behavioral-report.schema.json",
    "context-graph.schema.json",
    "openapi.json",
    "result.schema.json",
    "src/control-plane.ts",
    "src/openapi.ts",
)
OPENAPI_PATH = "packages/contracts/openapi.json"


def _load_openapi_base() -> dict[str, object]:
    base_ref = os.getenv("SIMULA_OPENAPI_BASE_REF", "HEAD")
    git = which("git")
    if git is None:
        raise SystemExit("git executable not found")
    result = subprocess.run(  # noqa: S603 - fixed git command with explicit revision argument.
        [git, "show", f"{base_ref}:{OPENAPI_PATH}"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    value = json.loads(result.stdout)
    if not isinstance(value, dict):
        raise SystemExit("base OpenAPI document is not an object")
    return value


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="simula-contracts-") as temporary:
        generated = Path(temporary)
        generate(generated)
        corepack = which("corepack")
        if corepack is None:
            raise SystemExit("corepack executable not found")
        subprocess.run(  # noqa: S603 - resolved toolchain binary; fixed workspace command.
            [
                corepack,
                "pnpm@11.13.1",
                "--config.engine-strict=false",
                "--filter",
                "@simula/api",
                "openapi:check",
            ],
            cwd=ROOT,
            check=True,
        )
        subprocess.run(  # noqa: S603 - resolved toolchain binary; arguments are fixed paths.
            [
                corepack,
                "pnpm@11.13.1",
                "--config.engine-strict=false",
                "exec",
                "openapi-typescript",
                str(generated / "openapi.json"),
                "-o",
                str(generated / "src" / "openapi.ts"),
                "--alphabetize",
            ],
            cwd=CONTRACTS,
            check=True,
        )
        subprocess.run(  # noqa: S603 - resolved toolchain binary; arguments are fixed paths.
            [
                corepack,
                "pnpm@11.13.1",
                "--config.engine-strict=false",
                "exec",
                "openapi-typescript",
                str(ROOT / "apps" / "api" / "openapi.json"),
                "-o",
                str(generated / "src" / "control-plane.ts"),
                "--alphabetize",
            ],
            cwd=CONTRACTS,
            check=True,
        )
        drift = [
            relative
            for relative in FILES
            if (CONTRACTS / relative).read_bytes() != (generated / relative).read_bytes()
        ]
        if drift:
            raise SystemExit("generated contract drift: " + ", ".join(drift))
        baseline = _load_openapi_base()
        candidate = json.loads((generated / "openapi.json").read_text(encoding="utf-8"))
        breaking = find_breaking_changes(baseline, candidate)
        if breaking:
            raise SystemExit("breaking OpenAPI changes:\n- " + "\n- ".join(breaking))


if __name__ == "__main__":
    main()
