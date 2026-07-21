from __future__ import annotations

import csv
import io
import json
from datetime import UTC, datetime
from hashlib import sha256
from uuid import UUID

import pytest
from simula_core.methodology import (
    AudienceCriterion,
    AudienceDefinitionVersion,
    DeterministicCohortProvider,
    MethodologyEngine,
    PopulationFrameVersion,
    SamplingConfiguration,
)
from simula_core.reporting import (
    CompleteReport,
    build_complete_report,
    compare_variants,
    export_report,
)

POPULATION_VERSION_ID = UUID("40000000-0000-4000-8000-000000000001")
FRAME_ID = UUID("40000000-0000-4000-8000-000000000002")
AUDIENCE_VERSION_ID = UUID("50000000-0000-4000-8000-000000000001")
AUDIENCE_ID = UUID("50000000-0000-4000-8000-000000000002")
PROJECT_ID = UUID("60000000-0000-4000-8000-000000000001")
STIMULUS_VERSION_ID = UUID("60000000-0000-4000-8000-000000000002")
CREATED_AT = datetime(2026, 7, 20, 4, 0, tzinfo=UTC)


def _population() -> PopulationFrameVersion:
    return PopulationFrameVersion.model_validate(
        {
            "id": str(POPULATION_VERSION_ID),
            "frame_id": str(FRAME_ID),
            "version": 1,
            "name": "Reporting fixture frame",
            "geography": "Fictional geography",
            "target_population": "Authored synthetic cells for reporting tests.",
            "inclusion": ["Fixture cells."],
            "exclusion": ["All real people."],
            "provenance": [
                {
                    "source_id": "report_fixture",
                    "source_version": "1",
                    "owner": "SIMULA test suite",
                    "license": "Repository fixture",
                    "allowed_uses": ["Automated tests."],
                    "collection_period": "Not collected.",
                    "sampling_frame": "No human sample.",
                    "known_biases": ["Authored fixture."],
                    "coverage_limitations": ["No population coverage."],
                }
            ],
            "cells": [
                {
                    "key": "metro_early",
                    "weight": 0.6,
                    "dimensions": [
                        {"dimension": "geography", "value": "metro"},
                        {"dimension": "life_stage", "value": "early"},
                    ],
                },
                {
                    "key": "regional_late",
                    "weight": 0.4,
                    "dimensions": [
                        {"dimension": "geography", "value": "regional"},
                        {"dimension": "life_stage", "value": "late"},
                    ],
                },
            ],
            "validation_status": "experimental",
            "limitations": ["Authored cells estimate nobody."],
        }
    )


def _audience() -> AudienceDefinitionVersion:
    return AudienceDefinitionVersion(
        id=AUDIENCE_VERSION_ID,
        audience_id=AUDIENCE_ID,
        version=1,
        name="All fixture cells",
        criteria=(AudienceCriterion(dimension="geography", allowed_values=("metro", "regional")),),
        provenance_status="demo",
        limitations=("Authored reporting fixture.",),
    )


def _report(
    *,
    run_id: UUID,
    report_id: UUID,
    variant_key: str,
    variant_label: str,
    stimulus: str,
) -> CompleteReport:
    result = MethodologyEngine(DeterministicCohortProvider()).run(
        run_id=run_id,
        stimulus=stimulus,
        population=_population(),
        audience=_audience(),
        configuration=SamplingConfiguration(
            sample_size=100,
            minimum_per_cell=5,
            maximum_cells=10,
            seed=21,
            sparse_cell_threshold=5,
        ),
        methodology_version="phase3_method_v1",
        cost_ceiling_microusd=0,
    )
    return build_complete_report(
        result,
        report_id=report_id,
        project_id=PROJECT_ID,
        stimulus_version_id=STIMULUS_VERSION_ID,
        variant_key=variant_key,
        variant_label=variant_label,
        created_at=CREATED_AT,
    )


