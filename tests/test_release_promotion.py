"""Reject mismatched, tampered, or unsafe release inputs before provider calls."""

from __future__ import annotations

import hashlib
import io
import json
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path
from typing import Any

import pytest

from scripts import promote_release as promotion
from scripts.release_manifest import REPOSITORY, WORKFLOW

SHA = "a" * 40
REF = "refs/tags/v1.0.0-test"


def test_cleanup_lock_preserves_original_promotion_error(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    source = tmp_path / "source"
    source.mkdir()
    plan = tmp_path / "plan.json"
    plan.write_text("{}", encoding="utf-8")
    original_error = ValueError("vercel deploy failed (exit 1)")
    cleanup_calls: list[bool] = []

    def locked_cleanup(path: str, ignore_errors: bool = False, **kwargs: Any) -> None:
        assert Path(path) == source
        cleanup_calls.append(ignore_errors)
        if not ignore_errors:
            raise PermissionError(32, "Synthetic Windows file lock")

    def failed_verification(*args: Any, **kwargs: Any) -> None:
        raise original_error

    monkeypatch.setattr(tempfile, "mkdtemp", lambda *args, **kwargs: str(source))
    monkeypatch.setattr(tempfile.TemporaryDirectory, "_rmtree", staticmethod(locked_cleanup))
    monkeypatch.setattr(promotion, "verify_release", failed_verification)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "promote_release",
            "--artifact-directory",
            str(tmp_path),
            "--sha",
            SHA,
            "--ref",
            REF,
            "--run-id",
            "123",
            "--plan",
            str(plan),
            "--receipt",
            str(tmp_path / "receipt.json"),
        ],
    )
    with pytest.raises(ValueError) as raised:
        promotion.main()
    assert raised.value is original_error
    assert cleanup_calls == [True]


