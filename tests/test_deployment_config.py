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
        "NEXT_PUBLIC_SIMULA_API_V1_URL",
        "NEXT_PUBLIC_SIMULA_API_V2_URL",
        "NEXT_PUBLIC_SIMULA_ENVIRONMENT",
        "NEXT_PUBLIC_SIMULA_RELEASE_SHA",
        "NEXT_PUBLIC_SIMULA_TELEMETRY_ENABLED",
        "NEXT_PUBLIC_SIMULA_WEB_URL",
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


def test_ci_builds_and_scans_every_containerized_production_runtime() -> None:
    workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

    expected_builds = {
        "simula-web:m0 --file apps/web/Dockerfile",
        "simula-api:m0 --file services/api/Dockerfile",
        "simula-control-plane:m0 --file apps/api/Dockerfile",
        "simula-worker:m0 --file services/worker/Dockerfile",
        "simula-ai-engine:m0 --file services/ai-engine/Dockerfile",
    }
    for expected in expected_builds:
        assert expected in workflow
    assert "--build-arg NEXT_PUBLIC_SIMULA_API_V1_URL=http://127.0.0.1:8000" in workflow
    assert "--build-arg NEXT_PUBLIC_SIMULA_API_V2_URL=http://127.0.0.1:3002" in workflow
    assert '--build-arg NEXT_PUBLIC_SIMULA_RELEASE_SHA="$GITHUB_SHA"' in workflow
    assert "--build-arg NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321" in workflow
    assert "for image in web api control-plane worker ai-engine; do" in workflow


