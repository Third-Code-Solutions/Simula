"""Fail when exact server-only canaries leak into web build artifacts."""

from __future__ import annotations

import argparse
import os
import re
from collections.abc import Iterable, Mapping
from pathlib import Path

_CHUNK_SIZE = 64 * 1024
_ENVIRONMENT_NAME = re.compile(r"^[A-Z][A-Z0-9_]{2,127}$")


def _artifact_files(paths: Iterable[Path]) -> list[Path]:
    files: set[Path] = set()
    for path in paths:
        if not path.exists():
            raise ValueError(f"bundle scan target does not exist: {path}")
        if path.is_symlink():
            continue
        if path.is_file():
            files.add(path)
            continue
        for directory, names, filenames in os.walk(path, followlinks=False):
            names[:] = sorted(name for name in names if not (Path(directory) / name).is_symlink())
            for name in sorted(filenames):
                candidate = Path(directory) / name
                if candidate.is_file() and not candidate.is_symlink():
                    files.add(candidate)
    return sorted(files)


def _contains(path: Path, needle: bytes) -> bool:
    overlap = max(len(needle) - 1, 0)
    previous = b""
    with path.open("rb") as artifact:
        while chunk := artifact.read(_CHUNK_SIZE):
            combined = previous + chunk
            if needle in combined:
                return True
            previous = combined[-overlap:] if overlap else b""
    return False


def find_canary_leaks(
    paths: Iterable[Path], canaries: Mapping[str, bytes]
) -> list[tuple[Path, str]]:
    if not canaries or any(len(value) < 16 for value in canaries.values()):
        raise ValueError("bundle canaries must be nonempty and at least 16 bytes")
    return [
        (path, label)
        for path in _artifact_files(paths)
        for label, canary in sorted(canaries.items())
        if _contains(path, canary)
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", action="append", required=True, type=Path)
    parser.add_argument("--canary-env", action="append", required=True)
    arguments = parser.parse_args()

    canaries: dict[str, bytes] = {}
    for name in arguments.canary_env:
        if not _ENVIRONMENT_NAME.fullmatch(name):
            raise SystemExit("invalid canary environment variable name")
        value = os.getenv(name)
        if value is None:
            raise SystemExit(f"required canary environment variable is absent: {name}")
        canaries[name] = value.encode()

    try:
        leaks = find_canary_leaks(arguments.path, canaries)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    if leaks:
        details = "\n".join(f"{path}: leaked {label}" for path, label in leaks)
        raise SystemExit("server-only canary found in web artifact:\n" + details)
    print(f"web bundle secret gate passed: {len(_artifact_files(arguments.path))} files scanned")


if __name__ == "__main__":
    main()
