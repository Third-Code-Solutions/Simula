from __future__ import annotations

import asyncio
import os
import secrets
import shutil
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response
from simula_api.app import create_app

from tests.integration.test_database_boundary import (
    LOCAL_USERS,
    SUPABASE_DB_CONTAINER,
    LocalSupabase,
    _parse_env_output,
    _run_captured,
    _sign_in,
)

OWNER_A = "owner-a@simula.local"
VIEWER_A = "viewer-a@simula.local"
OWNER_B = "owner-b@simula.local"


def _set_disposable_api_password() -> str:
    inspect = _run_captured(
        [
            "docker",
            "inspect",
            "--format",
            "{{range .Config.Env}}{{println .}}{{end}}",
            SUPABASE_DB_CONTAINER,
        ]
    )
    if inspect.returncode != 0:
        pytest.fail("local Supabase database container is unavailable")
    root_password_line = next(
        (line for line in inspect.stdout.splitlines() if line.startswith("POSTGRES_PASSWORD=")),
        None,
    )
    if root_password_line is None:
        pytest.fail("local Supabase bootstrap password is unavailable")
    root_password = root_password_line.removeprefix("POSTGRES_PASSWORD=")
    api_password = secrets.token_urlsafe(32)
    changed = _run_captured(
        [
            "docker",
            "exec",
            "-i",
            "-e",
            "PGPASSWORD",
            SUPABASE_DB_CONTAINER,
            "psql",
            "-h",
            "127.0.0.1",
            "-U",
            "supabase_admin",
            "-d",
            "postgres",
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            f"alter role simula_api password '{api_password}';",
        ],
        environment={**os.environ, "PGPASSWORD": root_password},
    )
    if changed.returncode != 0:
        pytest.fail("could not inject the disposable simula_api password")
    return api_password


def _add_viewer_membership(organization_id: UUID) -> None:
    inspect = _run_captured(
        [
            "docker",
            "inspect",
            "--format",
            "{{range .Config.Env}}{{println .}}{{end}}",
            SUPABASE_DB_CONTAINER,
        ]
    )
    root_password_line = next(
        (line for line in inspect.stdout.splitlines() if line.startswith("POSTGRES_PASSWORD=")),
        None,
    )
    if root_password_line is None:
        pytest.fail("local Supabase bootstrap password is unavailable")
    root_password = root_password_line.removeprefix("POSTGRES_PASSWORD=")
    viewer_id = LOCAL_USERS[VIEWER_A]
    owner_id = LOCAL_USERS[OWNER_A]
    membership_sql = """
        insert into api.organization_memberships
          (organization_id, user_id, role, created_by)
        values
          (:'organization_id'::uuid, :'viewer_id'::uuid, 'viewer', :'owner_id'::uuid)
        on conflict (organization_id, user_id) do nothing;
    """
    inserted = _run_captured(
        [
            "docker",
            "exec",
            "-i",
            "-e",
            "PGPASSWORD",
            SUPABASE_DB_CONTAINER,
            "psql",
            "-h",
            "127.0.0.1",
            "-U",
            # This is a fixture-only seed. The application role must not be
            # able to create a viewer membership outside a future command.
            "postgres",
            "-d",
            "postgres",
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            "-v",
            f"organization_id={organization_id}",
            "-v",
            f"viewer_id={viewer_id}",
            "-v",
            f"owner_id={owner_id}",
        ],
        environment={**os.environ, "PGPASSWORD": root_password},
        input_text=membership_sql,
    )
    if inserted.returncode != 0:
        pytest.fail(
            "could not create the disposable viewer membership: "
            f"{inserted.stderr.strip() or inserted.stdout.strip()}"
        )


def _local_supabase() -> LocalSupabase:
    pnpm = shutil.which("pnpm")
    if pnpm is None:
        pytest.fail("pnpm executable is unavailable")
    status = _run_captured([pnpm, "exec", "supabase", "status", "--output", "env"])
    if status.returncode != 0:
        pytest.fail("local Supabase status failed")
    values = _parse_env_output(status.stdout)
    api_url = values.get("API_URL")
    publishable_key = values.get("PUBLISHABLE_KEY")
    if api_url != "http://127.0.0.1:54321" or not publishable_key:
        pytest.fail("local Supabase did not return its loopback publishable configuration")
    return LocalSupabase(api_url=api_url, publishable_key=publishable_key)


@asynccontextmanager
async def _api_client(
    monkeypatch: pytest.MonkeyPatch,
    local_supabase: LocalSupabase,
) -> AsyncIterator[AsyncClient]:
    api_password = _set_disposable_api_password()
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "test")
    monkeypatch.setenv("SIMULA_RELEASE_SHA", "a" * 40)
    monkeypatch.setenv("SIMULA_LOG_LEVEL", "INFO")
    monkeypatch.setenv(
        "SIMULA_DATABASE_URL",
        f"postgresql://simula_api:{api_password}@127.0.0.1:54322/postgres?sslmode=disable",
    )
    monkeypatch.setenv("SIMULA_SUPABASE_URL", local_supabase.api_url)
    monkeypatch.setenv(
        "SIMULA_SUPABASE_JWKS_URL",
        f"{local_supabase.api_url}/auth/v1/.well-known/jwks.json",
    )
    monkeypatch.setenv("SIMULA_SUPABASE_PUBLISHABLE_KEY", local_supabase.publishable_key)
    monkeypatch.setenv("SIMULA_CURSOR_SECRET", secrets.token_urlsafe(48))
    monkeypatch.setenv("SIMULA_CORS_ORIGINS", "http://127.0.0.1:3000")
    app = create_app()
    async with app.router.lifespan_context(app):
        assert app.state.domain_ready is True
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client


