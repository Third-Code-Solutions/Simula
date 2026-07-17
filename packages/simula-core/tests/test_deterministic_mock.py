from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from simula_core.json_codec import canonical_json_dumps
from simula_core.simulation import (
    DeterministicMockProvider,
    ProviderRequest,
    SimulationResultV1,
)


def _request(*, seed: int = 7) -> ProviderRequest:
    return ProviderRequest(
        attempt_id=UUID("00000000-0000-4000-8000-000000000202"),
        deadline_at=datetime(2026, 7, 18, tzinfo=UTC),
        deterministic_seed=seed,
        frozen_manifest_sha256="a" * 64,
        language="en",
        method_version="phase2_demo_v1",
        output_schema_version=1,
        request_id=UUID("00000000-0000-4000-8000-000000000203"),
        run_id=UUID("00000000-0000-4000-8000-000000000201"),
        stimulus_content="A fictional campaign message for the product path.",
    )


def test_mock_result_is_byte_identical_for_the_same_frozen_request() -> None:
    provider = DeterministicMockProvider()

    first = provider.run(_request())
    second = provider.run(_request())

    assert canonical_json_dumps(first.model_dump(mode="json")) == canonical_json_dumps(
        second.model_dump(mode="json")
    )
    assert first.validation_label == "experimental"
    assert first.outputs[0].kind == "demo_fixture_distribution"
    assert first.outputs[0].uncertainty.status == "not_applicable"
    assert first.qualitative[0].synthetic is True
    assert first.recommendations[0].kind == "recommendation"
    assert "Estimates nobody" in first.limitations[0]


def test_mock_result_changes_only_with_explicit_frozen_input_and_is_a_distribution() -> None:
    provider = DeterministicMockProvider()

    first = provider.run(_request(seed=7))
    changed = provider.run(_request(seed=8))

    values = [category.value for category in first.outputs[0].value.categories]
    assert sum(values) == 1.0
    assert all(0.0 <= value <= 1.0 for value in values)
    assert first.outputs[0].value != changed.outputs[0].value


def test_result_contract_is_closed_and_has_no_real_provider_or_cost_fields() -> None:
    schema = SimulationResultV1.model_json_schema()

    assert schema["additionalProperties"] is False
    assert "real_provider" not in str(schema)
    assert "cost" not in str(schema)
