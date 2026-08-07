from __future__ import annotations

from datetime import date

import pytest
from simula_core.aggregate_forecasting import (
    AggregateElectionObservation,
    AggregateElectionSource,
    AggregateForecastRequest,
    AggregateForecastTarget,
    forecast_aggregate_election,
)


def _source(*, authorized: bool = True) -> AggregateElectionSource:
    return AggregateElectionSource(
        source_id="comelec_official_results_fixture",
        source_version="2026_08_07",
        owner="Commission on Elections",
        license="Official public aggregate election results",
        allowed_uses=("Aggregate historical forecasting and evaluation.",),
        geography="Fictional two-option national contest",
        observation_period="2010-01-01 through 2019-01-01",
        checksum_sha256="a" * 64,
        authorized_for_forecasting=authorized,
    )


def _observations() -> tuple[AggregateElectionObservation, ...]:
    rows: list[AggregateElectionObservation] = []
    for election_key, election_date, party_a_share in (
        ("election_2010", date(2010, 1, 1), 40),
        ("election_2013", date(2013, 1, 1), 45),
        ("election_2016", date(2016, 1, 1), 50),
        ("election_2019", date(2019, 1, 1), 55),
    ):
        for option_key, share in (
            ("party_a", party_a_share),
            ("party_b", 100 - party_a_share),
        ):
            rows.append(
                AggregateElectionObservation(
                    election_key=election_key,
                    election_date=election_date,
                    contest_key="national_contest",
                    geography_key="national",
                    option_key=option_key,
                    option_group_key=option_key,
                    votes=share * 1_000,
                    valid_votes=100_000,
                )
            )
    return tuple(rows)


def _request() -> AggregateForecastRequest:
    targets = (
        AggregateForecastTarget(
            election_key="election_2022",
            election_date=date(2022, 1, 1),
            contest_key="national_contest",
            geography_key="national",
            option_key="party_a",
            option_group_key="party_a",
        ),
        AggregateForecastTarget(
            election_key="election_2022",
            election_date=date(2022, 1, 1),
            contest_key="national_contest",
            geography_key="national",
            option_key="party_b",
            option_group_key="party_b",
        ),
    )
    return AggregateForecastRequest(
        model_version="aggregate_trend_v1",
        source=_source(),
        observations=_observations(),
        admitted_targets=targets,
        targets=targets,
        minimum_training_elections=2,
        minimum_holdout_elections=2,
        maximum_validated_mae=5.0,
        minimum_baseline_improvement=0.0,
        minimum_interval_coverage=0.8,
    )


def test_official_aggregate_forecast_generates_future_shares_without_respondents() -> None:
    result = forecast_aggregate_election(_request())

    assert result.respondent_data_used is False
    assert result.evidence_status == "experimental"
    assert result.backtest.validation_design == "retrospective_walk_forward"
    assert result.backtest.sealed_out_of_time_holdout is False
    assert result.backtest.holdout_election_count == 2
    assert result.backtest.mae == pytest.approx(0.0)
    assert result.backtest.baseline_mae == pytest.approx(5.0)
    assert result.backtest.interval_coverage == pytest.approx(1.0)
    assert [item.election_key for item in result.backtest.election_errors] == [
        "election_2016",
        "election_2019",
    ]
    assert {
        prediction.option_key: prediction.predicted_vote_share for prediction in result.predictions
    } == pytest.approx({"party_a": 60.0, "party_b": 40.0})
    assert sum(item.predicted_vote_share for item in result.predictions) == pytest.approx(100.0)
    assert all(
        item.scope_sensitivity_lower <= item.predicted_vote_share <= item.scope_sensitivity_upper
        for item in result.predictions
    )
    assert len(result.reproducibility_checksum_sha256) == 64


def test_aggregate_forecast_rejects_nonfuture_targets_and_unapproved_sources() -> None:
    with pytest.raises(ValueError, match="later than every training observation"):
        AggregateForecastRequest(
            **{
                **_request().model_dump(mode="python", exclude={"targets"}),
                "targets": (
                    AggregateForecastTarget(
                        election_key="leaked_2019",
                        election_date=date(2019, 1, 1),
                        contest_key="national_contest",
                        geography_key="national",
                        option_key=option_key,
                        option_group_key=option_key,
                    )
                    for option_key in ("party_a", "party_b")
                ),
            }
        )

    with pytest.raises(ValueError, match="not authorized"):
        _source(authorized=False)


def test_aggregate_forecast_fails_closed_when_holdout_evidence_is_insufficient() -> None:
    request = _request().model_copy(update={"minimum_holdout_elections": 3})

    result = forecast_aggregate_election(request)

    assert result.evidence_status == "insufficient_evidence"
    assert result.backtest.holdout_election_count == 2


def test_aggregate_forecast_is_reproducible_and_requires_target_group_history() -> None:
    first = forecast_aggregate_election(_request())
    second = forecast_aggregate_election(_request())

    assert first == second
    missing_group = (
        _request().targets[0].model_copy(update={"option_group_key": "party_without_history"})
    )
    request = _request().model_copy(update={"targets": (missing_group, _request().targets[1])})
    with pytest.raises(ValueError, match="lacks the required prior election history"):
        forecast_aggregate_election(request)


