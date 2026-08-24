"""Fail on high-confidence credential material in repository source files."""

from __future__ import annotations

import argparse
import base64
import binascii
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import cast

ROOT = Path(__file__).resolve().parents[1]
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


def _is_local_environment_file(path: Path) -> bool:
    return path.name == ".env" or (path.name.startswith(".env.") and path.name != ".env.example")


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


def source_files(
    root: Path = ROOT,
    *,
    include_working_tree: bool = False,
) -> list[Path]:
    """Return repository text source/configuration files in stable path order.

    The default release gate scans Git-indexed files only. The opt-in
    working-tree mode includes non-ignored untracked source/configuration files
    while retaining the local environment and symlink safety boundaries.
    """

    def git_files(*arguments: str) -> list[Path]:
        git = shutil.which("git")
        if git is None:
            raise RuntimeError("Git executable not found")
        result = subprocess.run(  # noqa: S603 -- fixed Git query scoped to the repository.
            [git, "-C", os.fspath(root), "ls-files", *arguments, "-z"],
            check=True,
            stdout=subprocess.PIPE,
        ).stdout.split(b"\0")
        return [root / os.fsdecode(item) for item in result if item]

    candidates = [(path, True) for path in git_files("--cached")]
    if include_working_tree:
        candidates.extend((path, False) for path in git_files("--others", "--exclude-standard"))
    return sorted(
        (
            path
            for path, is_tracked in candidates
            if not path.is_symlink()
            and path.is_file()
            and (is_tracked or not _is_local_environment_file(path))
            and (path.suffix.lower() in TEXT_SUFFIXES or path.name.startswith("."))
        ),
        key=lambda path: path.relative_to(root).as_posix(),
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--working-tree",
        action="store_true",
        help="also scan non-ignored untracked source and configuration files",
    )
    arguments = parser.parse_args(argv)
    files = source_files(include_working_tree=arguments.working_tree)
    findings: list[str] = []
    for path in files:
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for label in sorted(findings_for_text(content)):
            findings.append(f"{path.relative_to(ROOT)}: {label}")
    if findings:
        raise SystemExit("credential-like material found:\n" + "\n".join(findings))
    scope = "working-tree" if arguments.working_tree else "tracked"
    print(f"{scope} secret baseline passed: {len(files)} text files scanned")


if __name__ == "__main__":
    main()
