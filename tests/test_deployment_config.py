from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_railway_runtime_configs_use_valid_numeric_rollout_windows() -> None:
    expected_windows = {
        "railway.api.json": (15, 30),
        "railway.ai-engine.json": (30, 15),
        "railway.control-plane.json": (15, 30),
        "railway.dispatcher.json": (30, 0),
        "railway.worker.json": (30, 15),
    }

    for filename, (draining_seconds, overlap_seconds) in expected_windows.items():
        config = json.loads((ROOT / filename).read_text(encoding="utf-8"))

        assert config["build"]["builder"] == "DOCKERFILE"
        assert config["deploy"]["drainingSeconds"] == draining_seconds
        assert config["deploy"]["overlapSeconds"] == overlap_seconds


def test_railway_web_uses_the_pinned_monorepo_dockerfile() -> None:
    config = json.loads((ROOT / "railway.web.json").read_text(encoding="utf-8"))

    assert config["build"]["builder"] == "DOCKERFILE"
    assert config["build"]["dockerfilePath"] == "apps/web/Dockerfile"
    assert "railway.web.json" in config["build"]["watchPatterns"]
    assert config["deploy"]["drainingSeconds"] == 15
    assert config["deploy"]["healthcheckPath"] == "/api/health"
    assert config["deploy"]["overlapSeconds"] == 30
    assert config["deploy"]["startCommand"] is None
    assert config["environments"]["production"]["build"]["buildEnvironment"] == "V2"


def test_web_image_accepts_public_build_values_and_dynamic_port() -> None:
    dockerfile = (ROOT / "apps" / "web" / "Dockerfile").read_text(encoding="utf-8")

    for key in (
        "NEXT_PUBLIC_SIMULA_API_URL",
        "NEXT_PUBLIC_SIMULA_ENVIRONMENT",
        "NEXT_PUBLIC_SIMULA_RELEASE_SHA",
        "NEXT_PUBLIC_SIMULA_TELEMETRY_ENABLED",
        "NEXT_PUBLIC_SENTRY_DSN",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ):
        assert f"ARG {key}" in dockerfile

    assert "/workspace/apps/web/.next/static ./apps/web/.next/static" in dockerfile
    assert "/workspace/apps/web/public ./apps/web/public" in dockerfile
    assert "process.env.PORT||'3000'" in dockerfile


def test_target_control_plane_image_is_non_root_and_telemetry_first() -> None:
    dockerfile = (ROOT / "apps" / "api" / "Dockerfile").read_text(encoding="utf-8")
    config = json.loads((ROOT / "railway.control-plane.json").read_text(encoding="utf-8"))

    assert "pnpm peers check" in dockerfile
    assert "pnpm --filter @simula/api build" in dockerfile
    assert "USER simula" in dockerfile
    assert '"--require", "./dist/instrumentation.js"' in dockerfile
    assert config["build"]["dockerfilePath"] == "apps/api/Dockerfile"
    assert config["deploy"]["healthcheckPath"] == "/health/ready"


def test_dispatcher_reuses_the_control_plane_image_without_dual_process_overlap() -> None:
    config = json.loads((ROOT / "railway.dispatcher.json").read_text(encoding="utf-8"))

    assert config["build"]["dockerfilePath"] == "apps/api/Dockerfile"
    assert "railway.dispatcher.json" in config["build"]["watchPatterns"]
    assert config["deploy"]["healthcheckPath"] == "/health/ready"
    assert config["deploy"]["overlapSeconds"] == 0
    assert config["deploy"]["startCommand"] == (
        "node --require ./dist/instrumentation.js dist/dispatcher/main.js"
    )


def test_private_ai_engine_manifest_uses_readiness() -> None:
    config = json.loads((ROOT / "railway.ai-engine.json").read_text(encoding="utf-8"))

    assert config["build"]["dockerfilePath"] == "services/ai-engine/Dockerfile"
    assert config["deploy"]["healthcheckPath"] == "/health/ready"


def test_release_workflow_fails_closed_and_verifies_sigstore_provenance() -> None:
    workflow = (ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")

    assert "id-token: write" in workflow
    assert "sigstore/gh-action-sigstore-python@f832326173235dcb00dd5d92cd3f353de3188e6c" in workflow
    assert "verify-cert-identity: https://github.com/${{ github.workflow_ref }}" in workflow
    assert "verify-oidc-issuer: https://token.actions.githubusercontent.com" in workflow
    assert "release/simula-${GITHUB_SHA}.tar.gz.sigstore.json" in workflow
    assert "release/SIGSTORE_BUNDLE_SHA256" in workflow
    assert "release-signing-artifacts: false" in workflow
    assert "upload-signing-artifacts: false" in workflow
    assert "attestations: write" not in workflow
    assert "contents: write" not in workflow
    assert "--pax-option=delete=atime,delete=ctime" in workflow
    assert workflow.index("verify: true") < workflow.index("actions/upload-artifact@")
    assert "persist-credentials: false" in workflow
    assert "pull_request_target" not in workflow
    assert "workflow_dispatch" not in workflow


def test_rollback_runbook_prevents_dual_execution_and_down_migrations() -> None:
    runbook = (ROOT / "brain" / "Operations" / "STAGED_ROLLOUT_AND_ROLLBACK.md").read_text(
        encoding="utf-8"
    )

    for flag in (
        "NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION=v1",
        "NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION=v2",
        "SIMULA_BEHAVIORAL_DEMO_ENABLED=false",
        "SIMULA_BEHAVIORAL_ENGINE_TRANSPORT=disabled",
        "SIMULA_NEST_DOMAIN_ENABLED=false",
        "SIMULA_NEST_DOMAIN_ENABLED=true",
        "SIMULA_TELEMETRY_ENABLED=false",
        "SIMULA_TELEMETRY_ENABLED=true",
        "SIMULA_WORKER_QUEUE_TRANSPORT=arq",
        "SIMULA_WORKER_QUEUE_TRANSPORT=bullmq",
    ):
        assert flag in runbook

    assert "Never dual-write or dual-consume" in runbook
    assert "Never run both consumers" in runbook
    assert "forward corrective migration" in runbook
    assert "unreviewed down migration" in runbook
    assert "documented sequence without a staging execution is not" in runbook


def test_api_image_installs_the_pinned_supabase_ca() -> None:
    dockerfile = (ROOT / "services" / "api" / "Dockerfile").read_text(encoding="utf-8")
    certificate = (ROOT / "services" / "api" / "certs" / "supabase-prod-ca-2021.crt").read_text(
        encoding="utf-8"
    )

    assert "supabase-prod-ca-2021.crt /etc/ssl/certs/supabase-prod-ca-2021.crt" in dockerfile
    assert certificate.startswith("-----BEGIN CERTIFICATE-----")
    assert "PRIVATE KEY" not in certificate


def test_worker_image_installs_the_pinned_supabase_ca() -> None:
    dockerfile = (ROOT / "services" / "worker" / "Dockerfile").read_text(encoding="utf-8")
    certificate = (ROOT / "services" / "api" / "certs" / "supabase-prod-ca-2021.crt").read_text(
        encoding="utf-8"
    )

    assert "supabase-prod-ca-2021.crt /etc/ssl/certs/supabase-prod-ca-2021.crt" in dockerfile
    assert certificate.startswith("-----BEGIN CERTIFICATE-----")
    assert "PRIVATE KEY" not in certificate
