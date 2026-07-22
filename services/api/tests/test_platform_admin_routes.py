from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from simula_api.app import create_app
from simula_api.auth import SupabaseTokenVerifier, VerifiedIdentity
from simula_api.cursor import CursorCodec
from simula_api.database import DatabaseGateway
from simula_api.problems import unauthenticated
from simula_api.rate_limits import RateLimiter
from simula_api.services import AppServices

ADMIN_ID = UUID("00000000-0000-4000-8000-000000000004")
SESSION_ID = UUID("30000000-0000-4000-8000-000000000004")
ORGANIZATION_ID = UUID("10000000-0000-4000-8000-000000000001")
TOKEN = "platform-admin-test-bearer"  # noqa: S105 - inert unit-test fixture.


class FakeVerifier:
    async def verify(self, token: str) -> VerifiedIdentity:
        if token != TOKEN:
            raise unauthenticated()
        return VerifiedIdentity(
            user_id=ADMIN_ID,
            issuer="http://127.0.0.1:54321/auth/v1",
            expires_at=4_102_444_800,
            session_id=SESSION_ID,
        )


class FakeRateLimiter:
    async def require_unauthenticated(self, *, ip_hash: str) -> None:
        assert ip_hash

    async def release_unauthenticated(self, *, ip_hash: str) -> None:
        assert ip_hash

    async def require_general(self, *, user_id: UUID, **_: object) -> None:
        assert user_id == ADMIN_ID


class FakeDatabase:
    def __init__(self, *, allowed: bool) -> None:
        self.allowed = allowed
        self.reads = 0

    async def record_sign_in_success(self, _: VerifiedIdentity, **__: object) -> bool:
        return True

    async def is_platform_superadmin(self, identity: VerifiedIdentity) -> bool:
        assert identity.user_id == ADMIN_ID
        return self.allowed

    async def read_product_json(self, _: VerifiedIdentity, **kwargs: Any) -> dict[str, object]:
        assert kwargs["operation"] == "platform_admin_dashboard"
        assert kwargs["parameters"] == (25,)
        self.reads += 1
        return {
            "generated_at": datetime(2026, 7, 22, tzinfo=UTC),
            "metrics": {
                "active_runs": 1,
                "feedback_records": 2,
                "organizations": 1,
                "projects": 3,
                "reports": 4,
                "runs": 5,
                "users": 2,
            },
            "organizations": [
                {
                    "created_at": datetime(2026, 7, 21, tzinfo=UTC),
                    "id": ORGANIZATION_ID,
                    "members": 2,
                    "name": "Research Lab",
                    "projects": 3,
                    "reports": 4,
                    "runs": 5,
                    "status": "active",
                    "updated_at": datetime(2026, 7, 22, tzinfo=UTC),
                }
            ],
            "role": "superadmin",
            "user_id": ADMIN_ID,
        }


def app_with_database(database: FakeDatabase) -> FastAPI:
    services = AppServices(
        verifier=cast(SupabaseTokenVerifier, FakeVerifier()),
        database=cast(DatabaseGateway, database),
        cursors=CursorCodec(b"a" * 32),
        rate_limiter=cast(RateLimiter, FakeRateLimiter()),
    )
    return create_app(services=services)


async def test_platform_admin_dashboard_returns_bounded_live_projection() -> None:
    database = FakeDatabase(allowed=True)
    async with AsyncClient(
        transport=ASGITransport(app=app_with_database(database)), base_url="http://test"
    ) as client:
        response = await client.get(
            "/api/v1/platform-admin/dashboard?organization_limit=25",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )

    assert response.status_code == 200
    assert response.json()["role"] == "superadmin"
    assert response.json()["metrics"]["organizations"] == 1
    assert response.json()["organizations"][0]["name"] == "Research Lab"
    assert database.reads == 1


async def test_platform_admin_dashboard_denies_an_authenticated_non_admin() -> None:
    database = FakeDatabase(allowed=False)
    async with AsyncClient(
        transport=ASGITransport(app=app_with_database(database)), base_url="http://test"
    ) as client:
        response = await client.get(
            "/api/v1/platform-admin/dashboard",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )

    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"
    assert database.reads == 0
