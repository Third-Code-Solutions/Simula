from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest

from scripts.check_secrets import findings_for_text, source_files


def _run_git(*arguments: str | Path) -> None:
    git = shutil.which("git")
    if git is None:
        pytest.skip("Git is required for Git-index scanner tests")
    subprocess.run(  # noqa: S603 -- resolved Git executable with fixed test arguments.
        [git, *(os.fspath(argument) for argument in arguments)],
        check=True,
    )


def _base64url_json(value: dict[str, Any]) -> str:
    encoded = json.dumps(value, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(encoded).decode().rstrip("=")


def test_supabase_secret_api_key_is_detected() -> None:
    credential = "sb_" + "secret_" + ("A" * 32)

    assert findings_for_text(credential) == {"Supabase secret API key"}


def test_supabase_privileged_legacy_jwt_is_detected() -> None:
    credential = ".".join(
        (
            _base64url_json({"alg": "HS256", "typ": "JWT"}),
            _base64url_json({"role": "service_role"}),
            "signaturecanarysignaturecanarysignaturecanary",
        )
    )

    assert findings_for_text(credential) == {"Supabase privileged legacy JWT"}


def test_publishable_key_and_unprivileged_jwt_are_allowed() -> None:
    publishable = "sb_" + "publishable_" + ("A" * 32)
    unprivileged_jwt = ".".join(
        (
            _base64url_json({"alg": "HS256", "typ": "JWT"}),
            _base64url_json({"role": "authenticated"}),
            "signaturecanarysignaturecanarysignaturecanary",
        )
    )

    assert findings_for_text(publishable + "\n" + unprivileged_jwt) == set()


def test_source_files_only_returns_tracked_source_and_configuration(
    tmp_path: Path,
) -> None:
    tracked_source = tmp_path / "tracked.py"
    tracked_config = tmp_path / ".env.example"
    ignored_local_env = tmp_path / ".env"
    untracked_artifact = tmp_path / "generated.json"
    ignored_artifact = tmp_path / "ignored.py"
    credential = "sb_" + "secret_" + ("A" * 32)
    tracked_source.write_text(f"credential = {credential!r}\n", encoding="utf-8")
    tracked_config.write_text(
        f"PUBLIC_VALUE={credential}\n",
        encoding="utf-8",
    )
    ignored_local_env.write_text(f"LOCAL_ONLY={credential}\n", encoding="utf-8")
    untracked_artifact.write_text(
        json.dumps({"credential": credential}),
        encoding="utf-8",
    )
    ignored_artifact.write_text(f"credential = {credential!r}\n", encoding="utf-8")
    (tmp_path / ".gitignore").write_text(".env\nignored.py\n", encoding="utf-8")

    _run_git("init", "--quiet", tmp_path)
    _run_git("-C", tmp_path, "add", "tracked.py", ".env.example", ".gitignore")
    _run_git("-C", tmp_path, "add", "--force", ".env")

    assert [path.relative_to(tmp_path).as_posix() for path in source_files(tmp_path)] == [
        ".env",
        ".env.example",
        ".gitignore",
        "tracked.py",
    ]
    assert {
        path.relative_to(tmp_path).as_posix(): findings_for_text(path.read_text(encoding="utf-8"))
        for path in source_files(tmp_path)
        if findings_for_text(path.read_text(encoding="utf-8"))
    } == {
        ".env": {"Supabase secret API key"},
        ".env.example": {"Supabase secret API key"},
        "tracked.py": {"Supabase secret API key"},
    }
    assert {
        path.relative_to(tmp_path).as_posix()
        for path in source_files(tmp_path, include_working_tree=True)
    } == {".env", ".env.example", ".gitignore", "generated.json", "tracked.py"}
    assert {
        path.relative_to(tmp_path).as_posix(): findings_for_text(path.read_text(encoding="utf-8"))
        for path in source_files(tmp_path, include_working_tree=True)
        if findings_for_text(path.read_text(encoding="utf-8"))
    } == {
        ".env": {"Supabase secret API key"},
        ".env.example": {"Supabase secret API key"},
        "generated.json": {"Supabase secret API key"},
        "tracked.py": {"Supabase secret API key"},
    }


def test_source_files_excludes_tracked_symlinks(tmp_path: Path) -> None:
    target = tmp_path / "untracked-secret.py"
    link = tmp_path / "tracked-link.py"
    target.write_text("print('safe')\n", encoding="utf-8")
    try:
        link.symlink_to(target)
    except OSError:
        pytest.skip("creating a symlink is not permitted on this host")

    _run_git("init", "--quiet", tmp_path)
    _run_git("-C", tmp_path, "add", "tracked-link.py")

    assert source_files(tmp_path) == []
    assert source_files(tmp_path, include_working_tree=True) == [target]


def test_package_exposes_opt_in_working_tree_secret_scan() -> None:
    package = json.loads((Path(__file__).parents[1] / "package.json").read_text())

    assert package["scripts"]["security:secrets"] == (
        "uv run --frozen python -m scripts.check_secrets"
    )
    assert package["scripts"]["security:secrets:working-tree"] == (
        "uv run --frozen python -m scripts.check_secrets --working-tree"
    )
