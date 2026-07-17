from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from simula_api.app import CORRELATION_HEADER, create_app
from simula_api.auth import SupabaseTokenVerifier, VerifiedIdentity
from simula_api.cursor import CursorCodec
from simula_api.database import DatabaseGateway
from simula_api.models import (
    OrganizationResponse,
    OrganizationRole,
    OrganizationStatus,
    ProjectPatch,
    ProjectResponse,
    ProjectStatus,
)
from simula_api.problems import unauthenticated
from simula_api.services import AppServices

OWNER_ID = UUID("00000000-0000-4000-8000-000000000001")
ORGANIZATION_ID = UUID("10000000-0000-4000-8000-000000000001")
PROJECT_ID = UUID("20000000-0000-4000-8000-000000000001")
NOW = datetime(2026, 7, 17, tzinfo=UTC)
TEST_BEARER = "synthetic-bearer-value"


class FakeVerifier:
    async def verify(self, token: str) -> VerifiedIdentity:
        if token != TEST_BEARER:
            raise unauthenticated()
        return VerifiedIdentity(
            user_id=OWNER_ID,
            issuer="http://127.0.0.1:54321/auth/v1",
            expires_at=4_102_444_800,
        )


class FakeDatabase:
    def __init__(self) -> None:
        self.organization_names: list[str] = []
        self.project_updates: list[tuple[UUID, int, ProjectPatch]] = []

    async def create_organization(
        self, _: VerifiedIdentity, **kwargs: Any
    ) -> tuple[OrganizationResponse, bool]:
        name = cast(str, kwargs["name"])
        self.organization_names.append(name)
        return (
            OrganizationResponse(
                id=ORGANIZATION_ID,
                name=name,
                role=OrganizationRole.OWNER,
                status=OrganizationStatus.ACTIVE,
                created_at=NOW,
            ),
            False,
        )

    async def update_project(
        self,
        _: VerifiedIdentity,
        *,
        project_id: UUID,
        expected_version: int,
        patch: ProjectPatch,
        correlation_id: UUID,
    ) -> ProjectResponse:
        assert correlation_id.version in {4, 7}
        self.project_updates.append((project_id, expected_version, patch))
        return ProjectResponse(
            id=project_id,
            organization_id=ORGANIZATION_ID,
            name=patch.name or "Fictional Launch",
            objective=patch.objective or "Pressure-test fictional wording.",
            market=patch.market or "philippines",
            language=patch.language or "en",
            category=patch.category or "campaign_message",
            status=ProjectStatus.ACTIVE,
            version=expected_version + 1,
            created_at=NOW,
            updated_at=NOW,
        )


def app_with_fakes() -> tuple[FastAPI, FakeDatabase]:
    database = FakeDatabase()
    services = AppServices(
        verifier=cast(SupabaseTokenVerifier, FakeVerifier()),
        database=cast(DatabaseGateway, database),
        cursors=CursorCodec(b"c" * 32),
    )
    return create_app(services=services), database


async def test_authenticated_organization_create_trims_labels_and_emits_safe_headers() -> None:
    app, database = app_with_fakes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations",
            headers={
                "Authorization": f"Bearer {TEST_BEARER}",
                "Idempotency-Key": "m2-organization-key-0001",
                CORRELATION_HEADER: "018f0bf1-0b2a-7c91-9d8a-d1bd92d5a4f4",
            },
            json={"name": "  Fictional Studio  "},
        )

    assert response.status_code == 201
    assert response.headers["idempotent-replayed"] == "false"
    assert response.headers[CORRELATION_HEADER] == "018f0bf1-0b2a-7c91-9d8a-d1bd92d5a4f4"
    assert response.json()["name"] == "Fictional Studio"
    assert database.organization_names == ["Fictional Studio"]


async def test_protected_route_fails_closed_without_a_bearer_token() -> None:
    app, _ = app_with_fakes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/organizations")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["code"] == "unauthenticated"


async def test_unknown_command_fields_are_rejected_as_rfc9457_problem() -> None:
    app, _ = app_with_fakes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations",
            headers={
                "Authorization": f"Bearer {TEST_BEARER}",
                "Idempotency-Key": "m2-organization-key-0002",
            },
            json={"name": "Fictional Studio", "unknown": "must fail"},
        )

    assert response.status_code == 422
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["code"] == "validation_error"
    assert response.json()["errors"] == [{"field": "unknown", "code": "extra_forbidden"}]


async def test_project_patch_requires_strong_if_match_and_sets_new_etag() -> None:
    app, database = app_with_fakes()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        missing = await client.patch(
            f"/api/v1/projects/{PROJECT_ID}",
            headers={"Authorization": f"Bearer {TEST_BEARER}"},
            json={"name": "Revised Launch"},
        )
        updated = await client.patch(
            f"/api/v1/projects/{PROJECT_ID}",
            headers={"Authorization": f"Bearer {TEST_BEARER}", "If-Match": '"4"'},
            json={"name": "Revised Launch"},
        )

    assert missing.status_code == 422
    assert missing.json()["errors"] == [{"field": "if-match", "code": "required"}]
    assert updated.status_code == 200
    assert updated.headers["etag"] == '"5"'
    assert database.project_updates[0][0:2] == (PROJECT_ID, 4)


async def test_actual_oversized_body_is_rejected_before_domain_processing() -> None:
    app, database = app_with_fakes()
    oversized = b'{"name":"' + b"a" * (64 * 1024) + b'"}'
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations",
            headers={
                "Authorization": f"Bearer {TEST_BEARER}",
                "Content-Type": "application/json",
                "Idempotency-Key": "m2-organization-key-0003",
            },
            content=oversized,
        )

    assert response.status_code == 413
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["code"] == "request_too_large"
    assert database.organization_names == []
