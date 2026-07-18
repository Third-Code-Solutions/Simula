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
from simula_api.problems import AppProblem, unauthenticated
from simula_api.rate_limits import RateLimiter
from simula_api.services import AppServices
from simula_api.telemetry import TRACEPARENT_HEADER

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

    async def organization_for_project(self, _: VerifiedIdentity, *, project_id: UUID) -> UUID:
        assert project_id == PROJECT_ID
        return ORGANIZATION_ID


class FakeRateLimiter:
    async def require_unauthenticated(self, *, ip_hash: str) -> None:
        assert ip_hash

    async def release_unauthenticated(self, *, ip_hash: str) -> None:
        assert ip_hash

    async def require_general(
        self,
        *,
        user_id: UUID,
        idempotency_key: str | None = None,
        idempotency_scope: str | None = None,
    ) -> None:
        assert user_id == OWNER_ID
        assert (idempotency_key is None) == (idempotency_scope is None)

    async def require_organization_create(
        self,
        *,
        user_id: UUID,
        idempotency_key: str,
        idempotency_scope: str,
    ) -> None:
        assert user_id == OWNER_ID
        assert idempotency_key
        assert idempotency_scope

    async def require_organization_mutation(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        idempotency_key: str | None = None,
        idempotency_scope: str | None = None,
    ) -> None:
        assert (user_id, organization_id) == (OWNER_ID, ORGANIZATION_ID)
        assert (idempotency_key is None) == (idempotency_scope is None)


def app_with_fakes(
    *,
    rate_limiter: RateLimiter | None = None,
    verifier: SupabaseTokenVerifier | None = None,
) -> tuple[FastAPI, FakeDatabase]:
    database = FakeDatabase()
    services = AppServices(
        verifier=verifier or cast(SupabaseTokenVerifier, FakeVerifier()),
        database=cast(DatabaseGateway, database),
        cursors=CursorCodec(b"c" * 32),
        rate_limiter=rate_limiter or cast(RateLimiter, FakeRateLimiter()),
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
    class RecordingRateLimiter(FakeRateLimiter):
        def __init__(self) -> None:
            self.ip_hashes: list[str] = []

        async def require_unauthenticated(self, *, ip_hash: str) -> None:
            self.ip_hashes.append(ip_hash)

    rate_limiter = RecordingRateLimiter()
    app, _ = app_with_fakes(rate_limiter=cast(RateLimiter, rate_limiter))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/organizations")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["code"] == "unauthenticated"
    assert len(rate_limiter.ip_hashes) == 1


async def test_pre_auth_rate_limit_does_not_charge_cors_preflight() -> None:
    class RecordingRateLimiter(FakeRateLimiter):
        def __init__(self) -> None:
            self.attempts = 0

        async def require_unauthenticated(self, *, ip_hash: str) -> None:
            assert ip_hash
            self.attempts += 1

    rate_limiter = RecordingRateLimiter()
    app, _ = app_with_fakes(rate_limiter=cast(RateLimiter, rate_limiter))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.options("/api/v1/organizations")

    assert response.status_code == 405
    assert rate_limiter.attempts == 0


async def test_pre_auth_rate_limit_stops_over_limit_malformed_bearers_before_verifier() -> None:
    class CountingVerifier:
        def __init__(self) -> None:
            self.calls = 0

        async def verify(self, _: str) -> VerifiedIdentity:
            self.calls += 1
            raise unauthenticated()

    class BurstLimiter(FakeRateLimiter):
        def __init__(self) -> None:
            self.attempts = 0

        async def require_unauthenticated(self, *, ip_hash: str) -> None:
            assert ip_hash
            self.attempts += 1
            if self.attempts > 10:
                raise AppProblem(
                    status=429,
                    code="rate_limited",
                    title="Rate limit reached",
                    detail="Retry later.",
                    retry_after=7,
                )

    limiter = BurstLimiter()
    verifier = CountingVerifier()
    app, _ = app_with_fakes(
        rate_limiter=cast(RateLimiter, limiter),
        verifier=cast(SupabaseTokenVerifier, verifier),
    )
    app.state.cors_origins = ("https://console.example.test",)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        responses = [
            await client.get(
                "/api/v1/organizations",
                headers={
                    "Authorization": "Bearer malformed",
                    "Origin": "https://console.example.test",
                },
            )
            for _ in range(11)
        ]

    assert [response.status_code for response in responses[:-1]] == [401] * 10
    assert responses[-1].status_code == 429
    assert responses[-1].headers["retry-after"] == "7"
    assert responses[-1].headers[CORRELATION_HEADER]
    assert responses[-1].headers[TRACEPARENT_HEADER]
    assert responses[-1].headers["access-control-allow-origin"] == "https://console.example.test"
    assert "Retry-After" in responses[-1].headers["access-control-expose-headers"]
    assert CORRELATION_HEADER in responses[-1].headers["access-control-expose-headers"].lower()
    assert verifier.calls == 10


async def test_rate_limit_problem_includes_retry_after_header() -> None:
    class DenyingRateLimiter:
        async def require_unauthenticated(self, *, ip_hash: str) -> None:
            assert ip_hash

        async def release_unauthenticated(self, *, ip_hash: str) -> None:
            assert ip_hash

        async def require_general(
            self,
            *,
            user_id: UUID,
            idempotency_key: str | None = None,
            idempotency_scope: str | None = None,
        ) -> None:
            assert user_id == OWNER_ID
            assert idempotency_key is None
            assert idempotency_scope is None
            raise AppProblem(
                status=429,
                code="rate_limited",
                title="Rate limit reached",
                detail="Retry later.",
                retry_after=7,
            )

        async def require_organization_create(
            self,
            *,
            user_id: UUID,
            idempotency_key: str,
            idempotency_scope: str,
        ) -> None:
            raise AssertionError((user_id, idempotency_key, idempotency_scope))

        async def require_organization_mutation(
            self,
            *,
            user_id: UUID,
            organization_id: UUID,
            idempotency_key: str | None = None,
            idempotency_scope: str | None = None,
        ) -> None:
            raise AssertionError((user_id, organization_id, idempotency_key, idempotency_scope))

    app, _ = app_with_fakes(rate_limiter=cast(RateLimiter, DenyingRateLimiter()))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/me", headers={"Authorization": f"Bearer {TEST_BEARER}"}
        )

    assert response.status_code == 429
    assert response.headers["retry-after"] == "7"
    assert response.json()["code"] == "rate_limited"


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


