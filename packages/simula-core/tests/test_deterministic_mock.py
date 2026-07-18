from __future__ import annotations

import os
import subprocess
import sys
from datetime import UTC, datetime
from hashlib import sha256
from uuid import UUID

import pytest
from simula_core.json_codec import canonical_json_dumps
from simula_core.simulation import (
    SIGNED_INT64_MAX,
    SIGNED_INT64_MIN,
    DeterministicMockProvider,
    FixtureResultOutput,
    ProviderRequest,
    ResultProvenance,
    SimulationResultV1,
    UnavailableResultOutput,
)

_DETERMINISM_PROBE = """
import sys

from simula_core.json_codec import canonical_json_dumps
from simula_core.simulation import DeterministicMockProvider, ProviderRequest

request = ProviderRequest.model_validate_json(sys.stdin.buffer.read())
provider = DeterministicMockProvider()
for _ in range(20):
    result = provider.run(request)
    sys.stdout.buffer.write(canonical_json_dumps(result.model_dump(mode="json")) + b"\\n")
"""
EXPECTED_PHASE2_RESULT_SHA256 = "14c1be5ba973cd24e819468176ed5f9b605b2110ff25fb8f2c29e9eba7c51dc0"


def _request(*, seed: int = 7) -> ProviderRequest:
    return ProviderRequest(
        attempt_id=UUID("00000000-0000-4000-8000-000000000202"),
        deadline_at=datetime(2026, 7, 18, tzinfo=UTC),
        deterministic_seed=seed,
        code_release_sha="a" * 40,
        configuration_sha256="b" * 64,
        frozen_manifest_sha256="a" * 64,
        language="en",
        method_version="phase2_demo_v1",
        output_schema_version=1,
        request_id=UUID("00000000-0000-4000-8000-000000000203"),
        run_id=UUID("00000000-0000-4000-8000-000000000201"),
        stimulus_content="A fictional campaign message for the product path.",
    )


def _run_determinism_probe(index: int, request_json: bytes) -> tuple[bytes, ...]:
    completed = subprocess.run(  # noqa: S603 -- exact current interpreter, constant probe
        [sys.executable, "-c", _DETERMINISM_PROBE],
        input=request_json,
        capture_output=True,
        check=False,
        timeout=30,
        env={**os.environ, "PYTHONHASHSEED": str(index + 1)},
    )
    if completed.returncode != 0:
        raise AssertionError(completed.stderr.decode("utf-8", errors="replace"))
    return tuple(completed.stdout.splitlines())


def test_mock_result_is_byte_identical_for_the_same_frozen_request() -> None:
    provider = DeterministicMockProvider()

    first = provider.run(_request())
    second = provider.run(_request())

    assert canonical_json_dumps(first.model_dump(mode="json")) == canonical_json_dumps(
        second.model_dump(mode="json")
    )
    assert first.validation_label == "experimental"
    assert isinstance(first.outputs[0], FixtureResultOutput)
    assert first.outputs[0].kind == "demo_fixture_distribution"
    assert first.outputs[0].uncertainty.status == "not_applicable"
    assert first.qualitative[0].synthetic is True
    assert first.recommendations[0].kind == "recommendation"
    assert first.provenance.deterministic_seed == "7"
    assert "Estimates nobody" in first.limitations[0]


def test_mock_result_is_byte_identical_across_100_cross_process_repeats() -> None:
    request = _request()
    request_json = request.model_dump_json().encode("utf-8")
    batches = (_run_determinism_probe(index, request_json) for index in range(5))
    outputs = tuple(output for batch in batches for output in batch)

    assert len(outputs) == 100
    assert len(set(outputs)) == 1
    assert {sha256(output).hexdigest() for output in outputs} == {EXPECTED_PHASE2_RESULT_SHA256}


def test_mock_result_changes_only_with_explicit_frozen_input_and_is_a_distribution() -> None:
    provider = DeterministicMockProvider()

    first = provider.run(_request(seed=7))
    changed = provider.run(_request(seed=8))

    assert isinstance(first.outputs[0], FixtureResultOutput)
    assert isinstance(changed.outputs[0], FixtureResultOutput)
    values = [category.value for category in first.outputs[0].value.categories]
    assert sum(values) == 1.0
    assert all(0.0 <= value <= 1.0 for value in values)
    assert canonical_json_dumps(first.model_dump(mode="json")) != canonical_json_dumps(
        changed.model_dump(mode="json")
    )


@pytest.mark.parametrize("seed", (SIGNED_INT64_MIN, SIGNED_INT64_MAX))
def test_mock_result_preserves_exact_signed_int64_seed_as_canonical_text(seed: int) -> None:
    result = DeterministicMockProvider().run(_request(seed=seed))

    assert result.provenance.deterministic_seed == str(seed)


@pytest.mark.parametrize("seed", ("-0", "00", "9223372036854775808", "-9223372036854775809"))
def test_result_provenance_rejects_noncanonical_or_out_of_range_seeds(seed: str) -> None:
    with pytest.raises(ValueError, match=r"deterministic seed|String should match pattern"):
        ResultProvenance(
            method_version="phase2_demo_v1",
            provider_id="deterministic_mock",
            provider_version=1,
            code_release_sha="a" * 40,
            configuration_sha256="b" * 64,
            frozen_manifest_sha256="a" * 64,
            deterministic_seed=seed,
            output_schema_version=1,
        )


def test_result_contract_is_closed_and_has_no_real_provider_or_cost_fields() -> None:
    schema = SimulationResultV1.model_json_schema()

    assert schema["additionalProperties"] is False
    assert "real_provider" not in str(schema)
    assert "cost" not in str(schema)


def test_unavailable_output_is_explicit_and_rejects_a_substitute_value() -> None:
    unavailable = UnavailableResultOutput(
        output_id="reaction_fixture",
        kind="unavailable",
        label="Pipeline demo values",
        availability="suppressed",
        reason="This output is unavailable. SIMULA will not substitute a value.",
        limitations=("Estimates nobody and is not representative of any population.",),
    )

    assert unavailable.model_dump(mode="json")["availability"] == "suppressed"
    with pytest.raises(ValueError, match="Extra inputs are not permitted"):
        UnavailableResultOutput.model_validate(
            {
                "output_id": "reaction_fixture",
                "kind": "unavailable",
                "label": "Pipeline demo values",
                "availability": "suppressed",
                "reason": "This output is unavailable. SIMULA will not substitute a value.",
                "limitations": ("Estimates nobody and is not representative of any population.",),
                "value": 0,
            }
        )
