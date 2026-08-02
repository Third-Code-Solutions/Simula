"""Generate or byte-check pinned Supabase database types from the local stack."""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path
from shutil import which

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "packages" / "contracts" / "src" / "database.ts"
REQUIRED_MARKERS = (
    "export type Database = {",
    "  api: {",
    "  private: {",
    "      organizations: {",
    "      run_outbox: {",
    "      create_organization: {",
)


def generate() -> str:
    pnpm = which("pnpm")
    if pnpm is None:
        raise SystemExit("pnpm executable not found")

    process = subprocess.run(  # noqa: S603 - resolved binary and fixed local-only arguments.
        [
            pnpm,
            "exec",
            "supabase",
            "gen",
            "types",
            "typescript",
            "--local",
            "--schema",
            "api",
            "--schema",
            "private",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
        timeout=60,
    )
    if process.returncode != 0:
        raise SystemExit("local database type generation failed")

    generated = process.stdout.replace("\r\n", "\n").rstrip("\n") + "\n"
    missing = [marker for marker in REQUIRED_MARKERS if marker not in generated]
    if missing:
        raise SystemExit("generated database types are incomplete")
    return generated


def main() -> None:
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--check", action="store_true")
    action.add_argument("--write", action="store_true")
    args = parser.parse_args()

    generated = generate()
    if args.write:
        OUTPUT.write_text(generated, encoding="utf-8", newline="\n")
        return

    if not OUTPUT.is_file() or OUTPUT.read_text(encoding="utf-8") != generated:
        raise SystemExit(f"generated database type drift: {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
