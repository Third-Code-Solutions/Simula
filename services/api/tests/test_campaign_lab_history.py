from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID

import pytest
import simula_api.campaign_lab_routes as routes
from fastapi import Request
from simula_api.auth import VerifiedIdentity
from simula_api.problems import AppProblem


def identity() -> VerifiedIdentity:
    return VerifiedIdentity(
        user_id=UUID("60000000-0000-4000-8000-000000000012"),
        issuer="https://test.invalid/auth/v1",
        expires_at=4_102_444_800,
        session_id=UUID("60000000-0000-4000-8000-000000000013"),
    )


async def test_history_checks_campaign_visibility_before_reading_runs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    operations: list[str] = []

    class Database:
        async def read_product_rows(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
            operations.append(kwargs["operation"])
            return []

    monkeypatch.setattr(routes, "_services", lambda request: SimpleNamespace(database=Database()))
    with pytest.raises(AppProblem) as error:
        await routes.list_campaign_runs(UUID(int=10), cast(Request, object()), identity(), 25, 0)
    assert error.value.status == 404
    assert operations == ["campaign_lab_campaign"]


async def test_history_is_tenant_scoped_paginated_and_excludes_payloads_and_quarantined_types(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    campaign_id = UUID(int=10)
    organization_id = UUID(int=20)
    reads: list[dict[str, Any]] = []

    class Database:
        async def read_product_rows(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
            if kwargs["operation"] == "campaign_lab_campaign":
                return [{"id": campaign_id, "organization_id": organization_id}]
            reads.append(kwargs)
            return [{"id": UUID(int=30), "campaign_id": campaign_id, "status": "running"}]

    monkeypatch.setattr(routes, "_services", lambda request: SimpleNamespace(database=Database()))
    result = await routes.list_campaign_runs(
        campaign_id, cast(Request, object()), identity(), 25, 50
    )
    assert result["pagination"] == {"limit": 25, "offset": 50}
    assert len(result["items"]) == 1
    assert reads[0]["parameters"] == (campaign_id, organization_id, 25, 50)
    query = reads[0]["query"]
    assert "campaign_id = %s and organization_id = %s" in query
    assert "order by created_at desc, id desc" in query
    assert "limit %s offset %s" in query
    assert "'repeated_simulation'" in query
    for forbidden in (
        "request",
        "result",
        "secret_payload",
        "'report'",
        "'historical_backtest'",
        "'survey_calibration'",
    ):
        assert forbidden not in query
