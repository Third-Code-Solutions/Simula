from __future__ import annotations

from typing import Any, cast
from uuid import UUID

import pytest
import simula_api.campaign_lab_routes as routes
from fastapi import Request, Response
from simula_api.auth import VerifiedIdentity
from simula_api.problems import AppProblem


def body() -> routes.SurveyImportCreate:
    return routes.SurveyImportCreate(
        format="generic_json",
        metadata={
            "source_id": "survey_v1",
            "source_version": "v1",
            "owner": "test",
            "license": "test-only",
            "allowed_uses": ["calibration"],
            "collection_period": "2026-Q1",
            "geography": "Philippines",
            "methodology": "consented survey",
            "consent_recorded": True,
            "authorized_for_calibration": True,
            "quality_filter_version": "quality_v1",
            "known_biases": ["test sample"],
            "coverage_limitations": ["fixture only"],
        },
        secret_payload={
            "payload": [
                {
                    "variant_key": "a",
                    "cohort_key": "metro",
                    "reaction_positive": 60,
                    "reaction_neutral": 20,
                    "reaction_negative": 15,
                    "reaction_mixed": 5,
                    "clarity": 70,
                    "relevance": 71,
                    "trust": 72,
                    "persuasiveness": 73,
                    "consideration": 74,
                }
            ]
        },
    )


def identity() -> VerifiedIdentity:
    return VerifiedIdentity(
        user_id=UUID(int=1), issuer="test", expires_at=4102444800, session_id=UUID(int=2)
    )


def test_preview_has_counts_and_binding_but_no_response_rows() -> None:
    preview = routes._survey_preview(body())
    assert preview["summary"]["accepted_response_count"] == 1
    assert preview["aggregate_group_count"] == 1
    assert set(preview) == {"summary", "aggregate_group_count", "evidence_binding", "disclosure"}
    assert preview["evidence_binding"]["version"] == "survey_import_binding_v1"
    assert len(preview["evidence_binding"]["aggregate_sha256"]) == 64


def test_changed_mapping_or_provenance_changes_transform_binding() -> None:
    original = body()
    changed = body()
    changed.metadata["methodology"] = "revised protocol"
    before = routes._survey_preview(original)["evidence_binding"]
    after = routes._survey_preview(changed)["evidence_binding"]
    assert before["raw_payload_sha256"] == after["raw_payload_sha256"]
    assert before["transform_sha256"] != after["transform_sha256"]
    assert before["aggregate_sha256"] != after["aggregate_sha256"]


def test_invalid_preview_never_echoes_raw_sensitive_values() -> None:
    invalid = body()
    invalid = invalid.model_copy(
        update={"secret_payload": {"payload": [{"email": "private@example.invalid"}]}}
    )
    with pytest.raises(AppProblem) as error:
        routes._survey_preview(invalid)
    assert "private@example.invalid" not in error.value.detail
    assert error.value.status == 422


def test_preview_rejects_oversized_payload() -> None:
    invalid = body()
    invalid = invalid.model_copy(update={"secret_payload": {"payload": "x" * 1_000_001}})
    with pytest.raises(AppProblem) as error:
        routes._survey_preview(invalid)
    assert "200 KB" in error.value.detail


async def test_preview_authorizes_before_opening_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def deny(*args: Any) -> dict[str, Any]:
        raise AppProblem(status=404, code="not_found", title="Absent", detail="Absent")

    monkeypatch.setattr(routes, "_campaign_row", deny)
    monkeypatch.setattr(routes, "_survey_preview", lambda body: pytest.fail("opened raw payload"))
    with pytest.raises(AppProblem) as error:
        await routes.preview_survey(UUID(int=3), body(), cast(Request, object()), identity())
    assert error.value.status == 404


async def test_queue_freezes_exact_preview_binding(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def campaign(*args: Any) -> dict[str, Any]:
        return {"id": UUID(int=3)}

    async def store(*args: Any, **kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"run_id": UUID(int=4), "replayed": False}

    monkeypatch.setattr(routes, "_campaign_row", campaign)
    monkeypatch.setattr(routes, "_store_run", store)
    monkeypatch.setattr(routes, "_is_production", lambda: False)
    monkeypatch.setattr(routes, "_correlation_id", lambda request: UUID(int=5))
    source = body()
    await routes.import_survey(
        UUID(int=3),
        source,
        cast(Request, object()),
        Response(),
        identity(),
        "preview-import-key-0001",
    )
    assert (
        captured["payload"]["evidence_binding"]
        == routes._survey_preview(source)["evidence_binding"]
    )
    assert "secret_payload" not in captured["payload"]
    assert "payload" not in captured["payload"]


@pytest.mark.parametrize("adapter", ["csv", "generic_json", "formbricks", "odk"])
def test_preview_supports_each_advertised_adapter(adapter: str) -> None:
    source = body()
    assert source.secret_payload is not None
    row = source.secret_payload["payload"][0]
    if adapter == "csv":
        payload: Any = ",".join(row) + "\n" + ",".join(str(value) for value in row.values())
    elif adapter == "generic_json":
        payload = [row]
    else:
        payload = {"responses": [{"id": "opaque-fixture", "data": row}]}
    source = source.model_copy(update={"format": adapter, "secret_payload": {"payload": payload}})
    preview = routes._survey_preview(source)
    assert preview["summary"]["accepted_response_count"] == 1
    assert preview["summary"]["format"] == adapter