async def test_command_routes_reject_multipart_before_auth_or_domain_processing() -> None:
    class RecordingRateLimiter(FakeRateLimiter):
        def __init__(self) -> None:
            self.pre_auth_attempts = 0

        async def require_unauthenticated(self, *, ip_hash: str) -> None:
            assert ip_hash
            self.pre_auth_attempts += 1

    rate_limiter = RecordingRateLimiter()
    app, database = app_with_fakes(rate_limiter=cast(RateLimiter, rate_limiter))
    app.state.cors_origins = ("https://console.example.test",)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations",
            headers={
                "Authorization": f"Bearer {TEST_BEARER}",
                "Origin": "https://console.example.test",
            },
            files={"name": (None, "Fictional Studio")},
        )

    assert response.status_code == 415
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["code"] == "unsupported_media_type"
    assert response.headers["access-control-allow-origin"] == "https://console.example.test"
    assert database.organization_names == []
    assert rate_limiter.pre_auth_attempts == 1


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
    class RecordingRateLimiter(FakeRateLimiter):
        def __init__(self) -> None:
            self.pre_auth_attempts = 0

        async def require_unauthenticated(self, *, ip_hash: str) -> None:
            assert ip_hash
            self.pre_auth_attempts += 1

    rate_limiter = RecordingRateLimiter()
    app, database = app_with_fakes(rate_limiter=cast(RateLimiter, rate_limiter))
    app.state.cors_origins = ("https://console.example.test",)
    oversized = b'{"name":"' + b"a" * (64 * 1024) + b'"}'
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/organizations",
            headers={
                "Authorization": f"Bearer {TEST_BEARER}",
                "Content-Type": "application/json",
                "Idempotency-Key": "m2-organization-key-0003",
                "Origin": "https://console.example.test",
            },
            content=oversized,
        )

    assert response.status_code == 413
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["code"] == "request_too_large"
    assert response.headers["access-control-allow-origin"] == "https://console.example.test"
    assert rate_limiter.pre_auth_attempts == 1
    assert database.organization_names == []
