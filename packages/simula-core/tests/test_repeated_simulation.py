from __future__ import annotations

from uuid import UUID

import pytest
from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import DeterministicCohortProvider, MethodologyEngine
from simula_core.repeated_simulation import (
    RepeatedMethodologyResult,
    RepeatedSimulationConfiguration,
    run_repeated_methodology,
    summarize_variant_ranking,
)
from test_methodology import _audience, _configuration, _population

GROUP_ID = UUID("30000000-0000-4000-8000-000000000099")


def _run(*, tolerance: float = 5.0, repetitions: int = 5) -> RepeatedMethodologyResult:
    return run_repeated_methodology(
        MethodologyEngine(DeterministicCohortProvider()),
        run_group_id=GROUP_ID,
        stimulus="A fictional proposition for repeated methodology testing.",
        population=_population(),
        audience=_audience(geography=("metro", "regional")),
        configuration=_configuration(),
        methodology_version="phase3_method_v1",
        cost_ceiling_microusd=0,
        repetition_configuration=RepeatedSimulationConfiguration(
            repetition_count=repetitions,
            base_seed=17,
            stability_tolerance=tolerance,
        ),
    )


def test_repeated_methodology_preserves_population_weights_and_summarizes_components() -> None:
    result = _run()

    assert len(result.runs) == 5
    assert len({run.reproducibility.seed for run in result.runs}) == 5
    assert [cell.key for cell in result.runs[0].sample.cells] == [
        "metro_early",
        "metro_late",
        "regional_early",
        "regional_late",
    ]
    assert [cell.population_weight for cell in result.runs[0].sample.cells] == pytest.approx(
        [0.4, 0.3, 0.2, 0.1]
    )
    assert [metric.key for metric in result.metric_summaries] == [
        "clarity",
        "relevance",
        "trust",
        "persuasiveness",
        "consideration",
    ]
    assert result.positive_share.mean == pytest.approx(
        sum(run.report.distribution.categories[0].value for run in result.runs) / 5
    )
    assert result.repetition_count == 5
    assert result.reproducibility_checksum_sha256 != "0" * 64
    assert "viral_score" not in result.model_dump(mode="json")


def test_repeated_methodology_is_byte_reproducible_for_same_group_and_seed() -> None:
    first = _run()
    second = _run()

    assert canonical_json_dumps(first.model_dump(mode="json")) == canonical_json_dumps(
        second.model_dump(mode="json")
    )


def test_repeated_methodology_warns_when_repeat_dispersion_is_unstable() -> None:
    result = _run(tolerance=0.0001)

    assert result.stability_label == "unstable"
    assert result.max_interval_half_width > 0.0001
    assert any("repeat interval" in limitation.lower() for limitation in result.limitations)


def test_repeated_methodology_requires_at_least_one_repetition() -> None:
    with pytest.raises(ValueError):
        RepeatedSimulationConfiguration(
            repetition_count=0,
            base_seed=17,
            stability_tolerance=5,
        )


def test_repeated_variant_ranking_reports_top_rank_probability_and_instability() -> None:
    stable = summarize_variant_ranking(
        metric_key="clarity",
        values_by_variant={
            "variant_a": (80, 81, 79, 82, 80),
            "variant_b": (60, 61, 62, 59, 60),
        },
        top_rank_threshold=0.8,
    )
    unstable = summarize_variant_ranking(
        metric_key="clarity",
        values_by_variant={
            "variant_a": (80, 60, 80, 60, 80),
            "variant_b": (60, 80, 60, 80, 60),
        },
        top_rank_threshold=0.8,
    )

    assert stable.stability_label == "stable"
    assert stable.top_variant_key == "variant_a"
    assert stable.variants[0].top_rank_probability == pytest.approx(1.0)
    assert stable.pairwise_rank_agreement == pytest.approx(1.0)
    assert unstable.stability_label == "unstable"
    assert unstable.top_variant_key is None
    assert "viral_score" not in stable.model_dump(mode="json")
