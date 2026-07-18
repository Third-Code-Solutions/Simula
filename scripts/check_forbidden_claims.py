"""Reject prohibited product claims from executable and release-facing surfaces."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCANNED_PATHS = (
    ROOT / "README.md",
    ROOT / "apps" / "web" / "src",
    ROOT / "services" / "api" / "src",
    ROOT / "services" / "worker" / "src",
    ROOT / "packages" / "simula-core" / "src",
)
SOURCE_SUFFIXES = {".md", ".py", ".ts", ".tsx"}
FORBIDDEN_CLAIM_PATTERNS = {
    "representative population": re.compile(
        r"(?<!non-)(?<!not )\brepresentative of "
        r"(?:Filipinos|a real population|any real population)\b",
        re.IGNORECASE,
    ),
    "human-research replacement": re.compile(
        r"\b(?:survey|focus[ -]group|panel|fieldwork) replacement\b",
        re.IGNORECASE,
    ),
    "predictive statistics": re.compile(
        r"\b(?:predictive accuracy|calibration|confidence interval|margin of error)\b",
        re.IGNORECASE,
    ),
    "human evidence": re.compile(
        r"\b(?:real participant|real quote|real respondent|observed behavior)\b",
        re.IGNORECASE,
    ),
    "out-of-scope assurance": re.compile(
        r"\b(?:legal compliance|safe use)\b",
        re.IGNORECASE,
    ),
}


def files_to_scan() -> list[Path]:
    files: list[Path] = []
    for path in SCANNED_PATHS:
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            files.extend(
                candidate for candidate in path.rglob("*") if candidate.suffix in SOURCE_SUFFIXES
            )
    return sorted(files)


def main() -> None:
    violations: list[str] = []
    for path in files_to_scan():
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            for label, pattern in FORBIDDEN_CLAIM_PATTERNS.items():
                if pattern.search(line):
                    violations.append(f"{path.relative_to(ROOT)}:{number}: {label}: {line.strip()}")
    if violations:
        raise SystemExit("forbidden product claim(s):\n" + "\n".join(violations))
    print(f"forbidden-claim policy passed: {len(files_to_scan())} files scanned")


if __name__ == "__main__":
    main()
