from __future__ import annotations

from pathlib import Path

from scripts.check_web_bundle_secrets import find_canary_leaks

ROOT = Path(__file__).resolve().parents[1]


def test_bundle_secret_scanner_detects_exact_canary_in_binary_artifact(
    tmp_path: Path,
) -> None:
    canary = b"server-only-canary-0123456789abcdef"
    artifact = tmp_path / "static" / "chunk.js"
    artifact.parent.mkdir()
    artifact.write_bytes(b"prefix:" + canary + b":suffix")

    assert find_canary_leaks([tmp_path], {"SERVER_SECRET": canary}) == [(artifact, "SERVER_SECRET")]


def test_bundle_secret_scanner_accepts_artifacts_without_canaries(tmp_path: Path) -> None:
    artifact = tmp_path / "standalone" / "server.js"
    artifact.parent.mkdir()
    artifact.write_text("safe public bundle", encoding="utf-8")

    assert (
        find_canary_leaks(
            [tmp_path],
            {"SERVER_SECRET": b"server-only-canary-0123456789abcdef"},
        )
        == []
    )


def test_ci_scans_static_standalone_public_and_final_web_image() -> None:
    workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    dockerfile = (ROOT / "apps" / "web" / "Dockerfile").read_text(encoding="utf-8")

    for target in (
        "apps/web/.next/static",
        "apps/web/.next/standalone",
        "apps/web/public",
        "simula-web-image.tar",
    ):
        assert target in workflow
    assert workflow.count("--canary-env SIMULA_BUNDLE_SECRET_CANARY") >= 2
    assert "--mount=type=secret,id=simula_bundle_canary" in dockerfile