def test_aggregate_forecast_selects_persistence_when_trend_is_worse() -> None:
    observations: list[AggregateElectionObservation] = []
    for election_key, election_date, party_a_share in (
        ("election_2010", date(2010, 1, 1), 50),
        ("election_2013", date(2013, 1, 1), 51),
        ("election_2016", date(2016, 1, 1), 50),
        ("election_2019", date(2019, 1, 1), 51),
        ("election_2022", date(2022, 1, 1), 50),
    ):
        for option_key, share in (
            ("party_a", party_a_share),
            ("party_b", 100 - party_a_share),
        ):
            observations.append(
                AggregateElectionObservation(
                    election_key=election_key,
                    election_date=election_date,
                    contest_key="national_contest",
                    geography_key="national",
                    option_key=option_key,
                    option_group_key=option_key,
                    votes=share * 1_000,
                    valid_votes=100_000,
                )
            )
    request = _request().model_copy(
        update={
            "observations": tuple(observations),
            "minimum_training_elections": 3,
        }
    )

    result = forecast_aggregate_election(request)

    assert result.evidence_status == "experimental"
    assert result.backtest.mae == pytest.approx(1.0)
    assert result.backtest.improvement_vs_last_result_baseline == pytest.approx(0.0)
    assert result.backtest.interval_coverage == pytest.approx(1.0)
    assert {prediction.method for prediction in result.predictions} == {"last_result"}


def test_aggregate_forecast_rejects_duplicate_stable_groups_within_a_cell() -> None:
    request = _request()
    duplicate_target_group = request.targets[1].model_copy(update={"option_group_key": "party_a"})
    with pytest.raises(ValueError, match="target option groups must be unique"):
        AggregateForecastRequest.model_validate(
            {
                **request.model_dump(mode="python"),
                "targets": (request.targets[0], duplicate_target_group),
            }
        )

    observations = list(request.observations)
    observations[1] = observations[1].model_copy(update={"option_group_key": "party_a"})
    with pytest.raises(ValueError, match="observation option groups must be unique"):
        AggregateForecastRequest.model_validate(
            {**request.model_dump(mode="python"), "observations": observations}
        )


def test_aggregate_forecast_rejects_relabeling_a_historical_option_group() -> None:
    request = _request()
    relabeled = request.targets[0].model_copy(update={"option_key": "candidate_a"})

    with pytest.raises(ValueError, match="target option labels must match"):
        AggregateForecastRequest.model_validate(
            {
                **request.model_dump(mode="python"),
                "targets": (relabeled, request.targets[1]),
            }
        )


def test_aggregate_forecast_rejects_targets_outside_admitted_horizon() -> None:
    request = _request()
    unbound_targets = tuple(
        target.model_copy(
            update={"election_key": "election_2050", "election_date": date(2050, 5, 9)}
        )
        for target in request.targets
    )

    with pytest.raises(ValueError, match="exactly match the admitted target set"):
        AggregateForecastRequest.model_validate(
            {**request.model_dump(mode="python"), "targets": unbound_targets}
        )


def test_aggregate_forecast_rejects_incomplete_target_option_set() -> None:
    request = _request()
    incomplete_targets = (
        request.targets[0],
        request.targets[1].model_copy(
            update={
                "option_key": "party_c",
                "option_group_key": "party_c",
            }
        ),
    )

    with pytest.raises(ValueError, match="complete latest historical option set"):
        AggregateForecastRequest.model_validate(
            {
                **request.model_dump(mode="python"),
                "admitted_targets": incomplete_targets,
                "targets": incomplete_targets,
            }
        )


def test_walk_forward_does_not_reuse_same_date_errors_between_geographies() -> None:
    request = _request()
    secondary = tuple(
        observation.model_copy(update={"geography_key": "z_secondary"})
        for observation in request.observations
    )
    secondary_targets = tuple(
        target.model_copy(update={"geography_key": "z_secondary"}) for target in request.targets
    )
    secondary_only = AggregateForecastRequest.model_validate(
        {
            **request.model_dump(mode="python"),
            "observations": secondary,
            "admitted_targets": secondary_targets,
            "targets": secondary_targets,
        }
    )
    volatile_primary = tuple(
        observation.model_copy(
            update={
                "votes": (
                    observation.valid_votes - observation.votes
                    if observation.election_key == "election_2019"
                    else observation.votes
                )
            }
        )
        for observation in request.observations
    )
    combined = AggregateForecastRequest.model_validate(
        {
            **request.model_dump(mode="python"),
            "observations": (*volatile_primary, *secondary),
            "admitted_targets": secondary_targets,
            "targets": secondary_targets,
        }
    )

    expected = [
        error
        for error in forecast_aggregate_election(secondary_only).backtest.election_errors
        if error.geography_key == "z_secondary"
    ]
    actual = [
        error
        for error in forecast_aggregate_election(combined).backtest.election_errors
        if error.geography_key == "z_secondary"
    ]
    assert actual == expected
