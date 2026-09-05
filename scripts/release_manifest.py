"""Bind deployable source and migration/configuration inputs inside a signed release."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
from pathlib import Path
from shutil import which

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "kurtgav/Simula"
WORKFLOW = ".github/workflows/release.yml"


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def create_manifest(destination: Path) -> dict[str, object]:
    sha = os.environ["GITHUB_SHA"]
    ref = os.environ["GITHUB_REF"]
    run_id = os.environ["GITHUB_RUN_ID"]
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("invalid release SHA")
    if not re.fullmatch(r"refs/tags/v[A-Za-z0-9._-]+", ref) or not run_id.isdigit():
        raise ValueError("release requires an immutable version tag and run ID")
    if os.environ.get("GITHUB_REPOSITORY") != REPOSITORY:
        raise ValueError("unexpected release repository")
    git = which("git")
    if git is None:
        raise ValueError("git is required")
    head = subprocess.check_output([git, "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()  # noqa: S603
    if head != sha:
        raise ValueError("checkout differs from release source")
    destination.mkdir(parents=True, exist_ok=True)
    source = destination / "source.tar"
    subprocess.run(  # noqa: S603 - resolved git and fixed archive arguments.
        [git, "archive", "--format=tar", f"--output={source}", sha], cwd=ROOT, check=True
    )
    migrations = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    inputs = [ROOT / "pnpm-lock.yaml", ROOT / "uv.lock", *ROOT.glob("railway.*.json")]
    manifest: dict[str, object] = {
        "version": 1,
        "repository": REPOSITORY,
        "workflow": WORKFLOW,
        "sha": sha,
        "ref": ref,
        "run_id": run_id,
        "source_sha256": digest(source),
        "migration_head": migrations[-1].name.split("_")[0],
        "migrations": {p.name: digest(p) for p in migrations},
        "build_inputs": {p.relative_to(ROOT).as_posix(): digest(p) for p in sorted(inputs)},
        "deployment_mode": "provider-build-from-verified-source",
    }
    (destination / "promotion.json").write_text(
        json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


if __name__ == "__main__":
    create_manifest(ROOT / "release/stage")
