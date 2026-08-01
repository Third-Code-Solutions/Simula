from __future__ import annotations

import base64
import copy
import hashlib
import json
from datetime import UTC, datetime
from io import BytesIO
from uuid import NAMESPACE_URL, UUID, uuid5

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image
from simula_ai_engine.app import EngineServices, create_app
from simula_ai_engine.config import EngineSettings
from simula_ai_engine.registry import (
    BehavioralProviderRegistry,
    VisualProviderRegistry,
)
from simula_core.behavioral_demo import authored_demo_behavioral_command
from simula_core.behavioral_engine import BehavioralRunCommand, DeterministicTieredProvider

TOKEN = "t" * 32
ORGANIZATION_ID = UUID("00000000-0000-4000-8000-000000000001")


def _command() -> BehavioralRunCommand:
    return authored_demo_behavioral_command(
        organization_id=ORGANIZATION_ID,
        run_id=UUID("00000000-0000-4000-8000-000000000007"),
        study_id=UUID("00000000-0000-4000-8000-000000000008"),
        variant_key="baseline",
        stimulus="A fictional campaign message.",
    )


def _services() -> EngineServices:
    return EngineServices(
        settings=EngineSettings(
            environment="test",
            release_sha="a" * 40,
            internal_tokens=(TOKEN,),
            port=8010,
        ),
        registry=BehavioralProviderRegistry.experimental_deterministic_only(),
        visual_registry=VisualProviderRegistry.experimental_technical_only(),
    )


def _png() -> bytes:
    output = BytesIO()
    Image.new("RGB", (4, 2), (255, 0, 0)).save(output, format="PNG")
    return output.getvalue()