def test_complete_report_contains_product_sections_segments_and_transparency() -> None:
    report = _report(
        run_id=UUID("70000000-0000-4000-8000-000000000001"),
        report_id=UUID("70000000-0000-4000-8000-000000000002"),
        variant_key="variant_a",
        variant_label="Variant A",
        stimulus="Fictional proposition A.",
    )

    assert report.schema_version == "2.0.0"
    assert "No survey" in report.experimental_notice
    assert report.transparency.numerical_output_kind == "heuristic_score"
    assert report.transparency.validation_label == "experimental"
    assert report.overall.distribution.categories
    assert report.overall.emotions.categories
    assert report.overall.metrics
    assert report.overall.risks
    assert {(item.dimension, item.value) for item in report.segments} == {
        ("geography", "metro"),
        ("geography", "regional"),
        ("life_stage", "early"),
        ("life_stage", "late"),
    }
    assert all(item.status == "available" for item in report.segments)
    assert all(item.synthetic for item in report.rationales)
    assert report.recommendations
    assert any("participant quotations" in item for item in report.limitations)
    assert len(report.content_sha256) == 64


def test_complete_report_is_reproducible_for_same_frozen_result_and_timestamp() -> None:
    arguments = {
        "run_id": UUID("70000000-0000-4000-8000-000000000001"),
        "report_id": UUID("70000000-0000-4000-8000-000000000002"),
        "variant_key": "variant_a",
        "variant_label": "Variant A",
        "stimulus": "Fictional proposition A.",
    }

    first = _report(**arguments)  # type: ignore[arg-type]
    second = _report(**arguments)  # type: ignore[arg-type]

    assert first == second
    assert first.content_sha256 == second.content_sha256


def test_variant_comparison_requires_frozen_compatibility_and_reports_deltas() -> None:
    baseline = _report(
        run_id=UUID("70000000-0000-4000-8000-000000000001"),
        report_id=UUID("70000000-0000-4000-8000-000000000002"),
        variant_key="variant_a",
        variant_label="Variant A",
        stimulus="Fictional proposition A.",
    )
    candidate = _report(
        run_id=UUID("70000000-0000-4000-8000-000000000003"),
        report_id=UUID("70000000-0000-4000-8000-000000000004"),
        variant_key="variant_b",
        variant_label="Variant B",
        stimulus="A substantially different fictional proposition B.",
    )

    comparison = compare_variants(baseline, candidate)

    assert comparison.compatibility == "compatible"
    assert len(comparison.distribution_deltas) == 4
    assert len(comparison.metric_deltas) == 5
    assert len(comparison.risk_deltas) == 3
    assert any(item.delta != 0 for item in comparison.metric_deltas)
    assert "not evidence of market lift" in comparison.largest_absolute_change

    incompatible = candidate.model_copy(
        update={
            "transparency": candidate.transparency.model_copy(
                update={"audience_version_id": UUID("50000000-0000-4000-8000-000000000099")}
            )
        }
    )
    with pytest.raises(ValueError, match="incompatible frozen configurations"):
        compare_variants(baseline, incompatible)


def test_json_export_is_hash_bound_and_contains_disclosures() -> None:
    report = _report(
        run_id=UUID("70000000-0000-4000-8000-000000000001"),
        report_id=UUID("70000000-0000-4000-8000-000000000002"),
        variant_key="variant_a",
        variant_label="Variant A",
        stimulus="Fictional proposition A.",
    )

    exported = export_report(report, "json")
    parsed = json.loads(exported.content)

    assert exported.media_type == "application/json"
    assert exported.filename == "simula-variant-a.json"
    assert exported.content_sha256 == sha256(exported.content).hexdigest()
    assert parsed["transparency"]["validation_label"] == "experimental"
    assert parsed["limitations"] == list(report.limitations)
    assert parsed["content_sha256"] == report.content_sha256


def test_csv_export_neutralizes_spreadsheet_formulas_and_embeds_provenance() -> None:
    report = _report(
        run_id=UUID("70000000-0000-4000-8000-000000000001"),
        report_id=UUID("70000000-0000-4000-8000-000000000002"),
        variant_key="variant_a",
        variant_label='=HYPERLINK("https://invalid.example")',
        stimulus="Fictional proposition A.",
    )

    exported = export_report(report, "csv")
    rows = list(csv.reader(io.StringIO(exported.content.decode("utf-8"))))

    assert exported.media_type == "text/csv; charset=utf-8"
    assert exported.filename.endswith(".csv")
    assert rows[0] == ["section", "key", "value", "output_kind", "validation_label"]
    variant_row = next(row for row in rows if row[:2] == ["identity", "variant"])
    assert variant_row[2].startswith("'=")
    assert any(row[:2] == ["provenance", "methodology_version"] for row in rows)
    assert any(row[0] == "limitation" for row in rows)
    assert all(not cell.lstrip().startswith(("=", "+", "-", "@")) for row in rows for cell in row)
