from __future__ import annotations

from datetime import date
from typing import cast
from uuid import UUID

from simula_worker.campaign_lab import evaluate_campaign_lab_claim
from simula_worker.database import CampaignLabClaim


def test_worker_generates_strict_aggregate_forecast_from_private_official_history() -> None:
    observations: list[dict[str, object]] = []
    for election_key, election_date, party_a_share in (
        ("election_2010", date(2010, 1, 1), 35),
        ("election_2013", date(2013, 1, 1), 40),
        ("election_2016", date(2016, 1, 1), 45),
        ("election_2019", date(2019, 1, 1), 50),
        ("election_2022", date(2022, 1, 1), 55),
    ):
        for option_key, share in (
            ("party_a", party_a_share),
            ("party_b", 100 - party_a_share),
        ):
            observations.append(
                {
                    "election_key": election_key,
                    "election_date": election_date.isoformat(),
                    "contest_key": "national_contest",
                    "geography_key": "national",
                    "option_key": option_key,
                    "option_group_key": option_key,
                    "votes": share * 1_000,
                    "valid_votes": 100_000,
                }
            )

    targets = [
        {
            "election_key": "election_2025",
            "election_date": "2025-01-01",
            "contest_key": "national_contest",
            "geography_key": "national",
            "option_key": option_key,
            "option_group_key": option_key,
        }
        for option_key in ("party_a", "party_b")
    ]
    claim = CampaignLabClaim(
        run_id=UUID("10000000-0000-4000-8000-000000000001"),
        run_type="aggregate_forecast",
        request={
            "model_version": "aggregate_trend_v1",
            "dataset_id": "20000000-0000-4000-8000-000000000001",
            "targets": targets,
        },
        secret_payload={
            "source": {
                "source_id": "comelec_official_results_fixture",
                "source_version": "2026_08_07",
                "owner": "Commission on Elections",
                "license": "Official public aggregate election results",
                "allowed_uses": ["Aggregate historical forecasting and evaluation."],
                "geography": "Fictional national contest",
                "observation_period": "2010 through 2022",
                "checksum_sha256": "a" * 64,
                "authorized_for_forecasting": True,
            },
            "observations": observations,
            "admitted_targets": targets,
        },
        lease_token=UUID("30000000-0000-4000-8000-000000000001"),
        attempt_count=1,
    )

    result = evaluate_campaign_lab_claim(claim)
    backtest = cast(dict[str, object], result["backtest"])
    predictions = cast(list[dict[str, object]], result["predictions"])

    assert result["respondent_data_used"] is False
    assert result["evidence_status"] == "experimental"
    assert backtest["sealed_out_of_time_holdout"] is False
    assert backtest["retrospective_quality_gate_passed"] is True
    assert backtest["holdout_election_count"] == 2
    assert [item["predicted_vote_share"] for item in predictions] == [60.0, 40.0]
