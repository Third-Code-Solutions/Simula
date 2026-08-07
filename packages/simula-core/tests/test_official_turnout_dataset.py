from __future__ import annotations

import json
from datetime import date
from hashlib import sha256
from pathlib import Path
from typing import Any, cast

import pytest
from simula_core.aggregate_forecasting import (
    AggregateElectionObservation,
    AggregateElectionSource,
    AggregateForecastRequest,
    AggregateForecastTarget,
    forecast_aggregate_election,
)

DATASET_PATH = (
    Path(__file__).parents[3] / "docs" / "data" / "comelec-national-turnout-1992-2025.json"
)


def _dataset() -> dict[str, Any]:
    return cast(dict[str, Any], json.loads(DATASET_PATH.read_text(encoding="utf-8")))


def test_official_turnout_manifest_is_source_and_normalization_locked() -> None:
    dataset = _dataset()

    source_payload = "\n".join(
        f"{item['artifact_key']}|{item['sha256']}|{item['bytes']}"
        for item in sorted(dataset["artifacts"], key=lambda item: item["artifact_key"])
    )
    assert sha256(source_payload.encode()).hexdigest() == dataset["source_bundle_sha256"]

    normalized_rows = []
    for row in dataset["observations"]:
        for option_key, votes in (
            ("did_not_vote", row["registered_voters"] - row["voters_who_actually_voted"]),
            ("voted", row["voters_who_actually_voted"]),
        ):
            normalized_rows.append(
                "|".join(
                    (
                        f"nle_{row['election_year']}",
                        row["election_date"],
                        "voter_turnout",
                        "philippines",
                        option_key,
                        option_key,
                        str(votes),
                        str(row["registered_voters"]),
                    )
                )
            )
    normalized_rows.sort(
        key=lambda item: (
            item.split("|")[1],
            item.split("|")[0],
            item.split("|")[2],
            item.split("|")[3],
            item.split("|")[4],
        )
    )
    normalized_payload = "\n".join(normalized_rows)
    assert sha256(normalized_payload.encode()).hexdigest() == dataset["normalized_sha256"]
    assert len(dataset["observations"]) == 12


def test_official_turnout_dataset_clears_fixed_walk_forward_gates() -> None:
    dataset = _dataset()
    source = dataset["source"]
    observations = tuple(
        AggregateElectionObservation(
            election_key=f"nle_{row['election_year']}",
            election_date=date.fromisoformat(row["election_date"]),
            contest_key="voter_turnout",
            geography_key="philippines",
            option_key=option_key,
            option_group_key=option_key,
            votes=votes,
            valid_votes=row["registered_voters"],
        )
        for row in dataset["observations"]
        for option_key, votes in (
            ("did_not_vote", row["registered_voters"] - row["voters_who_actually_voted"]),
            ("voted", row["voters_who_actually_voted"]),
        )
    )
    targets = tuple(
        AggregateForecastTarget(
            election_key="nle_2028",
            election_date=date(2028, 5, 8),
            contest_key="voter_turnout",
            geography_key="philippines",
            option_key=option_key,
            option_group_key=option_key,
        )
        for option_key in ("did_not_vote", "voted")
    )
    result = forecast_aggregate_election(
        AggregateForecastRequest(
            model_version="aggregate_trend_v1",
            source=AggregateElectionSource(
                source_id=source["source_id"],
                source_version=source["source_version"],
                owner=source["owner"],
                license=source["license"],
                allowed_uses=tuple(source["allowed_uses"]),
                geography=source["geography"],
                observation_period=source["observation_period"],
                checksum_sha256=dataset["source_bundle_sha256"],
                authorized_for_forecasting=True,
            ),
            observations=observations,
            admitted_targets=targets,
            targets=targets,
        )
    )

    assert result.respondent_data_used is False
    assert result.evidence_status == "experimental"
    assert result.backtest.validation_design == "retrospective_walk_forward"
    assert result.backtest.sealed_out_of_time_holdout is False
    assert result.backtest.holdout_election_count == 9
    assert result.backtest.mae == pytest.approx(4.299509180109767)
    assert result.backtest.improvement_vs_last_result_baseline == pytest.approx(0.0)
    assert result.backtest.interval_coverage == pytest.approx(8 / 9)
    assert len(result.backtest.election_errors) == 9
    assert result.backtest.election_errors[-1].election_key == "nle_2025"
    turnout_2022 = 100 * 55_431_939 / 65_831_806
    turnout_2025 = 100 * 57_070_411 / 68_431_965
    assert result.backtest.election_errors[-1].mae == pytest.approx(
        abs(turnout_2022 - turnout_2025)
    )
    assert {prediction.method for prediction in result.predictions} == {"last_result"}
    voted = next(item for item in result.predictions if item.option_key == "voted")
    assert voted.predicted_vote_share == pytest.approx(83.39729978526847)
    assert voted.scope_sensitivity_lower == pytest.approx(83.39729978526847)
    assert voted.scope_sensitivity_upper == pytest.approx(turnout_2022)
