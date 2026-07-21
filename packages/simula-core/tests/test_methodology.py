from __future__ import annotations

from typing import cast
from uuid import UUID

import pytest
from pydantic import ValidationError
from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import (
    AggregateReport,
    AudienceCriterion,
    AudienceDefinitionVersion,
    DeterministicCohortProvider,
    EvaluationCase,
    EvaluationHarness,
    ExternalProviderPricing,
    ExternalStructuredProviderAdapter,
    MethodologyEngine,
    MethodologyProviderRequest,
    PopulationFrameVersion,
    ReactionDistribution,
    ReactionShare,
    SamplingConfiguration,
    aggregate_cohort_responses,
    sample_population,
)

POPULATION_ID = UUID("10000000-0000-4000-8000-000000000001")
FRAME_ID = UUID("10000000-0000-4000-8000-000000000002")
AUDIENCE_ID = UUID("20000000-0000-4000-8000-000000000001")
AUDIENCE_VERSION_ID = UUID("20000000-0000-4000-8000-000000000002")
RUN_ID = UUID("30000000-0000-4000-8000-000000000001")


def _population_payload() -> dict[str, object]:
    return {
        "id": str(POPULATION_ID),
        "frame_id": str(FRAME_ID),
        "version": 1,
        "name": "Authored methodology test frame",
        "geography": "Fictional test geography",
        "target_population": "Synthetic cells used only for engineering validation.",
        "inclusion": ["Cells in the authored fixture."],
        "exclusion": ["Every real person and real population."],
        "provenance": [
            {
                "source_id": "authored_fixture",
                "source_version": "1",
                "owner": "SIMULA test suite",
                "license": "Repository test fixture",
                "allowed_uses": ["Local automated engineering tests."],
                "collection_period": "Not collected; authored fixture.",
                "sampling_frame": "No human sampling frame.",
                "known_biases": ["Authored and non-representative."],
                "coverage_limitations": ["Covers no real population."],
                "validation_status": "experimental",
            }
        ],
        "cells": [
            {
                "key": "metro_early",
                "weight": 0.4,
                "dimensions": [
                    {"dimension": "geography", "value": "metro"},
                    {"dimension": "life_stage", "value": "early"},
                ],
            },
            {
                "key": "metro_late",
                "weight": 0.3,
                "dimensions": [
                    {"dimension": "geography", "value": "metro"},
                    {"dimension": "life_stage", "value": "late"},
                ],
            },
            {
                "key": "regional_early",
                "weight": 0.2,
                "dimensions": [
                    {"dimension": "geography", "value": "regional"},
                    {"dimension": "life_stage", "value": "early"},
                ],
            },
            {
                "key": "regional_late",
                "weight": 0.1,
                "dimensions": [
                    {"dimension": "geography", "value": "regional"},
                    {"dimension": "life_stage", "value": "late"},
                ],
            },
        ],
        "validation_status": "experimental",
        "limitations": ["Authored cells estimate nobody."],
    }


def _population() -> PopulationFrameVersion:
    payload = _population_payload()
    return PopulationFrameVersion.model_validate(payload)


def _audience(*, geography: tuple[str, ...] = ("metro",)) -> AudienceDefinitionVersion:
    return AudienceDefinitionVersion(
        id=AUDIENCE_VERSION_ID,
        audience_id=AUDIENCE_ID,
        version=1,
        name="Metro authored cohort",
        criteria=(AudienceCriterion(dimension="geography", allowed_values=geography),),
        provenance_status="demo",
        limitations=("Synthetic filter over authored fixture cells.",),
    )


def _configuration(**changes: int) -> SamplingConfiguration:
    return SamplingConfiguration.model_validate(
        {
            "sample_size": 100,
            "minimum_per_cell": 5,
            "maximum_cells": 10,
            "seed": 17,
            "sparse_cell_threshold": 5,
            **changes,
        }
    )


def _distribution(
    positive: float, neutral: float, negative: float, mixed: float
) -> ReactionDistribution:
    return ReactionDistribution(
        categories=(
            ReactionShare(key="positive", value=positive),
            ReactionShare(key="neutral", value=neutral),
            ReactionShare(key="negative", value=negative),
            ReactionShare(key="mixed", value=mixed),
        )
    )


def test_population_frame_is_versioned_canonical_and_tamper_evident() -> None:
    population = _population()

    assert population.version == 1
    assert len(population.cells) == 4
    assert len(population.checksum_sha256) == 64

    payload = _population_payload()
    payload["name"] = "Tampered frame"
    with pytest.raises(ValidationError, match="checksum mismatch"):
        PopulationFrameVersion.model_validate(
            {**payload, "checksum_sha256": population.checksum_sha256}
        )