def _headers(token: str, key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Idempotency-Key": key}


def _project_payload(name: str) -> dict[str, str]:
    return {
        "name": name,
        "objective": "Pressure-test fictional campaign wording before human research.",
        "market": "philippines",
        "language": "en",
        "category": "campaign_message",
    }


def _assert_problem(response: Response, *, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["code"] == code
    UUID(response.json()["correlation_id"])


@pytest.mark.integration
async def test_m2_real_auth_api_database_and_tenant_boundaries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    local_supabase = _local_supabase()
    owner_a_token = _sign_in(local_supabase, OWNER_A)
    viewer_a_token = _sign_in(local_supabase, VIEWER_A)
    owner_b_token = _sign_in(local_supabase, OWNER_B)
    suffix = uuid4().hex

    async with _api_client(monkeypatch, local_supabase) as client:
        me = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {owner_a_token}"})
        assert me.status_code == 200
        assert me.json() == {"user_id": LOCAL_USERS[OWNER_A]}

        organization_key = f"m2-org-{suffix}"
        organization_payload = {"name": f"Fictional Studio {suffix[:8]}"}
        created_organization = await client.post(
            "/api/v1/organizations",
            headers=_headers(owner_a_token, organization_key),
            json=organization_payload,
        )
        assert created_organization.status_code == 201
        organization = created_organization.json()
        organization_id = UUID(organization["id"])
        assert organization["role"] == "owner"
        assert created_organization.headers["idempotent-replayed"] == "false"

        replay = await client.post(
            "/api/v1/organizations",
            headers=_headers(owner_a_token, organization_key),
            json=organization_payload,
        )
        assert replay.status_code == 201
        assert replay.headers["idempotent-replayed"] == "true"
        assert replay.json() == organization

        conflict = await client.post(
            "/api/v1/organizations",
            headers=_headers(owner_a_token, organization_key),
            json={"name": f"Different Studio {suffix[:8]}"},
        )
        _assert_problem(conflict, status=409, code="idempotency_key_reused")

        concurrent_key = f"m2-org-concurrent-{suffix}"
        concurrent_payload = {"name": f"Concurrent Studio {suffix[:8]}"}
        concurrent = await asyncio.gather(
            *[
                client.post(
                    "/api/v1/organizations",
                    headers=_headers(owner_a_token, concurrent_key),
                    json=concurrent_payload,
                )
                for _ in range(8)
            ]
        )
        assert {response.status_code for response in concurrent} == {201}
        assert len({response.json()["id"] for response in concurrent}) == 1

        organizations = await client.get(
            "/api/v1/organizations", headers={"Authorization": f"Bearer {owner_a_token}"}
        )
        assert organizations.status_code == 200
        assert organization["id"] in {item["id"] for item in organizations.json()["items"]}

        project_key = f"m2-project-{suffix}"
        created_project = await client.post(
            f"/api/v1/organizations/{organization_id}/projects",
            headers=_headers(owner_a_token, project_key),
            json=_project_payload(f"Fictional Launch {suffix[:8]}"),
        )
        assert created_project.status_code == 201
        assert created_project.headers["etag"] == '"1"'
        project = created_project.json()
        project_id = UUID(project["id"])

        _add_viewer_membership(organization_id)
        viewer_project = await client.get(
            f"/api/v1/projects/{project_id}", headers={"Authorization": f"Bearer {viewer_a_token}"}
        )
        assert viewer_project.status_code == 200
        viewer_mutation = await client.patch(
            f"/api/v1/projects/{project_id}",
            headers={"Authorization": f"Bearer {viewer_a_token}", "If-Match": '"1"'},
            json={"name": "Viewer Mutation"},
        )
        _assert_problem(viewer_mutation, status=403, code="forbidden")

        stimulus_key = f"m2-stimulus-{suffix}"
        stimulus_content_v1 = "Try the fictional Northstar service today."
        created_stimulus = await client.post(
            f"/api/v1/projects/{project_id}/stimuli",
            headers=_headers(owner_a_token, stimulus_key),
            json={"name": "Fictional Message", "content": stimulus_content_v1},
        )
        assert created_stimulus.status_code == 201
        stimulus = created_stimulus.json()
        stimulus_id = UUID(stimulus["id"])
        assert stimulus["versions"][0]["version"] == 1

        version_content_v2 = "Try the fictional Northstar service when it suits your team."
        appended = await client.post(
            f"/api/v1/stimuli/{stimulus_id}/versions",
            headers=_headers(owner_a_token, f"m2-version-{suffix}"),
            json={"content": version_content_v2},
        )
        assert appended.status_code == 201
        assert appended.json()["version"] == 2

        project_detail = await client.get(
            f"/api/v1/projects/{project_id}", headers={"Authorization": f"Bearer {owner_a_token}"}
        )
        assert project_detail.status_code == 200
        assert [
            version["content"] for version in project_detail.json()["stimuli"][0]["versions"]
        ] == [
            stimulus_content_v1,
            version_content_v2,
        ]

        foreign_read = await client.get(
            f"/api/v1/projects/{project_id}", headers={"Authorization": f"Bearer {owner_b_token}"}
        )
        _assert_problem(foreign_read, status=404, code="not_found")
        assert stimulus_content_v1 not in foreign_read.text
        foreign_write = await client.post(
            f"/api/v1/projects/{project_id}/stimuli",
            headers=_headers(owner_b_token, f"m2-foreign-{suffix}"),
            json={"name": "Foreign", "content": "This must not enumerate tenant content."},
        )
        _assert_problem(foreign_write, status=404, code="not_found")
