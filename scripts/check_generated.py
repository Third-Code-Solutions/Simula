"""Regenerate contracts in isolation and byte-compare committed artifacts."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from shutil import which

from scripts.generate_contracts import generate

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "packages" / "contracts"
FILES = ("openapi.json", "result.schema.json", "src/openapi.ts")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="simula-contracts-") as temporary:
        generated = Path(temporary)
        generate(generated)
        pnpm = which("pnpm")
        if pnpm is None:
            raise SystemExit("pnpm executable not found")
        subprocess.run(  # noqa: S603 - resolved toolchain binary; arguments are fixed paths.
            [
                pnpm,
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
        drift = [
            relative
            for relative in FILES
            if (CONTRACTS / relative).read_bytes() != (generated / relative).read_bytes()
        ]
        if drift:
            raise SystemExit("generated contract drift: " + ", ".join(drift))


if __name__ == "__main__":
    main()