async def test_private_engine_health_auth_media_schema_and_execution() -> None:
    app = create_app(services=_services())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/health/live")).json()["status"] == "ok"
        assert (await client.get("/health/ready")).json()["status"] == "ready"

        missing = await client.post(
            "/internal/v1/behavioral-runs:execute",
            json=_command().model_dump(mode="json"),
        )
        wrong = await client.post(
            "/internal/v1/behavioral-runs:execute",
            json=_command().model_dump(mode="json"),
            headers={"Authorization": f"Bearer {'x' * 32}"},
        )
        unsupported = await client.post(
            "/internal/v1/behavioral-runs:execute",
            content=b"{}",
            headers={
                "Authorization": f"Bearer {TOKEN}",
                "Content-Type": "text/plain",
            },
        )
        invalid_payload = _command().model_dump(mode="json")
        invalid_payload["unknown"] = True
        invalid = await client.post(
            "/internal/v1/behavioral-runs:execute",
            json=invalid_payload,
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        completed = await client.post(
            "/internal/v1/behavioral-runs:execute",
            json=_command().model_dump(mode="json"),
            headers={"Authorization": f"Bearer {TOKEN}"},
        )

    assert missing.status_code == 401
    assert missing.headers["www-authenticate"] == "Bearer"
    assert wrong.status_code == 401
    assert unsupported.status_code == 415
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "invalid_behavioral_command"
    assert completed.status_code == 200
    body = completed.json()
    assert body["schema_version"] == 1
    assert body["receipt"]["provider_calls"] == 10
    assert body["report"]["validation_label"] == "experimental"


async def test_private_engine_rejects_unadmitted_provider_and_oversized_command() -> None:
    command = _command().model_copy(
        update={
            "provider": DeterministicTieredProvider.descriptor.model_copy(
                update={"provider_version": "2"}
            )
        }
    )
    app = create_app(services=_services())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        unadmitted = await client.post(
            "/internal/v1/behavioral-runs:execute",
            json=command.model_dump(mode="json"),
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        oversized = await client.post(
            "/internal/v1/behavioral-runs:execute",
            content=b"{}",
            headers={
                "Authorization": f"Bearer {TOKEN}",
                "Content-Type": "application/json",
                "Content-Length": "2000001",
            },
        )

    assert unadmitted.status_code == 422
    assert unadmitted.json()["code"] == "provider_not_admitted"
    assert oversized.status_code == 413
    assert oversized.json()["code"] == "request_too_large"


async def test_private_engine_profiles_only_bound_admitted_image_bytes() -> None:
    content = _png()
    digest = hashlib.sha256(content).hexdigest()
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "image/png",
        "X-Simula-Analysis-ID": "00000000-0000-4000-8000-000000000011",
        "X-Simula-Asset-ID": "00000000-0000-4000-8000-000000000012",
        "X-Simula-Organization-ID": str(ORGANIZATION_ID),
        "X-Simula-Stimulus-ID": "00000000-0000-4000-8000-000000000013",
        "X-Simula-Content-SHA256": digest,
    }
    app = create_app(services=_services())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        completed = await client.post(
            "/internal/v1/visual-assets:profile",
            content=content,
            headers=headers,
        )
        mismatched = await client.post(
            "/internal/v1/visual-assets:profile",
            content=content,
            headers={**headers, "X-Simula-Content-SHA256": "f" * 64},
        )
        unsupported = await client.post(
            "/internal/v1/visual-assets:profile",
            content=content,
            headers={**headers, "Content-Type": "application/pdf"},
        )

    assert completed.status_code == 200, completed.text
    body = completed.json()
    assert body["analysis_scope"] == "technical_image_signals_only"
    assert body["asset"]["content_sha256"] == digest
    assert body["dimensions"]["orientation"] == "landscape"
    assert body["behavioral_interpretation"] is False
    assert body["population_inference"] is False
    assert len(body["signals"]) == 9
    assert mismatched.status_code == 422
    assert mismatched.json()["code"] == "visual_asset_binding_mismatch"
    assert unsupported.status_code == 415


async def test_private_engine_visual_profile_is_fail_closed_when_not_admitted() -> None:
    content = _png()
    services = _services()
    app = create_app(
        services=EngineServices(
            settings=services.settings,
            registry=services.registry,
            visual_registry=None,
        )
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/internal/v1/visual-assets:profile",
            content=content,
            headers={
                "Authorization": f"Bearer {TOKEN}",
                "Content-Type": "image/png",
                "X-Simula-Analysis-ID": "00000000-0000-4000-8000-000000000011",
                "X-Simula-Asset-ID": "00000000-0000-4000-8000-000000000012",
                "X-Simula-Organization-ID": str(ORGANIZATION_ID),
                "X-Simula-Stimulus-ID": "00000000-0000-4000-8000-000000000013",
                "X-Simula-Content-SHA256": hashlib.sha256(content).hexdigest(),
            },
        )

    assert response.status_code == 503
    assert response.json()["code"] == "visual_profile_disabled"


async def test_private_engine_executes_bound_experimental_methodology_preview() -> None:
    behavioral = _command()
    report_id = uuid5(NAMESPACE_URL, f"simula-report:{behavioral.run_id}")
    payload = {
        "run_id": str(behavioral.run_id),
        "stimulus": behavioral.stimulus,
        "population": behavioral.population.model_dump(mode="json"),
        "audience": behavioral.audience.model_dump(mode="json"),
        "configuration": behavioral.sampling_configuration.model_dump(mode="json"),
        "methodology_version": "phase3_cohort_v1",
        "cost_ceiling_microusd": 0,
        "repetition_configuration": {
            "repetition_count": 3,
            "base_seed": 20260801,
            "stability_tolerance": 5,
        },
        "report": {
            "report_id": str(report_id),
            "project_id": str(behavioral.study_id),
            "stimulus_version_id": str(behavioral.study_id),
            "variant_key": "baseline",
            "variant_label": "Baseline",
            "created_at": datetime(2026, 7, 29, tzinfo=UTC).isoformat(),
        },
    }
    app = create_app(services=_services())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/internal/v1/methodology-previews:execute",
            json=payload,
            headers={"Authorization": f"Bearer {TOKEN}"},
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["methodology_result"]["schema_version"] == 2
    assert body["methodology_result"]["validation_label"] == "experimental"
    assert body["report"]["schema_version"] == "2.0.0"
    assert body["report"]["identity"]["report_id"] == str(report_id)
    assert body["report"]["transparency"]["numerical_output_kind"] == "heuristic_score"
    assert body["repeated_methodology_result"]["repetition_count"] == 3
    assert body["report"]["repeated_simulation"]["evidence_status"] == "Synthetic-only"
    assert body["report"]["repeated_simulation"]["stability_label"] in {
        "stable",
        "unstable",
        "insufficient_repetitions",
    }
    assert body["replayed"] is False


async def test_private_engine_compares_compatible_reports_and_renders_bound_export() -> None:
    behavioral = _command()
    report_id = uuid5(NAMESPACE_URL, f"simula-report:{behavioral.run_id}")
    preview_payload = {
        "run_id": str(behavioral.run_id),
        "stimulus": behavioral.stimulus,
        "population": behavioral.population.model_dump(mode="json"),
        "audience": behavioral.audience.model_dump(mode="json"),
        "configuration": behavioral.sampling_configuration.model_dump(mode="json"),
        "methodology_version": "phase3_cohort_v1",
        "cost_ceiling_microusd": 0,
        "report": {
            "report_id": str(report_id),
            "project_id": str(behavioral.study_id),
            "stimulus_version_id": str(behavioral.study_id),
            "variant_key": "baseline",
            "variant_label": "Baseline",
            "created_at": datetime(2026, 7, 29, tzinfo=UTC).isoformat(),
        },
    }
    app = create_app(services=_services())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        preview = await client.post(
            "/internal/v1/methodology-previews:execute",
            json=preview_payload,
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        report = preview.json()["report"]
        candidate = copy.deepcopy(report)
        candidate_id = uuid5(NAMESPACE_URL, "simula-report:candidate")
        candidate["identity"]["report_id"] = str(candidate_id)
        candidate["identity"]["variant_key"] = "candidate"
        candidate["identity"]["variant_label"] = "Candidate"

        comparison = await client.post(
            "/internal/v1/methodology-reports:compare",
            json={
                "reports": [
                    {"variant_key": "baseline", "artifact": report},
                    {"variant_key": "candidate", "artifact": candidate},
                ]
            },
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        exported = await client.post(
            "/internal/v1/report-exports:render",
            json={"report": report, "format": "json"},
            headers={"Authorization": f"Bearer {TOKEN}"},
        )

    assert preview.status_code == 200, preview.text
    assert comparison.status_code == 200, comparison.text
    comparison_body = comparison.json()
    assert comparison_body["items"][0]["baseline_variant_key"] == "baseline"
    assert comparison_body["items"][0]["candidate_variant_key"] == "candidate"
    assert comparison_body["items"][0]["comparison"]["compatibility"] == "compatible"
    assert (
        "not evidence of market lift"
        in comparison_body["items"][0]["comparison"]["largest_absolute_change"]
    )

    assert exported.status_code == 200, exported.text
    export_body = exported.json()
    content = base64.b64decode(export_body["content_base64"], validate=True)
    assert export_body["format"] == "json"
    assert export_body["media_type"] == "application/json"
    assert export_body["content_sha256"] == hashlib.sha256(content).hexdigest()
    assert json.loads(content)["identity"]["report_id"] == str(report_id)


async def test_private_engine_rejects_incompatible_variant_reports() -> None:
    behavioral = _command()
    report_id = uuid5(NAMESPACE_URL, f"simula-report:{behavioral.run_id}")
    payload = {
        "run_id": str(behavioral.run_id),
        "stimulus": behavioral.stimulus,
        "population": behavioral.population.model_dump(mode="json"),
        "audience": behavioral.audience.model_dump(mode="json"),
        "configuration": behavioral.sampling_configuration.model_dump(mode="json"),
        "methodology_version": "phase3_cohort_v1",
        "cost_ceiling_microusd": 0,
        "report": {
            "report_id": str(report_id),
            "project_id": str(behavioral.study_id),
            "stimulus_version_id": str(behavioral.study_id),
            "variant_key": "baseline",
            "variant_label": "Baseline",
            "created_at": datetime(2026, 7, 29, tzinfo=UTC).isoformat(),
        },
    }
    app = create_app(services=_services())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        preview = await client.post(
            "/internal/v1/methodology-previews:execute",
            json=payload,
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        baseline = preview.json()["report"]
        candidate = copy.deepcopy(baseline)
        candidate["identity"]["report_id"] = str(uuid5(NAMESPACE_URL, "simula-report:incompatible"))
        candidate["transparency"]["sampling_checksum_sha256"] = "f" * 64
        response = await client.post(
            "/internal/v1/methodology-reports:compare",
            json={
                "reports": [
                    {"variant_key": "baseline", "artifact": baseline},
                    {"variant_key": "candidate", "artifact": candidate},
                ]
            },
            headers={"Authorization": f"Bearer {TOKEN}"},
        )

    assert response.status_code == 409
    assert response.json()["code"] == "variant_configurations_differ"


async def test_private_engine_is_not_ready_when_runtime_configuration_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SIMULA_AI_ENGINE_INTERNAL_TOKENS", raising=False)
    app = create_app()

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"
