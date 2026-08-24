from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID

import pytest
import simula_api.phase34_routes as phase34_routes
from fastapi import Request, Response
from simula_api.auth import VerifiedIdentity
from simula_api.phase34_models import (
    ExportCreate,
    FeedbackCreate,
    ReportCreate,
    RunMethodologyReportCreate,
    VariantGroupCreate,
)
from simula_api.problems import AppProblem


def _identity() -> VerifiedIdentity:
    return VerifiedIdentity(
        user_id=UUID("10000000-0000-4000-8000-000000000001"),
        issuer="https://test.invalid/auth/v1",
        expires_at=4_102_444_800,
        session_id=UUID("10000000-0000-4000-8000-000000000002"),
    )


async def test_generic_client_authored_report_persistence_is_gone() -> None:
    with pytest.raises(AppProblem) as captured:
        await phase34_routes.create_report(
            UUID("20000000-0000-4000-8000-000000000001"),
            ReportCreate(artifact={}),
            cast(Request, object()),
            Response(),
            "report-upload-is-deprecated-0001",
            _identity(),
        )

    assert captured.value.status == 410
    assert captured.value.code == "unsupported_scope"


async def test_legacy_report_reads_are_quarantined_before_database_access(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        phase34_routes,
        "_services",
        lambda request: (_ for _ in ()).throw(
            AssertionError("legacy report reached database read")
        ),
    )

    with pytest.raises(AppProblem) as captured:
        await phase34_routes.get_report(
            UUID("20500000-0000-4000-8000-000000000001"),
            cast(Request, object()),
            _identity(),
        )

    assert captured.value.status == 410
    assert captured.value.code == "unsupported_scope"


async def test_legacy_report_exports_and_downloads_are_quarantined(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        phase34_routes,
        "_services",
        lambda request: (_ for _ in ()).throw(
            AssertionError("legacy report export reached database")
        ),
    )

    with pytest.raises(AppProblem) as create_failure:
        await phase34_routes.create_export(
            UUID("20600000-0000-4000-8000-000000000001"),
            ExportCreate(format="json", expires_at=datetime(2026, 8, 25, tzinfo=UTC)),
            cast(Request, object()),
            Response(),
            "legacy-report-export-0001",
            _identity(),
        )
    with pytest.raises(AppProblem) as download_failure:
        await phase34_routes.download_export(
            UUID("20600000-0000-4000-8000-000000000002"),
            cast(Request, object()),
            _identity(),
        )

    assert create_failure.value.status == 410
    assert download_failure.value.status == 410


async def test_legacy_report_share_reads_and_mutations_are_quarantined(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        phase34_routes,
        "_services",
        lambda request: (_ for _ in ()).throw(
            AssertionError("legacy report share reached database")
        ),
    )

    with pytest.raises(AppProblem) as list_failure:
        await phase34_routes.list_report_shares(
            UUID("20700000-0000-4000-8000-000000000001"),
            cast(Request, object()),
            _identity(),
        )
    with pytest.raises(AppProblem) as revoke_failure:
        await phase34_routes.revoke_report_share(
            UUID("20700000-0000-4000-8000-000000000002"),
            cast(Request, object()),
            Response(),
            "legacy-report-share-revoke-0001",
            _identity(),
        )

    assert list_failure.value.status == 410
    assert revoke_failure.value.status == 410


async def test_production_generic_feedback_intake_fails_before_persistence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "production")
    monkeypatch.setattr(
        phase34_routes,
        "_services",
        lambda request: (_ for _ in ()).throw(
            AssertionError("ungoverned feedback reached persistence")
        ),
    )

    with pytest.raises(AppProblem) as captured:
        await phase34_routes.create_feedback(
            UUID("21000000-0000-4000-8000-000000000001"),
            FeedbackCreate(
                kind="human_panel",
                observed_at=datetime(2026, 8, 24, tzinfo=UTC),
                payload={"free_form_sensitive_input": "must not persist"},
                provenance={"source": "caller-authored"},
                rights_basis="caller assertion",
            ),
            cast(Request, object()),
            Response(),
            "generic-feedback-disabled-0001",
            _identity(),
        )

    assert captured.value.status == 409
    assert "governed aggregate evidence" in captured.value.detail


async def test_production_variant_group_creation_remains_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SIMULA_ENVIRONMENT", "production")
    commands: list[str] = []

    class _Database:
        async def execute_product_command(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
            commands.append(kwargs["operation"])
            return {"id": "22000000-0000-4000-8000-000000000001", "replayed": False}

    monkeypatch.setattr(
        phase34_routes,
        "_services",
        lambda request: SimpleNamespace(database=_Database()),
    )
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/projects/project/variant-groups",
            "headers": [],
        }
    )
    request.state.correlation_id = "22000000-0000-4000-8000-000000000002"

    result = await phase34_routes.create_variant_group(
        UUID("22000000-0000-4000-8000-000000000003"),
        VariantGroupCreate.model_validate(
            {
                "name": "Production comparison",
                "members": [
                    {
                        "stimulus_version_id": "22000000-0000-4000-8000-000000000004",
                        "variant_key": "control",
                        "label": "Control",
                    },
                    {
                        "stimulus_version_id": "22000000-0000-4000-8000-000000000005",
                        "variant_key": "variant_b",
                        "label": "Variant B",
                    },
                ],
            }
        ),
        request,
        Response(),
        "variant-group-production-0001",
        _identity(),
    )

    assert result.data["id"] == "22000000-0000-4000-8000-000000000001"
    assert commands == ["create_variant_group"]


async def test_methodology_report_rejects_configuration_not_bound_to_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    submitted_configuration_id = UUID("30000000-0000-4000-8000-000000000002")

    monkeypatch.setattr(
        phase34_routes,
        "_services",
        lambda request: (_ for _ in ()).throw(
            AssertionError("ad-hoc manifest binding reached database")
        ),
    )

    with pytest.raises(AppProblem) as captured:
        await phase34_routes.create_run_methodology_report(
            UUID("30000000-0000-4000-8000-000000000005"),
            RunMethodologyReportCreate(
                configuration_version_id=submitted_configuration_id,
                variant_key="baseline",
                variant_label="Baseline",
            ),
            cast(Request, object()),
            Response(),
            "methodology-report-config-0001",
            _identity(),
        )

    assert captured.value.status == 409
    assert captured.value.code == "version_conflict"


async def test_methodology_report_rejects_run_without_frozen_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Database:
        async def read_product_rows(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
            operation = kwargs.get("operation")
            if operation != "read_run_for_methodology_report":
                raise AssertionError("an unbound run reached methodology preview")
            return [
                {
                    "project_id": UUID("40000000-0000-4000-8000-000000000001"),
                    "stimulus_version_id": UUID("40000000-0000-4000-8000-000000000002"),
                    "configuration_version_id": None,
                }
            ]

    monkeypatch.setattr(
        phase34_routes,
        "_services",
        lambda request: SimpleNamespace(database=_Database()),
    )

    with pytest.raises(AppProblem) as captured:
        await phase34_routes.create_run_methodology_report(
            UUID("40000000-0000-4000-8000-000000000003"),
            RunMethodologyReportCreate(
                configuration_version_id=UUID("40000000-0000-4000-8000-000000000004"),
                variant_key="baseline",
                variant_label="Baseline",
            ),
            cast(Request, object()),
            Response(),
            "methodology-report-unbound-0001",
            _identity(),
        )

    assert captured.value.status == 409
    assert captured.value.code == "version_conflict"