def test_population_frame_rejects_noncanonical_cells_and_invalid_weight_sum() -> None:
    payload = _population_payload()
    cells = cast(list[dict[str, object]], payload["cells"]).copy()
    cells[0], cells[1] = cells[1], cells[0]
    payload["cells"] = cells
    checksum = PopulationFrameVersion.compute_checksum(payload)

    with pytest.raises(ValidationError, match="canonical order"):
        PopulationFrameVersion.model_validate({**payload, "checksum_sha256": checksum})


def test_audience_sampling_filters_and_allocates_exactly() -> None:
    sample = sample_population(_population(), _audience(), _configuration())

    assert [cell.key for cell in sample.cells] == ["metro_early", "metro_late"]
    assert sum(cell.sample_count for cell in sample.cells) == 100
    assert sample.cells[0].sample_count > sample.cells[1].sample_count
    assert sample.excluded_population_weight == pytest.approx(0.3)
    assert sample.audience_version_id == AUDIENCE_VERSION_ID


def test_sampling_is_byte_reproducible_and_fails_closed_on_empty_audience() -> None:
    first = sample_population(_population(), _audience(), _configuration())
    second = sample_population(_population(), _audience(), _configuration())

    assert canonical_json_dumps(first.model_dump(mode="json")) == canonical_json_dumps(
        second.model_dump(mode="json")
    )
    with pytest.raises(ValueError, match="admits no population cells"):
        sample_population(
            _population(),
            _audience(geography=("unavailable",)),
            _configuration(),
        )


def test_sampling_rejects_minimum_that_cannot_fit_target_size() -> None:
    with pytest.raises(ValueError, match="minimum per eligible cell"):
        sample_population(
            _population(),
            _audience(geography=("metro", "regional")),
            _configuration(sample_size=10, minimum_per_cell=3),
        )


def test_methodology_engine_returns_structured_aggregate_uncertainty_and_receipt() -> None:
    result = MethodologyEngine(DeterministicCohortProvider()).run(
        run_id=RUN_ID,
        stimulus="A fictional proposition for deterministic methodology testing.",
        population=_population(),
        audience=_audience(),
        configuration=_configuration(),
        methodology_version="phase3_method_v1",
        cost_ceiling_microusd=0,
    )

    assert result.schema_version == 2
    assert result.validation_label == "experimental"
    assert len(result.cohort_responses) == 2
    assert result.usage.cost_microusd == 0
    assert sum(item.value for item in result.report.distribution.categories) == pytest.approx(1)
    assert [metric.key for metric in result.report.metrics] == [
        "clarity",
        "relevance",
        "trust",
        "persuasiveness",
        "consideration",
    ]
    assert {component.name for component in result.report.uncertainty} == {
        "frame_coverage",
        "sampling",
        "measurement",
        "model",
        "held_out_adjustment",
        "run_stability",
        "missingness",
        "dataset_shift",
    }
    assert all(
        component.status != "diagnostic" or component.value is not None
        for component in result.report.uncertainty
    )
    assert len(result.reproducibility.input_sha256) == 64
    assert len(result.reproducibility.output_sha256) == 64


def test_methodology_engine_is_byte_reproducible() -> None:
    engine = MethodologyEngine(DeterministicCohortProvider())
    arguments = {
        "run_id": RUN_ID,
        "stimulus": "A fictional proposition for deterministic methodology testing.",
        "population": _population(),
        "audience": _audience(),
        "configuration": _configuration(),
        "methodology_version": "phase3_method_v1",
        "cost_ceiling_microusd": 0,
    }

    first = engine.run(**arguments)  # type: ignore[arg-type]
    second = engine.run(**arguments)  # type: ignore[arg-type]

    assert canonical_json_dumps(first.model_dump(mode="json")) == canonical_json_dumps(
        second.model_dump(mode="json")
    )


def test_aggregation_suppresses_sparse_cells_without_substituting_zero() -> None:
    sample = sample_population(
        _population(),
        _audience(),
        _configuration(sample_size=10, minimum_per_cell=1, sparse_cell_threshold=5),
    )
    response = DeterministicCohortProvider().run(
        MethodologyProviderRequest(
            run_id=RUN_ID,
            stimulus="Fictional test proposition.",
            sample=sample,
            methodology_version="phase3_method_v1",
            cost_ceiling_microusd=0,
        )
    )

    report = aggregate_cohort_responses(sample, response.responses)

    assert isinstance(report, AggregateReport)
    assert len(report.suppressed_cells) == 1
    assert set(report.included_cells).isdisjoint(report.suppressed_cells)
    missingness = next(item for item in report.uncertainty if item.name == "missingness")
    assert missingness.status == "diagnostic"
    assert missingness.value is not None and missingness.value > 0