def test_vercel_command_cannot_inherit_a_different_project(monkeypatch: pytest.MonkeyPatch) -> None:
    identity_keys = ("VERCEL_ORG_ID", "VERCEL_PROJECT_ID", "NOW_ORG_ID", "NOW_PROJECT_ID")
    for key in identity_keys:
        monkeypatch.setenv(key, "unreviewed-target")
    monkeypatch.setenv("PATH", "retained-path")
    monkeypatch.setattr(promotion, "which", lambda _: "vercel.exe")
    captured: dict[str, Any] = {}

    def run(arguments: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        captured.update(kwargs)
        return subprocess.CompletedProcess(arguments, 0, "{}", "")

    monkeypatch.setattr(subprocess, "run", run)
    assert promotion.command(["vercel", "deploy", "--project", "prj_reviewed"]) == "{}"
    assert all(key not in captured["env"] for key in identity_keys)
    assert captured["env"]["PATH"] == "retained-path"


def archive_entry(archive: tarfile.TarFile, name: str, content: bytes) -> None:
    entry = tarfile.TarInfo(name)
    entry.size = len(content)
    archive.addfile(entry, io.BytesIO(content))


def fixture_bundle(path: Path, *, unsafe: bool = False, tamper: bool = False) -> Path:
    source = io.BytesIO()
    migration = b"select 1;"
    with tarfile.open(fileobj=source, mode="w") as archive:
        archive_entry(archive, "supabase/migrations/20260101000000_initial.sql", migration)
        archive_entry(archive, "../escape" if unsafe else "uv.lock", b"locked")
    manifest = {
        "version": 1,
        "repository": "kurtgav/Simula",
        "workflow": WORKFLOW,
        "sha": SHA,
        "ref": REF,
        "run_id": "123",
        "migration_head": "20260101000000",
        "source_sha256": "0" * 64 if tamper else hashlib.sha256(source.getvalue()).hexdigest(),
        "migrations": {"20260101000000_initial.sql": hashlib.sha256(migration).hexdigest()},
        "build_inputs": {"uv.lock": hashlib.sha256(b"locked").hexdigest()},
        "deployment_mode": "provider-build-from-verified-source",
    }
    with tarfile.open(path, "w:gz") as archive:
        archive_entry(archive, "promotion.json", json.dumps(manifest).encode())
        archive_entry(archive, "source.tar", source.getvalue())
    return path


def test_verified_source_extraction_checks_migrations_and_inputs(tmp_path: Path) -> None:
    path = fixture_bundle(tmp_path / "release.tar.gz")
    source = tmp_path / "source"
    manifest = promotion.extract_source(path, source, sha=SHA, ref=REF, run_id="123")
    assert (source / "uv.lock").read_bytes() == b"locked"
    assert manifest["migration_head"] == "20260101000000"


@pytest.mark.parametrize(
    "field,value", [("sha", "b" * 40), ("ref", "refs/tags/v2"), ("run_id", "456")]
)
def test_signed_identity_mismatch_rejected(tmp_path: Path, field: str, value: str) -> None:
    path = fixture_bundle(tmp_path / "release.tar.gz")
    identity = {"sha": SHA, "ref": REF, "run_id": "123", field: value}
    with pytest.raises(ValueError, match="does not match"):
        promotion.extract_source(path, tmp_path / "source", **identity)


def test_tampered_source_rejected_before_extraction(tmp_path: Path) -> None:
    path = fixture_bundle(tmp_path / "release.tar.gz", tamper=True)
    with pytest.raises(ValueError, match="digest mismatch"):
        promotion.extract_source(path, tmp_path / "source", sha=SHA, ref=REF, run_id="123")
    assert not (tmp_path / "source").exists()


def test_source_traversal_rejected(tmp_path: Path) -> None:
    path = fixture_bundle(tmp_path / "release.tar.gz", unsafe=True)
    with pytest.raises(tarfile.FilterError):
        promotion.extract_source(path, tmp_path / "source", sha=SHA, ref=REF, run_id="123")
    assert not (tmp_path / "escape").exists()


def test_failed_workflow_stops_before_signature_or_provider(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls: list[list[str]] = []

    def fake_command(arguments: list[str]) -> str:
        calls.append(arguments)
        return json.dumps(
            {"conclusion": "failure", "head_sha": SHA, "path": WORKFLOW, "event": "push"}
        )

    monkeypatch.setattr(promotion, "command", fake_command)
    with pytest.raises(ValueError, match="not a successful"):
        promotion.verify_release(tmp_path, tmp_path / "source", sha=SHA, ref=REF, run_id="123")
    assert len(calls) == 1
    assert calls[0][0] == "gh"


def test_failed_signature_stops_before_source_extraction(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls: list[list[str]] = []

    def fake_command(arguments: list[str]) -> str:
        calls.append(arguments)
        if arguments[0] == "cosign":
            raise ValueError("signature rejected")
        return json.dumps(
            {"conclusion": "success", "head_sha": SHA, "path": WORKFLOW, "event": "push"}
        )

    monkeypatch.setattr(promotion, "command", fake_command)
    with pytest.raises(ValueError, match="signature rejected"):
        promotion.verify_release(tmp_path, tmp_path / "source", sha=SHA, ref=REF, run_id="123")
    assert not (tmp_path / "source").exists()
    assert calls[-1][calls[-1].index("--certificate-identity") + 1].endswith(REF)


def test_missing_build_inputs_rejected() -> None:
    manifest = {
        "version": 1,
        "repository": REPOSITORY,
        "workflow": WORKFLOW,
        "sha": SHA,
        "ref": REF,
        "run_id": "123",
        "source_sha256": "a" * 64,
        "deployment_mode": "provider-build-from-verified-source",
    }
    with pytest.raises(ValueError, match="build inputs missing"):
        promotion.validate_manifest(manifest, sha=SHA, ref=REF, run_id="123")


def test_railway_removed_rollback_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        promotion, "railway_deployments", lambda _: [{"id": "previous", "status": "REMOVED"}]
    )
    with pytest.raises(ValueError, match="currently successful"):
        promotion.preflight({"provider": "railway", "rollback_deployment": "previous"})


def test_railway_deploy_sets_provenance_without_automatic_redeploy(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(promotion, "railway_deployments", lambda _: [])

    def fake_command(arguments: list[str], **_: object) -> str:
        calls.append(arguments)
        return '{"deploymentId":"12345678-1234-4234-8234-123456789012"}'

    monkeypatch.setattr(promotion, "command", fake_command)
    target = {
        "provider": "railway",
        "project": "a" * 32,
        "environment": "b" * 32,
        "service": "c" * 32,
    }
    manifest = {
        "sha": SHA,
        "migration_head": "20260101000000",
        "bundle_sha256": "d" * 64,
        "sigstore_sha256": "e" * 64,
        "run_id": "123",
    }
    result = promotion.deploy(target, tmp_path, manifest, "rollout")
    assert "--skip-deploys" in calls[0]
    assert f"SIMULA_RELEASE_SHA={SHA}" in calls[0]
    assert "SIMULA_RELEASE_BUNDLE_SHA256=" + "d" * 64 in calls[0]
    assert calls[1][:3] == ["railway", "up", str(tmp_path)]
    assert "--detach" in calls[1]
    assert "--json" in calls[1]
    assert result["id"] == "12345678-1234-4234-8234-123456789012"
    assert result["health_verified"] is False


def test_vercel_deploy_requires_separate_domain_promotion(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls: list[list[str]] = []

    def fake_command(arguments: list[str], **_: object) -> str:
        calls.append(arguments)
        return '{"status":"success","deployment":{"id":"dpl_candidate","url":"https://candidate.vercel.app"}}'

    monkeypatch.setattr(promotion, "command", fake_command)
    manifest = {
        "sha": SHA,
        "migration_head": "20260101000000",
        "bundle_sha256": "d" * 64,
        "sigstore_sha256": "e" * 64,
        "run_id": "123",
    }
    result = promotion.deploy(
        {"provider": "vercel", "project": "prj_test", "scope": "team"},
        tmp_path,
        manifest,
        "rollout",
    )
    assert "--skip-domain" in calls[0]
    assert "--prod" in calls[0]
    assert result["domains_promoted"] is False
    assert result["url"] == "https://candidate.vercel.app"


@pytest.mark.parametrize(
    "value",
    [
        "http://candidate.vercel.app",
        "https://candidate.vercel.app.evil.test",
        "https://user@candidate.vercel.app",
        "https://candidate.vercel.app/private",
        "https://candidate.vercel.app?token=private",
        "https://candidate.vercel.app#fragment",
        "https://candidate.vercel.app:443",
        "https://[invalid",
        None,
    ],
)
def test_invalid_vercel_url_retains_submission_identity(value: object) -> None:
    with pytest.raises(promotion.DeploymentResponseError) as caught:
        promotion.vercel_deployment_url(value, "dpl_candidate")
    assert caught.value.deployment_id == "dpl_candidate"


def test_vercel_legacy_hostname_is_normalized() -> None:
    assert (
        promotion.vercel_deployment_url("candidate.vercel.app", "dpl_candidate")
        == "https://candidate.vercel.app"
    )


def test_missing_railway_identity_fails_closed(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(promotion, "command", lambda *args, **kwargs: "{}")
    manifest = {
        "sha": SHA,
        "migration_head": "20260101000000",
        "bundle_sha256": "d" * 64,
        "sigstore_sha256": "e" * 64,
        "run_id": "123",
    }
    with pytest.raises(ValueError, match="deployment identity"):
        promotion.deploy(
            {
                "provider": "railway",
                "project": "a" * 32,
                "environment": "b" * 32,
                "service": "c" * 32,
            },
            tmp_path,
            manifest,
            "rollout",
        )


def test_previous_metadata_never_copies_unrelated_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        promotion,
        "command",
        lambda *args, **kwargs: json.dumps(
            {
                "DATABASE_URL": "synthetic-secret-must-not-be-retained",
                "SIMULA_RELEASE_SHA": SHA,
            }
        ),
    )
    previous = promotion.previous_release_environment(
        {"project": "a" * 32, "environment": "b" * 32, "service": "c" * 32}
    )
    assert previous["SIMULA_RELEASE_SHA"] == SHA
    assert "DATABASE_URL" not in previous
    assert "synthetic-secret" not in json.dumps(previous)


def test_wait_tracks_requested_deployment_not_neighbor_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        promotion,
        "railway_deployments",
        lambda _: [
            {"id": "neighbor", "status": "SUCCESS"},
            {"id": "owned", "status": "FAILED"},
        ],
    )
    with pytest.raises(ValueError, match="owned ended FAILED"):
        promotion.wait_for_railway({}, "owned")


def test_quality_gate_does_not_accept_stale_success(monkeypatch: pytest.MonkeyPatch) -> None:
    checks = [
        {
            "id": index,
            "name": name,
            "head_sha": SHA,
            "app": {"id": 15368},
            "status": "completed",
            "conclusion": "success",
        }
        for index, name in enumerate(promotion.REQUIRED_CHECKS)
    ]
    checks.append({**checks[0], "id": 100, "conclusion": "failure"})
    monkeypatch.setattr(promotion, "command", lambda _: json.dumps({"check_runs": checks}))
    with pytest.raises(ValueError, match="not successful"):
        promotion.verify_quality_checks(SHA)


def test_quality_gate_rejects_other_app_check_spoofing(monkeypatch: pytest.MonkeyPatch) -> None:
    checks = [
        {
            "id": index,
            "name": name,
            "head_sha": SHA,
            "app": {"id": 1},
            "status": "completed",
            "conclusion": "success",
        }
        for index, name in enumerate(promotion.REQUIRED_CHECKS)
    ]
    monkeypatch.setattr(promotion, "command", lambda _: json.dumps({"check_runs": checks}))
    with pytest.raises(ValueError, match="not successful"):
        promotion.verify_quality_checks(SHA)
