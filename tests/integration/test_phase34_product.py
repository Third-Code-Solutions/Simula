from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

import pytest
import simula_api.database as database_module
from simula_core.arq_codec import job_id_for
from simula_core.queue_runtime import create_queue_client
from simula_core.simulation import DeterministicMockProvider
from simula_worker.dispatcher import (
    RedisDispatchClient,
    RedisRunQueue,
    RunDispatcher,
)
from simula_worker.main import process_run_v1

from tests.integration.test_api_m2 import (
    LOCAL_REDIS_URL,
    OWNER_A,
    OWNER_B,
    VIEWER_A,
    _api_client,
    _headers,
    _local_supabase,
    _project_payload,
)
from tests.integration.test_database_boundary import LOCAL_USERS, _sign_in
from tests.integration.test_m3_run_pipeline import _remove_exact_queue_keys, _worker_database


@pytest.mark.integration
async def test_phase34_methodology_and_product_commands(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_database_problem = database_module._database_problem

    def report_database_problem(error: object) -> object:
        diagnostic = getattr(error, "diag", None)
        print(
            "database failure:",
            getattr(error, "sqlstate", None),
            getattr(diagnostic, "message_primary", None),
            getattr(diagnostic, "message_detail", None),
            getattr(diagnostic, "hint", None),
            getattr(diagnostic, "constraint_name", None),
        )
        return original_database_problem(error)  # type: ignore[arg-type]

    monkeypatch.setattr(database_module, "_database_problem", report_database_problem)
    local_supabase = _local_supabase()
    token = _sign_in(local_supabase, OWNER_A)
    async with _api_client(monkeypatch, local_supabase) as client:
        organization = await client.post(
            "/api/v1/organizations",
            json={"name": "Phase 34 Integration"},
            headers=_headers(token, "phase34-org-create-0001"),
        )
        assert organization.status_code == 201, organization.text
        organization_id = UUID(organization.json()["id"])

        project = await client.post(
            f"/api/v1/organizations/{organization_id}/projects",
            json=_project_payload("Phase 34 Project"),
            headers=_headers(token, "phase34-project-create-0001"),
        )
        assert project.status_code == 201, project.text
        project_id = UUID(project.json()["id"])

        stimulus_ids: list[str] = []
        for index in range(2):
            stimulus = await client.post(
                f"/api/v1/projects/{project_id}/stimuli",
                json={"name": f"Variant {index + 1}", "content": f"Message {index + 1}"},
                headers=_headers(token, f"phase34-stimulus-create-000{index + 1}"),
            )
            assert stimulus.status_code == 201, stimulus.text
            stimulus_ids.append(stimulus.json()["versions"][0]["id"])

        registry = await client.get(
            "/api/v1/methodology/registry", headers={"Authorization": f"Bearer {token}"}
        )
        assert registry.status_code == 200, registry.text
        registry_body = registry.json()
        assert len(registry_body["population_frames"]) == 1
        assert len(registry_body["methodologies"]) == 1
        assert len(registry_body["providers"]) == 1

        audience_body = {
            "name": "Fictional young households",
            "manifest": {
                "schema_version": 1,
                "criteria": [
                    {
                        "attribute": "life_stage",
                        "operator": "in",
                        "value": ["early", "late"],
                    }
                ],
                "provenance_status": "demo",
                "non_representative": True,
                "target_population": "Authored fictional test cohorts only.",
            },
            "limitations": "Not representative. Use recruited human participants before acting.",
        }
        audience = await client.post(
            f"/api/v1/organizations/{organization_id}/audiences",
            json=audience_body,
            headers=_headers(token, "phase34-audience-create-0001"),
        )
        assert audience.status_code in {200, 201}, audience.text
        audience_version_id = audience.json()["audience_version_id"]
        replay = await client.post(
            f"/api/v1/organizations/{organization_id}/audiences",
            json=audience_body,
            headers=_headers(token, "phase34-audience-create-0001"),
        )
        assert replay.status_code == 200
        assert replay.headers["Idempotent-Replayed"] == "true"
        assert replay.json()["audience_id"] == audience.json()["audience_id"]

        configuration = await client.post(
            f"/api/v1/projects/{project_id}/simulation-configurations",
            json={
                "name": "Deterministic experimental configuration",
                "audience_version_id": audience_version_id,
                "population_frame_version_id": registry_body["population_frames"][0]["id"],
                "methodology_version_id": registry_body["methodologies"][0]["id"],
                "provider_configuration_version_id": registry_body["providers"][0]["id"],
                "sampling_configuration": {
                    "sample_size": 100,
                    "minimum_per_cell": 5,
                    "maximum_cells": 20,
                    "seed": 42,
                    "sparse_cell_threshold": 5,
                },
                "cost_ceiling_microusd": 0,
            },
            headers=_headers(token, "phase34-config-create-0001"),
        )
        assert configuration.status_code in {200, 201}, configuration.text
        assert configuration.json()["cost_ceiling_microusd"] == 0

        preview = await client.post(
            f"/api/v1/projects/{project_id}/methodology-previews",
            json={
                "configuration_version_id": configuration.json()["configuration_version_id"],
                "stimulus_version_id": stimulus_ids[0],
                "variant_key": "baseline",
                "variant_label": "Baseline",
            },
            headers=_headers(token, "phase34-methodology-preview-0001"),
        )
        assert preview.status_code == 200, preview.text
        assert preview.json()["data"]["methodology_result"]["schema_version"] == 2
        assert preview.json()["data"]["report"]["schema_version"] == "2.0.0"
        assert preview.json()["data"]["report"]["transparency"]["numerical_output_kind"] == (
            "heuristic_score"
        )

        run = await client.post(
            f"/api/v1/projects/{project_id}/runs",
            json={"stimulus_version_id": stimulus_ids[0]},
            headers=_headers(token, "phase34-durable-run-0001"),
        )
        assert run.status_code == 202, run.text
        run_id = UUID(run.json()["id"])
        job_id = job_id_for(run_id, generation=1)
        queue = create_queue_client(LOCAL_REDIS_URL, max_connections=4)
        try:
            async with _worker_database(monkeypatch) as worker_database:
                dispatcher = RunDispatcher(
                    worker_database,
                    RedisRunQueue(cast(RedisDispatchClient, queue)),
                )
                dispatched = await dispatcher.dispatch_once()
                assert dispatched.claimed >= 1
                assert dispatched.confirmed == dispatched.claimed
                await process_run_v1(
                    {"job_id": job_id, "job_try": 1},
                    {"schema_version": 1, "run_id": str(run_id)},
                    database=worker_database,
                    provider=DeterministicMockProvider(),
                )
        finally:
            await queue.aclose(close_connection_pool=True)
            await _remove_exact_queue_keys(job_id)

        linked_preview = await client.post(
            f"/api/v1/projects/{project_id}/methodology-previews",
            json={
                "configuration_version_id": configuration.json()["configuration_version_id"],
                "stimulus_version_id": stimulus_ids[0],
                "variant_key": "baseline",
                "variant_label": "Baseline",
                "run_id": str(run_id),
            },
            headers=_headers(token, "phase34-linked-preview-0001"),
        )
        assert linked_preview.status_code == 200, linked_preview.text

        durable_report = await client.post(
            f"/api/v1/runs/{run_id}/methodology-reports",
            json={
                "configuration_version_id": configuration.json()["configuration_version_id"],
                "variant_key": "baseline",
                "variant_label": "Baseline",
            },
            headers=_headers(token, "phase34-durable-report-0001"),
        )
        assert durable_report.status_code == 201, durable_report.text
        report_id = durable_report.json()["data"]["report_id"]
        assert durable_report.json()["data"]["artifact"]["identity"]["run_id"] == str(run_id)

        exported = await client.post(
            f"/api/v1/reports/{report_id}/exports",
            json={
                "format": "json",
                "expires_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            },
            headers=_headers(token, "phase34-durable-export-0001"),
        )
        assert exported.status_code == 201, exported.text
        downloaded = await client.get(
            f"/api/v1/exports/{exported.json()['data']['export_id']}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert downloaded.status_code == 200
        assert downloaded.headers["content-type"].startswith("application/json")
        assert downloaded.json()["schema_version"] == "2.0.0"

        variants = await client.post(
            f"/api/v1/projects/{project_id}/variant-groups",
            json={
                "name": "Headline variants",
                "members": [
                    {
                        "stimulus_version_id": stimulus_ids[0],
                        "variant_key": "baseline",
                        "label": "Baseline",
                    },
                    {
                        "stimulus_version_id": stimulus_ids[1],
                        "variant_key": "challenger",
                        "label": "Challenger",
                    },
                ],
            },
            headers=_headers(token, "phase34-variants-create-0001"),
        )
        assert variants.status_code in {200, 201}, variants.text
        assert len(variants.json()["data"]["members"]) == 2
        variant_group_id = variants.json()["data"]["variant_group_id"]

        candidate_run = await client.post(
            f"/api/v1/projects/{project_id}/runs",
            json={"stimulus_version_id": stimulus_ids[1]},
            headers=_headers(token, "phase34-candidate-run-0001"),
        )
        assert candidate_run.status_code == 202, candidate_run.text
        candidate_run_id = UUID(candidate_run.json()["id"])
        candidate_job_id = job_id_for(candidate_run_id, generation=1)
        candidate_queue = create_queue_client(LOCAL_REDIS_URL, max_connections=4)
        try:
            async with _worker_database(monkeypatch) as worker_database:
                dispatcher = RunDispatcher(
                    worker_database,
                    RedisRunQueue(cast(RedisDispatchClient, candidate_queue)),
                )
                dispatched = await dispatcher.dispatch_once()
                assert dispatched.claimed >= 1
                assert dispatched.confirmed == dispatched.claimed
                await process_run_v1(
                    {"job_id": candidate_job_id, "job_try": 1},
                    {"schema_version": 1, "run_id": str(candidate_run_id)},
                    database=worker_database,
                    provider=DeterministicMockProvider(),
                )
        finally:
            await candidate_queue.aclose(close_connection_pool=True)
            await _remove_exact_queue_keys(candidate_job_id)

        candidate_report = await client.post(
            f"/api/v1/runs/{candidate_run_id}/methodology-reports",
            json={
                "configuration_version_id": configuration.json()["configuration_version_id"],
                "variant_key": "challenger",
                "variant_label": "Challenger",
            },
            headers=_headers(token, "phase34-candidate-report-0001"),
        )
        assert candidate_report.status_code == 201, candidate_report.text
        comparison = await client.get(
            f"/api/v1/variant-groups/{variant_group_id}/comparison",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert comparison.status_code == 200, comparison.text
        comparison_body = comparison.json()["items"][0]["comparison"]
        assert comparison_body["compatibility"] == "compatible"
        assert "winner" not in comparison_body

        feedback = await client.post(
            f"/api/v1/organizations/{organization_id}/feedback",
            json={
                "run_id": None,
                "kind": "user_correction",
                "observed_at": datetime.now(UTC).isoformat(),
                "payload": {"note": "Separate from modeled outputs."},
                "provenance": {"source": "integration_test"},
                "rights_basis": "Authored non-personal test data.",
            },
            headers=_headers(token, "phase34-feedback-create-0001"),
        )
        assert feedback.status_code in {200, 201}, feedback.text

        flag = await client.put(
            f"/api/v1/organizations/{organization_id}/feature-flags/variant_comparison",
            json={"enabled": True, "reason": "Integration verification"},
            headers=_headers(token, "phase34-feature-flag-0001"),
        )
        assert flag.status_code == 200, flag.text
        assert flag.json()["data"]["enabled"] is True

        invitation = await client.post(
            f"/api/v1/organizations/{organization_id}/invitations",
            json={
                "email": VIEWER_A,
                "role": "viewer",
                "expires_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            },
            headers=_headers(token, "phase34-invitation-create-0001"),
        )
        assert invitation.status_code == 201, invitation.text
        invitation_token = invitation.json()["data"]["invitation_token"]
        viewer_token = _sign_in(local_supabase, VIEWER_A)
        accepted = await client.post(
            "/api/v1/organization-invitations/accept",
            json={"token": invitation_token},
            headers=_headers(viewer_token, "phase34-invitation-accept-0001"),
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["data"]["status"] == "accepted"

        owner_dashboard = await client.get(
            f"/api/v1/organizations/{organization_id}/dashboard",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert owner_dashboard.status_code == 200, owner_dashboard.text
        assert owner_dashboard.json()["role"] == "owner"
        assert owner_dashboard.json()["permissions"] == {
            "can_create_projects": True,
            "can_create_runs": True,
            "can_manage_team": True,
            "can_manage_settings": True,
            "can_view_audit": True,
        }
        assert owner_dashboard.json()["metrics"]["projects"] == 1
        assert owner_dashboard.json()["metrics"]["reports"] == 2

        viewer_dashboard = await client.get(
            f"/api/v1/organizations/{organization_id}/dashboard",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert viewer_dashboard.status_code == 200, viewer_dashboard.text
        assert viewer_dashboard.json()["role"] == "viewer"
        assert viewer_dashboard.json()["permissions"] == {
            "can_create_projects": False,
            "can_create_runs": False,
            "can_manage_team": False,
            "can_manage_settings": False,
            "can_view_audit": False,
        }
        assert viewer_dashboard.json()["recent_projects"][0]["id"] == str(project_id)
        viewer_admin = await client.get(
            f"/api/v1/organizations/{organization_id}/admin-summary",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert viewer_admin.status_code == 403

        foreign_token = _sign_in(local_supabase, OWNER_B)
        foreign_dashboard = await client.get(
            f"/api/v1/organizations/{organization_id}/dashboard",
            headers={"Authorization": f"Bearer {foreign_token}"},
        )
        assert foreign_dashboard.status_code == 404

        cross_tenant_share = await client.post(
            f"/api/v1/reports/{report_id}/shares",
            json={
                "recipient_user_id": LOCAL_USERS[OWNER_B],
                "permission": "view",
                "expires_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            },
            headers=_headers(token, "phase34-share-cross-tenant-0001"),
        )
        assert cross_tenant_share.status_code == 422, cross_tenant_share.text

        share = await client.post(
            f"/api/v1/reports/{report_id}/shares",
            json={
                "recipient_user_id": LOCAL_USERS[VIEWER_A],
                "permission": "view",
                "expires_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            },
            headers=_headers(token, "phase34-share-create-0001"),
        )
        assert share.status_code == 201, share.text
        share_id = share.json()["data"]["share_id"]
        share_token = share.json()["data"]["share_token"]
        shared_report = await client.get(
            f"/api/v1/shared-reports/{share_token}",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert shared_report.status_code == 200, shared_report.text
        assert shared_report.json()["data"]["report_id"] == report_id
        listed_shares = await client.get(
            f"/api/v1/reports/{report_id}/shares",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert listed_shares.status_code == 200, listed_shares.text
        assert listed_shares.json()["items"][0]["access_count"] == 1
        revoked = await client.delete(
            f"/api/v1/report-shares/{share_id}",
            headers=_headers(token, "phase34-share-revoke-0001"),
        )
        assert revoked.status_code == 200, revoked.text
        denied_after_revoke = await client.get(
            f"/api/v1/shared-reports/{share_token}",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert denied_after_revoke.status_code == 404

        admin = await client.get(
            f"/api/v1/organizations/{organization_id}/admin-summary",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert admin.status_code == 200, admin.text
        assert admin.json()["data"]["projects"] == 1
        assert admin.json()["data"]["audiences"] == 1
        assert admin.json()["data"]["feedback_records"] == 1
        assert admin.json()["data"]["pending_invitations"] == 0

        audit = await client.get(
            f"/api/v1/organizations/{organization_id}/audit",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert audit.status_code == 200, audit.text
        actions = {item["action"] for item in audit.json()["items"]}
        assert {
            "audience.created",
            "simulation_configuration.created",
            "variant_group.created",
            "feedback.created",
            "feature_flag.updated",
            "invitation.created",
            "invitation.accepted",
            "share.created",
            "share.accessed",
            "share.revoked",
        } <= actions