def test_external_provider_adapter_validates_schema_identity_coverage_and_cost() -> None:
    sample = sample_population(_population(), _audience(), _configuration())
    request = MethodologyProviderRequest(
        run_id=RUN_ID,
        stimulus="Fictional test proposition.",
        sample=sample,
        methodology_version="phase3_method_v1",
        cost_ceiling_microusd=10_000,
    )
    fixture = DeterministicCohortProvider().run(request)

    def transport(payload: dict[str, object]) -> dict[str, object]:
        assert set(payload) == {
            "request_id",
            "stimulus",
            "methodology_version",
            "response_schema_version",
            "cohorts",
        }
        return {
            **fixture.model_dump(mode="json"),
            "provider_id": "approved_provider",
            "provider_version": "2026-07",
            "model_id": "approved_model",
            "template_id": "phase3_structured_v1",
            "usage": {"input_tokens": 100, "output_tokens": 200, "cost_microusd": 500},
        }

    adapter = ExternalStructuredProviderAdapter(
        provider_id="approved_provider",
        provider_version="2026-07",
        model_id="approved_model",
        template_id="phase3_structured_v1",
        pricing=ExternalProviderPricing(
            input_microusd_per_million_tokens=1_000_000,
            output_microusd_per_million_tokens=2_000_000,
            maximum_input_tokens=10_000,
            maximum_output_tokens=2_000,
        ),
        transport=transport,
    )

    result = adapter.run(request)

    assert result.usage.cost_microusd == 500
    assert {response.cell_key for response in result.responses} == {
        cell.key for cell in sample.cells
    }


def test_external_provider_adapter_rejects_preflight_and_untrusted_receipts() -> None:
    sample = sample_population(_population(), _audience(), _configuration())
    request = MethodologyProviderRequest(
        run_id=RUN_ID,
        stimulus="Fictional test proposition.",
        sample=sample,
        methodology_version="phase3_method_v1",
        cost_ceiling_microusd=0,
    )
    adapter = ExternalStructuredProviderAdapter(
        provider_id="approved_provider",
        provider_version="2026-07",
        model_id="approved_model",
        template_id="phase3_structured_v1",
        pricing=ExternalProviderPricing(
            input_microusd_per_million_tokens=1_000_000,
            output_microusd_per_million_tokens=2_000_000,
            maximum_input_tokens=10_000,
            maximum_output_tokens=2_000,
        ),
        transport=lambda _: {},
    )

    with pytest.raises(ValueError, match="estimated cost ceiling"):
        adapter.run(request)


def test_evaluation_harness_reports_overall_and_slice_metrics_without_promotion() -> None:
    cases = (
        EvaluationCase(
            case_id="case_a",
            slice_key="english",
            predicted=_distribution(0.5, 0.2, 0.2, 0.1),
            observed=_distribution(0.4, 0.3, 0.2, 0.1),
        ),
        EvaluationCase(
            case_id="case_b",
            slice_key="taglish",
            predicted=_distribution(0.2, 0.3, 0.4, 0.1),
            observed=_distribution(0.1, 0.3, 0.4, 0.2),
        ),
    )

    report = EvaluationHarness().evaluate(
        methodology_version="phase3_method_v1",
        benchmark_checksum_sha256="a" * 64,
        cases=cases,
    )

    assert report.case_count == 2
    assert report.overall.mean_absolute_error == pytest.approx(0.05)
    assert report.overall.brier_score == pytest.approx(0.02)
    assert [item.slice_key for item in report.slices] == ["english", "taglish"]
    assert report.promotion_eligible is False


def test_evaluation_harness_rejects_duplicate_or_missing_cases() -> None:
    harness = EvaluationHarness()
    with pytest.raises(ValueError, match="at least one"):
        harness.evaluate(
            methodology_version="phase3_method_v1",
            benchmark_checksum_sha256="a" * 64,
            cases=(),
        )
    case = EvaluationCase(
        case_id="duplicate",
        predicted=_distribution(0.25, 0.25, 0.25, 0.25),
        observed=_distribution(0.25, 0.25, 0.25, 0.25),
    )
    with pytest.raises(ValueError, match="unique"):
        harness.evaluate(
            methodology_version="phase3_method_v1",
            benchmark_checksum_sha256="a" * 64,
            cases=(case, case),
        )
