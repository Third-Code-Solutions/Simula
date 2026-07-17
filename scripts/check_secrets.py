"""Fail on high-confidence credential material in repository source files."""

from __future__ import annotations

import base64
import binascii
import json
import os
import re
from pathlib import Path
from typing import cast

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRECTORIES = {
    ".git",
    ".mypy_cache",
    ".next",
    ".pnpm-store",
    ".pytest_cache",
    ".ruff_cache",
    ".supabase",
    ".turbo",
    ".venv",
    "node_modules",
}
TEXT_SUFFIXES = {
    ".css",
    ".dockerignore",
    ".example",
    ".gitignore",
    ".html",
    ".ini",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".npmrc",
    ".py",
    ".sql",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}
PATTERNS = {
    "AWS access key": re.compile(r"AKIA[0-9A-Z]{16}"),
    "GitHub token": re.compile(r"gh[pousr]_[A-Za-z0-9]{36,255}"),
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "Slack token": re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    "Supabase secret API key": re.compile(r"(?<![A-Za-z0-9_-])sb_secret_[A-Za-z0-9_-]{20,}"),
}
JWT_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{10,2048})\.([A-Za-z0-9_-]{10,4096})\."
    r"([A-Za-z0-9_-]{10,2048})(?![A-Za-z0-9_-])"
)
PRIVILEGED_SUPABASE_ROLES = {"service_role", "supabase_admin"}


def _decode_jwt_payload(segment: str) -> object | None:
    padding = "=" * (-len(segment) % 4)
    try:
        payload = base64.urlsafe_b64decode(segment + padding).decode("utf-8")
        return cast(object, json.loads(payload))
    except binascii.Error, UnicodeDecodeError, json.JSONDecodeError, ValueError:
        return None


def findings_for_text(content: str) -> set[str]:
    findings = {label for label, pattern in PATTERNS.items() if pattern.search(content)}
    for match in JWT_PATTERN.finditer(content):
        payload = _decode_jwt_payload(match.group(2))
        if isinstance(payload, dict) and payload.get("role") in PRIVILEGED_SUPABASE_ROLES:
            findings.add("Supabase privileged legacy JWT")
    return findings


def source_files() -> list[Path]:
    result: list[Path] = []
    for directory, names, files in os.walk(ROOT):
        names[:] = sorted(name for name in names if name not in SKIP_DIRECTORIES)
        base = Path(directory)
        for name in sorted(files):
            path = base / name
            if path.suffix.lower() in TEXT_SUFFIXES or name.startswith("."):
                result.append(path)
    return result


def main() -> None:
    findings: list[str] = []
    for path in source_files():
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for label in sorted(findings_for_text(content)):
            findings.append(f"{path.relative_to(ROOT)}: {label}")
    if findings:
        raise SystemExit("credential-like material found:\n" + "\n".join(findings))
    print(f"secret baseline passed: {len(source_files())} text files scanned")


if __name__ == "__main__":
    main()
