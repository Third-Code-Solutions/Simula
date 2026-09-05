"""Verify signed source admission before invoking a provider deployment.

Provider builds are derivatives of verified source, not claimed identical to the
release scanner's images. Receipts preserve that distinction. No unverified local
checkout is accepted as a deployment input.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import subprocess
import tarfile
import tempfile
import time
import uuid
from pathlib import Path
from shutil import which
from typing import Any
from urllib.parse import urlsplit

from scripts.release_manifest import REPOSITORY, WORKFLOW, digest

REQUIRED_CHECKS = frozenset(
    {
        "History secret gate",
        "Windows quality gate",
        "Foundation gate",
        "Non-root container gate",
    }
)


class DeploymentResponseError(ValueError):
    """Preserve a validated submission ID when later response validation fails."""

    def __init__(self, deployment_id: str) -> None:
        super().__init__(
            "provider deployment URL invalid; inspect submitted deployment before retry"
        )
        self.deployment_id = deployment_id


def vercel_deployment_url(value: object, deployment_id: str) -> str:
    if not isinstance(value, str):
        raise DeploymentResponseError(deployment_id)
    candidate = value if "://" in value else f"https://{value}"
    try:
        parsed = urlsplit(candidate)
    except ValueError as error:
        raise DeploymentResponseError(deployment_id) from error
    if (
        parsed.scheme != "https"
        or not re.fullmatch(r"[A-Za-z0-9-]+\.vercel\.app", parsed.netloc)
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise DeploymentResponseError(deployment_id)
    return f"https://{parsed.netloc}"


def verify_quality_checks(sha: str) -> None:
    response = json.loads(
        command(["gh", "api", f"repos/{REPOSITORY}/commits/{sha}/check-runs?per_page=100"])
    )
    for name in REQUIRED_CHECKS:
        matches = [
            item
            for item in response.get("check_runs", [])
            if item.get("name") == name
            and item.get("head_sha") == sha
            and item.get("app", {}).get("id") == 15368
        ]
        latest: dict[str, Any] = max(matches, key=lambda item: item["id"], default={})
        if latest.get("status") != "completed" or latest.get("conclusion") != "success":
            raise ValueError(f"required source check is not successful: {name}")


def command(arguments: list[str], *, cwd: Path | None = None) -> str:
    executable = which(arguments[0])
    if not executable:
        raise ValueError(f"required executable unavailable: {arguments[0]}")
    environment = os.environ.copy()
    if arguments[0] == "vercel":
        # CLI ambient linking IDs override --project; the reviewed plan owns scope.
        for key in ("VERCEL_ORG_ID", "VERCEL_PROJECT_ID", "NOW_ORG_ID", "NOW_PROJECT_ID"):
            environment.pop(key, None)
    result = subprocess.run(  # noqa: S603 - explicit executable/argument list, never shell.
        [executable, *arguments[1:]],
        cwd=cwd,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
        timeout=1800,
    )
    if result.returncode:
        # Provider output can contain environment values; keep it out of errors.
        raise ValueError(f"{arguments[0]} {arguments[1]} failed (exit {result.returncode})")
    return result.stdout


def member_bytes(archive: tarfile.TarFile, name: str, limit: int) -> bytes:
    matches = [m for m in archive.getmembers() if m.name.removeprefix("./") == name]
    if len(matches) != 1 or not matches[0].isfile() or matches[0].size > limit:
        raise ValueError(f"invalid signed archive member: {name}")
    stream = archive.extractfile(matches[0])
    if stream is None:
        raise ValueError(f"missing signed archive member: {name}")
    return stream.read(limit + 1)


def validate_manifest(manifest: Any, *, sha: str, ref: str, run_id: str) -> dict[str, Any]:
    if not isinstance(manifest, dict):
        raise ValueError("invalid promotion manifest")
    expected = {
        "version": 1,
        "repository": REPOSITORY,
        "workflow": WORKFLOW,
        "sha": sha,
        "ref": ref,
        "run_id": run_id,
        "deployment_mode": "provider-build-from-verified-source",
    }
    if any(manifest.get(k) != v for k, v in expected.items()):
        raise ValueError("signed manifest does not match requested release")
    if not re.fullmatch(r"[0-9a-f]{64}", str(manifest.get("source_sha256", ""))):
        raise ValueError("invalid signed source digest")
    if not isinstance(manifest.get("build_inputs"), dict) or not manifest["build_inputs"]:
        raise ValueError("signed build inputs missing")
    return manifest


def extract_source(
    archive_path: Path, destination: Path, *, sha: str, ref: str, run_id: str
) -> dict[str, Any]:
    with tarfile.open(archive_path, "r:gz") as archive:
        manifest = validate_manifest(
            json.loads(member_bytes(archive, "promotion.json", 1_000_000)),
            sha=sha,
            ref=ref,
            run_id=run_id,
        )
        source = member_bytes(archive, "source.tar", 200_000_000)
    if hashlib.sha256(source).hexdigest() != manifest["source_sha256"]:
        raise ValueError("signed source digest mismatch")
    with tarfile.open(fileobj=io.BytesIO(source)) as source_archive:
        for member in source_archive.getmembers():
            if not (member.isfile() or member.isdir()):
                raise ValueError("deployment source must not contain links or devices")
        source_archive.extractall(destination, filter="data")
    migrations = destination / "supabase/migrations"
    observed = {p.name: digest(p) for p in sorted(migrations.glob("*.sql"))}
    if observed != manifest.get("migrations") or not observed:
        raise ValueError("migration contents differ from signed manifest")
    if sorted(observed)[-1].split("_")[0] != manifest.get("migration_head"):
        raise ValueError("migration head mismatch")
    for name, expected in manifest.get("build_inputs", {}).items():
        path = (destination / name).resolve()
        if not path.is_relative_to(destination.resolve()) or digest(path) != expected:
            raise ValueError("build input differs from signed manifest")
    return manifest


def verify_release(
    directory: Path, source: Path, *, sha: str, ref: str, run_id: str
) -> dict[str, Any]:
    if not re.fullmatch(r"[0-9a-f]{40}", sha) or not run_id.isdigit():
        raise ValueError("invalid release identity")
    if not re.fullmatch(r"refs/tags/v[A-Za-z0-9._-]+", ref):
        raise ValueError("release must use an explicit immutable version tag")
    run = json.loads(command(["gh", "api", f"repos/{REPOSITORY}/actions/runs/{run_id}"]))
    if (
        run.get("conclusion") != "success"
        or run.get("head_sha") != sha
        or run.get("path") != WORKFLOW
        or run.get("event") != "push"
    ):
        raise ValueError("release workflow/source is not a successful authorized release")
    artifact = directory / f"simula-{sha}.tar.gz"
    bundle = directory / f"simula-{sha}.tar.gz.sigstore.json"
    command(
        [
            "cosign",
            "verify-blob",
            "--bundle",
            str(bundle),
            "--certificate-identity",
            f"https://github.com/{REPOSITORY}/{WORKFLOW}@{ref}",
            "--certificate-oidc-issuer",
            "https://token.actions.githubusercontent.com",
            str(artifact),
        ]
    )
    manifest = extract_source(artifact, source, sha=sha, ref=ref, run_id=run_id)
    return {**manifest, "bundle_sha256": digest(artifact), "sigstore_sha256": digest(bundle)}


def railway_scope(target: dict[str, Any]) -> list[str]:
    arguments: list[str] = []
    for key in ("project", "environment", "service"):
        try:
            value = str(uuid.UUID(target[key]))
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            raise ValueError(f"explicit Railway {key} UUID required") from error
        arguments.extend([f"--{key}", value])
    return arguments


def railway_deployments(target: dict[str, Any]) -> list[dict[str, Any]]:
    result = json.loads(
        command(
            ["railway", "deployment", "list", *railway_scope(target), "--limit", "20", "--json"]
        )
    )
    if not isinstance(result, list):
        raise ValueError("unexpected Railway deployment inventory")
    return result


def preflight(target: dict[str, Any]) -> None:
    if target.get("provider") == "railway":
        candidates = railway_deployments(target)
        if not any(
            item.get("id") == target.get("rollback_deployment") and item.get("status") == "SUCCESS"
            for item in candidates
        ):
            raise ValueError("Railway rollback must identify a currently successful deployment")
    elif target.get("provider") == "vercel":
        if not re.fullmatch(r"prj_[A-Za-z0-9]+", target.get("project", "")):
            raise ValueError("explicit Vercel project ID required")
        if not re.fullmatch(r"[A-Za-z0-9_-]+", target.get("scope", "")):
            raise ValueError("explicit Vercel scope required")
        rollback = target.get("rollback_deployment", "")
        if not re.fullmatch(r"dpl_[A-Za-z0-9]+", rollback):
            raise ValueError("explicit Vercel rollback deployment required")
        state = json.loads(
            command(["vercel", "inspect", rollback, "--format=json", "--scope", target["scope"]])
        )
        inventory = json.loads(
            command(
                [
                    "vercel",
                    "list",
                    target["project"],
                    "--scope",
                    target["scope"],
                    "--status",
                    "READY",
                    "--format=json",
                ]
            )
        )
        if state.get("readyState") != "READY" or not any(
            item.get("url") == state.get("url") and item.get("state") == "READY"
            for item in inventory.get("deployments", [])
        ):
            raise ValueError("Vercel rollback is not READY in the requested project")
    else:
        raise ValueError("provider adapter not configured")


def release_environment(manifest: dict[str, Any], rollout: str) -> dict[str, str]:
    return {
        "SIMULA_RELEASE_SHA": manifest["sha"],
        "SIMULA_DATABASE_MIGRATION_HEAD": manifest["migration_head"],
        "SIMULA_PRODUCTION_ADMISSION_ENABLED": "true",
        "SIMULA_PRODUCTION_ROLLOUT_ID": rollout,
        "SIMULA_RELEASE_BUNDLE_SHA256": manifest["bundle_sha256"],
        "SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256": manifest["sigstore_sha256"],
        "SIMULA_RELEASE_PROVENANCE_URL": f"https://github.com/{REPOSITORY}/actions/runs/{manifest['run_id']}",
    }


def previous_release_environment(target: dict[str, Any]) -> dict[str, str | None]:
    """Retain only validated public release metadata, never arbitrary provider values."""
    patterns = {
        "SIMULA_RELEASE_SHA": r"[0-9a-f]{40}",
        "SIMULA_DATABASE_MIGRATION_HEAD": r"[0-9]{14}",
        "SIMULA_PRODUCTION_ADMISSION_ENABLED": r"true|false",
        "SIMULA_PRODUCTION_ROLLOUT_ID": r"[0-9a-f-]{36}",
        "SIMULA_RELEASE_BUNDLE_SHA256": r"[0-9a-f]{64}",
        "SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256": r"[0-9a-f]{64}",
        "SIMULA_RELEASE_PROVENANCE_URL": r"https://github\.com/kurtgav/Simula/actions/runs/[0-9]+",
    }
    raw = json.loads(command(["railway", "variable", "list", *railway_scope(target), "--json"]))
    previous: dict[str, str | None] = {}
    for key, pattern in patterns.items():
        value = raw.get(key)
        if value is not None and (not isinstance(value, str) or not re.fullmatch(pattern, value)):
            raise ValueError(f"existing {key} requires manual review before safe rollback capture")
        previous[key] = value
    return previous


def deploy(
    target: dict[str, Any], source: Path, manifest: dict[str, Any], rollout: str
) -> dict[str, Any]:
    values = release_environment(manifest, rollout)
    if target["provider"] == "railway":
        scope = railway_scope(target)
        command(
            [
                "railway",
                "variable",
                "set",
                *scope,
                "--skip-deploys",
                *[f"{key}={value}" for key, value in values.items()],
            ]
        )
        response = json.loads(
            command(
                [
                    "railway",
                    "up",
                    str(source),
                    "--path-as-root",
                    "--detach",
                    "--json",
                    *scope,
                    "--message",
                    f"verified-release:{manifest['sha']}:{rollout}",
                ],
                cwd=source,
            )
        )
        try:
            deployment_id = str(uuid.UUID(response["deploymentId"]))
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            raise ValueError(
                "provider did not return a deployment identity; inspect before retry"
            ) from error
        return {"id": deployment_id, "status": "queued", "health_verified": False}
    arguments = [
        "vercel",
        "deploy",
        str(source),
        "--project",
        target["project"],
        "--scope",
        target["scope"],
        "--prod",
        "--skip-domain",
        "--yes",
        "--format=json",
        "--meta",
        f"verifiedReleaseSha={manifest['sha']}",
    ]
    for key, value in values.items():
        arguments.extend(["--env", f"{key}={value}", "--build-env", f"{key}={value}"])
    response = json.loads(command(arguments, cwd=source))
    result = response.get("deployment", response)
    if not isinstance(result, dict) or not re.fullmatch(
        r"dpl_[A-Za-z0-9]+", str(result.get("id", ""))
    ):
        raise ValueError("provider did not return a deployment identity; inspect before retry")
    deployment_url = vercel_deployment_url(result.get("url"), result["id"])
    return {
        "id": result.get("id"),
        "url": deployment_url,
        "domains_promoted": False,
        "health_verified": False,
    }


def wait_for_railway(target: dict[str, Any], deployment_id: str) -> None:
    deadline = time.monotonic() + 1800
    while time.monotonic() < deadline:
        deployment = next(
            (item for item in railway_deployments(target) if item["id"] == deployment_id), None
        )
        if deployment:
            status = deployment.get("status")
            if status == "SUCCESS":
                return
            if status in {"FAILED", "CRASHED", "REMOVED", "CANCELED", "SKIPPED"}:
                raise ValueError(f"Railway deployment {deployment_id} ended {status}")
        time.sleep(5)
    raise ValueError(
        f"Railway deployment {deployment_id} did not become successful within 30 minutes"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-directory", type=Path, required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--ref", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    # Provider subprocesses can retain Windows file handles after a failed build.
    # Cleanup must not replace the actionable deployment exception.
    with tempfile.TemporaryDirectory(
        prefix="simula-verified-promotion-", ignore_cleanup_errors=True
    ) as temporary:
        source = Path(temporary)
        manifest = verify_release(
            args.artifact_directory.resolve(),
            source,
            sha=args.sha,
            ref=args.ref,
            run_id=args.run_id,
        )
        if args.execute:
            verify_quality_checks(args.sha)
        if plan.get("migration_head") != manifest["migration_head"]:
            raise ValueError("target schema head is not the verified release schema")
        if plan.get("release_sha") != args.sha:
            raise ValueError("promotion requires exact source and rollback targets")
        if not plan.get("targets"):
            raise ValueError("promotion targets missing")
        for target in plan["targets"]:
            preflight(target)
        receipt = {
            "manifest": manifest,
            "targets": plan["targets"],
            "rollout_id": str(uuid.uuid4()),
            "results": [],
            "executed": False,
        }
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        if args.execute:
            for target in plan["targets"]:
                outcome = {"target": target, "status": "started"}
                if target["provider"] == "railway":
                    outcome["previous_release_environment"] = previous_release_environment(target)
                receipt["results"].append(outcome)
                args.receipt.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
                try:
                    outcome.update(deploy(target, source, manifest, receipt["rollout_id"]))
                    outcome["status"] = "submitted"
                    args.receipt.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
                    if target["provider"] == "railway":
                        wait_for_railway(target, outcome["id"])
                        outcome["status"] = "provider_success; application verification pending"
                except Exception as error:
                    if isinstance(error, DeploymentResponseError):
                        outcome["id"] = error.deployment_id
                    outcome["status"] = "failed; inspect provider state before retry"
                    raise
                finally:
                    args.receipt.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
            receipt["executed"] = True
        args.receipt.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