def test_root_and_signed_release_run_the_control_plane_and_full_verification() -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    release = (ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")

    assert "pnpm verify:m1-control-plane" in package["scripts"]["verify"]
    assert "pnpm verify" in release
    assert "supabase start" in release
    assert "docker compose up --detach --wait redis" in release
    assert "for image in web api control-plane worker ai-engine; do" in release
    assert "simula-control-plane:release --file apps/api/Dockerfile" in release
    assert "simula-ai-engine:release --file services/ai-engine/Dockerfile" in release
    assert "vars.NEXT_PUBLIC_SIMULA_API_V1_URL" in release
    assert "vars.NEXT_PUBLIC_SIMULA_API_V2_URL" in release
    assert "vars.NEXT_PUBLIC_SUPABASE_URL" in release
    assert "vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" in release
    assert "--build-arg NEXT_PUBLIC_SIMULA_API_V1_URL" in release
    assert "--build-arg NEXT_PUBLIC_SIMULA_API_V2_URL" in release
    assert "--build-arg NEXT_PUBLIC_SIMULA_RELEASE_SHA" in release
    assert "--build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" in release
    assert "Telemetry requires an HTTPS Sentry DSN" in release
    assert "NEXT_PUBLIC_SIMULA_API_URL: ${{ vars.NEXT_PUBLIC_SIMULA_API_V1_URL }}" in release
    assert "admin API origin must match the authoritative v1 origin" in release
    assert 'syft "dir:apps/admin/.next/standalone"' in release
    assert "release/security/simula-admin.grype.json" in release
    assert "cp -R apps/admin/.next/standalone release/stage/admin" in release
    assert "cp -R apps/admin/.next/static release/stage/admin-static" in release
    assert "v1 and v2 API origins must be distinct" in release
    for image in ("web", "api", "control-plane", "worker", "ai-engine"):
        assert release.count(f"--tag simula-{image}:release") == 1
    assert "release/image-identities.txt" in release
    assert "cp release/image-identities.txt release/stage/" in release


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


def test_context_search_comment_runs_as_function_owner() -> None:
    migration = (
        ROOT / "supabase" / "migrations" / "20260729132200_m7_governed_context_embeddings.sql"
    ).read_text(encoding="utf-8")
    owner_role = migration.rindex("set role simula_command_owner;")
    function_comment = migration.index("comment on function api.search_context_nodes(")
    postgres_role = migration.index("set role postgres;", function_comment)

    assert owner_role < function_comment < postgres_role


def test_stimulus_asset_backfill_scopes_migration_table_access() -> None:
    migration = (
        ROOT / "supabase" / "migrations" / "20260729151639_m6_private_stimulus_asset_pipeline.sql"
    ).read_text(encoding="utf-8")
    grant = """grant select, update
on table api.stimulus_assets
to postgres;"""
    revoke = """revoke select, update
on table api.stimulus_assets
from postgres;"""
    backfill = "update api.stimulus_assets"

    assert migration.count(grant) == 1
    assert migration.count(revoke) == 1
    assert migration.index(grant) < migration.index(backfill)
    assert migration.rindex(revoke) > migration.rindex(backfill)
    assert migration.rstrip().endswith("set role postgres;")


def test_stimulus_asset_function_acl_changes_run_as_function_owner() -> None:
    migration = (
        ROOT / "supabase" / "migrations" / "20260729151639_m6_private_stimulus_asset_pipeline.sql"
    ).read_text(encoding="utf-8")
    owner_role = migration.index(
        "set role simula_command_owner;",
        migration.index("revoke create on schema api, private from simula_command_owner;"),
    )
    first_function_revoke = migration.index(
        "revoke all on function private.create_stimulus_asset_atomic("
    )
    final_function_grant = migration.index(
        "grant execute on function api.confirm_stimulus_asset_deletion(uuid, uuid)"
    )
    postgres_role = migration.index("set role postgres;", final_function_grant)

    assert owner_role < first_function_revoke < final_function_grant < postgres_role


def test_production_tail_migrations_do_not_reset_to_the_cli_login_role() -> None:
    for migration_path in sorted((ROOT / "supabase" / "migrations").glob("20260730*.sql")):
        migration = migration_path.read_text(encoding="utf-8")

        assert "reset role;" not in migration, migration_path.name
        assert migration.lstrip().startswith(("--", "set role postgres;")), migration_path.name
        assert "set role postgres;" in migration[:500], migration_path.name
        assert migration.rstrip().endswith("set role postgres;"), migration_path.name


def test_production_tail_acl_changes_run_as_object_owners() -> None:
    expectations = {
        "20260730123000_m6_visual_stimulus_profiles.sql": (
            "revoke create on schema api, private from simula_command_owner;",
            "revoke all on function private.create_stimulus_visual_profile_atomic(",
            "revoke references (id)",
        ),
        "20260730200000_m2_organization_deletion_orchestration.sql": (
            "revoke create on schema api, private from simula_command_owner;",
            "revoke all on function private.request_organization_deletion_atomic(",
            "revoke all on table private.organization_deletion_requests",
        ),
        "20260730220000_m2_organization_deletion_recovery.sql": (
            "revoke create on schema private from simula_command_owner;",
            "revoke all on function private.seed_organization_deletion_resources()",
            "revoke all on all sequences in schema api, private",
        ),
    }

    for filename, (schema_acl, function_acl, postgres_cleanup) in expectations.items():
        migration = (ROOT / "supabase" / "migrations" / filename).read_text(encoding="utf-8")
        schema_acl_position = migration.index(schema_acl)
        owner_role_position = migration.index("set role simula_command_owner;", schema_acl_position)
        function_acl_position = migration.index(function_acl, owner_role_position)
        postgres_role_position = migration.index("set role postgres;", function_acl_position)
        cleanup_position = migration.index(postgres_cleanup, postgres_role_position)

        assert (
            schema_acl_position
            < owner_role_position
            < function_acl_position
            < postgres_role_position
            < cleanup_position
        ), filename


def test_behavioral_demo_patch_runs_as_hosted_object_owners() -> None:
    migration = (
        ROOT / "supabase" / "migrations" / "20260730160000_fix_behavioral_demo_active_audience.sql"
    ).read_text(encoding="utf-8")

    command_schema_grant = migration.index(
        "grant create on schema private to simula_command_owner;"
    )
    command_role = migration.index("set role simula_command_owner;", command_schema_grant)
    demo_patch = migration.index("do $patch_behavioral_audience$")
    postgres_after_demo = migration.index("set role postgres;", demo_patch)
    command_schema_revoke = migration.index(
        "revoke create on schema private from simula_command_owner;",
        postgres_after_demo,
    )
    worker_schema_grant = migration.index(
        "grant create on schema private to simula_worker_owner;",
        command_schema_revoke,
    )
    worker_role = migration.index("set role simula_worker_owner;", worker_schema_grant)
    artifact_patch = migration.index("do $patch_behavioral_artifact_validator$", worker_role)
    worker_grant = migration.index(
        "grant execute on function private.normalize_behavioral_public_summaries(",
        artifact_patch,
    )
    postgres_role = migration.index("set role postgres;", worker_grant)
    worker_schema_revoke = migration.index(
        "revoke create on schema private from simula_worker_owner;",
        postgres_role,
    )
    postgres_owned_grant = migration.index(
        "grant update (event_id) on table private.behavioral_action_events",
        worker_schema_revoke,
    )

    assert (
        command_schema_grant
        < command_role
        < demo_patch
        < postgres_after_demo
        < command_schema_revoke
        < worker_schema_grant
        < worker_role
        < artifact_patch
        < worker_grant
        < postgres_role
        < worker_schema_revoke
        < postgres_owned_grant
    )


def test_campaign_lab_runtime_head_patch_runs_as_function_owner() -> None:
    migration = (
        ROOT / "supabase" / "migrations" / "20260802105930_campaign_lab_mutation_idempotency.sql"
    ).read_text(encoding="utf-8")

    command_schema_revoke = migration.index(
        "revoke create on schema private from simula_command_owner;"
    )
    worker_schema_grant = migration.index(
        "grant create on schema private to simula_worker_owner;",
        command_schema_revoke,
    )
    worker_role = migration.index("set role simula_worker_owner;", worker_schema_grant)
    runtime_patch = migration.index("do $patch_campaign_lab_runtime_head$", worker_role)
    reset_role = migration.index("reset role;", runtime_patch)
    postgres_role = migration.index("set role postgres;", reset_role)
    worker_schema_revoke = migration.index(
        "revoke create on schema private from simula_worker_owner;",
        postgres_role,
    )

    assert (
        command_schema_revoke
        < worker_schema_grant
        < worker_role
        < runtime_patch
        < reset_role
        < postgres_role
        < worker_schema_revoke
    )


def test_behavioral_result_delete_grant_runs_as_table_owner() -> None:
    migration = (
        ROOT / "supabase" / "migrations" / "20260730170000_fix_behavioral_run_delete_cascade.sql"
    ).read_text(encoding="utf-8")

    owner_role = migration.index("set role simula_worker_owner;")
    delete_grant = migration.index(
        "grant delete on table api.behavioral_run_results to simula_worker_owner;"
    )
    verification = migration.index("do $verify_behavioral_result_delete$", delete_grant)
    postgres_role = migration.index("set role postgres;", verification)

    assert owner_role < delete_grant < verification < postgres_role


def test_queue_transport_seed_precedes_forced_row_level_security() -> None:
    migration = (
        ROOT / "supabase" / "migrations" / "20260730190000_m3_queue_transport_fence.sql"
    ).read_text(encoding="utf-8")

    assert migration.index("insert into private.queue_transport_control") < migration.index(
        "alter table private.queue_transport_control force row level security"
    )


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
