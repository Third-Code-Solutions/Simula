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
import re
import subprocess
import tarfile
import tempfile
import uuid
from pathlib import Path
from shutil import which
from typing import Any

from scripts.release_manifest import REPOSITORY, WORKFLOW, digest


def command(arguments: list[str], *, cwd: Path | None = None) -> str:
    executable = which(arguments[0])
    if not executable:
        raise ValueError(f"required executable unavailable: {arguments[0]}")
    result = subprocess.run(  # noqa: S603 - explicit executable/argument list, never shell.
        [executable, *arguments[1:]],
        cwd=cwd,
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


def deploy(
    target: dict[str, Any], source: Path, manifest: dict[str, Any], rollout: str
) -> dict[str, Any]:
    values = release_environment(manifest, rollout)
    if target["provider"] == "railway":
        scope = railway_scope(target)
        previous = {item["id"] for item in railway_deployments(target)}
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
        command(
            [
                "railway",
                "up",
                str(source),
                "--path-as-root",
                "--ci",
                *scope,
                "--message",
                f"verified-release:{manifest['sha']}",
            ],
            cwd=source,
        )
        created = [item for item in railway_deployments(target) if item["id"] not in previous]
        return {
            "deployments": [{"id": item["id"], "status": item["status"]} for item in created],
            "health_verified": False,
        }
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
    result = json.loads(command(arguments, cwd=source))
    return {
        "id": result.get("id"),
        "url": result.get("url"),
        "domains_promoted": False,
        "health_verified": False,
    }


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
    with tempfile.TemporaryDirectory(prefix="simula-verified-promotion-") as temporary:
        source = Path(temporary)
        manifest = verify_release(
            args.artifact_directory.resolve(),
            source,
            sha=args.sha,
            ref=args.ref,
            run_id=args.run_id,
        )
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
                receipt["results"].append(outcome)
                args.receipt.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
                try:
                    outcome.update(deploy(target, source, manifest, receipt["rollout_id"]))
                    outcome["status"] = "submitted"
                except Exception:
                    outcome["status"] = "failed; inspect provider state before retry"
                    raise
                finally:
                    args.receipt.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
            receipt["executed"] = True
        args.receipt.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
