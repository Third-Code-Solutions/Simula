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
    assert "sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6" in workflow
    assert "cosign-release: v3.0.6" in workflow
    assert 'identity="https://github.com/${GITHUB_WORKFLOW_REF}"' in workflow
    assert "cosign sign-blob --yes --bundle" in workflow
    assert "cosign verify-blob" in workflow
    assert '--certificate-identity "$identity"' in workflow
    assert "--certificate-oidc-issuer" in workflow
    assert "https://token.actions.githubusercontent.com" in workflow
    assert "release/simula-${GITHUB_SHA}.tar.gz.sigstore.json" in workflow
    assert "release/SIGSTORE_BUNDLE_SHA256" in workflow
    assert "sigstore/gh-action-sigstore-python@" not in workflow
    assert "attestations: write" not in workflow
    assert "contents: write" not in workflow
    assert "--pax-option=delete=atime,delete=ctime" in workflow
    assert workflow.index("cosign verify-blob") < workflow.index("actions/upload-artifact@")
    assert "persist-credentials: false" in workflow
    assert "pull_request_target" not in workflow
    assert "workflow_dispatch" not in workflow


def test_behavioral_artifact_migration_scopes_owner_handoff_to_both_schemas() -> None:
    migration = (
        ROOT / "supabase" / "migrations" / "20260729094522_behavioral_engine_artifacts.sql"
    ).read_text(encoding="utf-8")

    grant = "grant create on schema api, private to simula_worker_owner;"
    revoke = "revoke create on schema api, private from simula_worker_owner;"

    assert grant in migration
    assert revoke in migration
    assert migration.index(grant) < migration.index(
        "alter table api.behavioral_run_results owner to simula_worker_owner;"
    )
    assert migration.index(revoke) > migration.index("set role simula_worker_owner;")


def test_pending_migrations_leave_the_hosted_history_writer_as_postgres() -> None:
    migrations = ROOT / "supabase" / "migrations"
    pending = sorted(
        path
        for path in migrations.glob("*.sql")
        if int(path.name.split("_", 1)[0]) >= 20260729094522
    )

    assert pending
    for migration in pending:
        role_statements = [
            line.strip().lower()
            for line in migration.read_text(encoding="utf-8").splitlines()
            if line.strip().lower().startswith(("set role ", "reset role;"))
        ]
        assert role_statements[-1] == "set role postgres;", migration.name


def test_cross_owner_behavioral_foreign_keys_scope_references_to_migration() -> None:
    migrations = ROOT / "supabase" / "migrations"
    filenames = (
        "20260729102512_m5_governed_behavioral_data.sql",
        "20260729103629_m5_behavioral_evaluation_registry.sql",
        "20260729110611_m6_behavioral_public_summaries.sql",
    )
    grant = """grant references (organization_id, run_id)
on table api.behavioral_run_results
to postgres;"""
    revoke = """revoke references (organization_id, run_id)
on table api.behavioral_run_results
from postgres;"""
    reference = "references api.behavioral_run_results (organization_id, run_id)"

    for filename in filenames:
        migration = (migrations / filename).read_text(encoding="utf-8").lower()

        assert migration.count(grant) == 1, filename
        assert migration.count(revoke) == 1, filename
        assert migration.index(grant) < migration.index(reference), filename
        assert migration.rindex(revoke) > migration.rindex(reference), filename
        assert migration.rstrip().endswith("set role postgres;"), filename


def test_evidence_fixture_precedes_postgres_privilege_revoke() -> None:
    migration = (
        ROOT / "supabase" / "migrations" / "20260729103220_m5_evidence_outcomes_private_assets.sql"
    ).read_text(encoding="utf-8")
    postgres_revoke = """revoke all on table
  api.evidence_sources,
  api.evidence_source_versions,
  api.observed_outcome_sets,
  api.observed_outcome_values,
  api.stimulus_assets
from postgres;"""

    assert migration.count(postgres_revoke) == 1
    assert migration.index("with fixture as (") < migration.index(postgres_revoke)
    assert migration.index("insert into storage.buckets (") < migration.index(postgres_revoke)


def test_cross_migration_foreign_keys_scope_locked_table_references() -> None:
    migrations = ROOT / "supabase" / "migrations"
    cases = {
        "20260729103629_m5_behavioral_evaluation_registry.sql": (
            """grant references (organization_id, id)
on table api.observed_outcome_sets, api.observed_outcome_values
to postgres;""",
            """revoke references (organization_id, id)
on table api.observed_outcome_sets, api.observed_outcome_values
from postgres;""",
            "references api.observed_outcome_sets (organization_id, id)",
        ),
        "20260729132200_m7_governed_context_embeddings.sql": (
            """grant references (organization_id, id)
on table api.context_graph_versions
to postgres;""",
            """revoke references (organization_id, id)
on table api.context_graph_versions
from postgres;""",
            "references api.context_graph_versions (organization_id, id)",
        ),
        "20260730123000_m6_visual_stimulus_profiles.sql": (
            """grant references (id)
on table api.stimulus_assets
to postgres;""",
            """revoke references (id)
on table api.stimulus_assets
from postgres;""",
            "references api.stimulus_assets(id)",
        ),
        "20260730220000_m2_organization_deletion_recovery.sql": (
            """grant references (id)
on table private.organization_deletion_requests
to postgres;""",
            """revoke references (id)
on table private.organization_deletion_requests
from postgres;""",
            "references private.organization_deletion_requests(id)",
        ),
    }

    for filename, (grant, revoke, reference) in cases.items():
        migration = (migrations / filename).read_text(encoding="utf-8").lower()

        assert migration.count(grant) == 1, filename
        assert migration.count(revoke) == 1, filename
        assert migration.index(grant) < migration.index(reference), filename
        assert migration.rindex(revoke) > migration.rindex(reference), filename
        assert migration.rstrip().endswith("set role postgres;"), filename


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
