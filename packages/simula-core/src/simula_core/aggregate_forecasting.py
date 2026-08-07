"""Respondent-free aggregate election forecasting from official outcomes.

The model is intentionally narrow: aggregate vote-share trend extrapolation with
strict temporal ordering and walk-forward evaluation. It does not estimate
individual behavior or causal message persuasion.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from hashlib import sha256
from math import ceil, fsum, isclose
from typing import Literal, Self

from pydantic import Field, model_validator

from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import FrozenModel, Key, Label, Sha256, ShortText

AGGREGATE_FORECAST_MODEL_VERSION = "aggregate_trend_v1"
MINIMUM_TRAINING_ELECTIONS = 3
MINIMUM_HOLDOUT_ELECTIONS = 2
MAXIMUM_VALIDATED_MAE = 5.0
MINIMUM_BASELINE_IMPROVEMENT = 0.0
MINIMUM_INTERVAL_COVERAGE = 0.8
INTERVAL_CONFIDENCE = 0.8


class AggregateElectionSource(FrozenModel):
    evidence_class: Literal["official_aggregate_election_outcome"] = (
        "official_aggregate_election_outcome"
    )
    source_id: Key
    source_version: Label
    owner: Label
    license: Label
    allowed_uses: tuple[ShortText, ...] = Field(min_length=1)
    geography: Label
    observation_period: ShortText
    checksum_sha256: Sha256
    authorized_for_forecasting: bool
    sealed_out_of_time_holdout: bool = False

    @model_validator(mode="after")
    def approved_for_aggregate_forecasting(self) -> Self:
        if not self.authorized_for_forecasting:
            raise ValueError("aggregate election source is not authorized for forecasting")
        if not any("forecast" in use.casefold() for use in self.allowed_uses):
            raise ValueError("aggregate election source allowed uses must include forecasting")
        return self


class AggregateElectionObservation(FrozenModel):
    election_key: Key
    election_date: date
    contest_key: Key
    geography_key: Key
    option_key: Key
    option_group_key: Key
    votes: int = Field(ge=0, le=2_147_483_647)
    valid_votes: int = Field(gt=0, le=2_147_483_647)

    @model_validator(mode="after")
    def votes_do_not_exceed_denominator(self) -> Self:
        if self.votes > self.valid_votes:
            raise ValueError("option votes cannot exceed valid contest votes")
        return self

    @property
    def vote_share(self) -> float:
        return 100.0 * self.votes / self.valid_votes


class AggregateForecastTarget(FrozenModel):
    election_key: Key
    election_date: date
    contest_key: Key
    geography_key: Key
    option_key: Key
    option_group_key: Key


class AggregateForecastRequest(FrozenModel):
    model_version: Label
    source: AggregateElectionSource
    observations: tuple[AggregateElectionObservation, ...] = Field(min_length=4, max_length=100_000)
    targets: tuple[AggregateForecastTarget, ...] = Field(min_length=2, max_length=10_000)
    admitted_targets: tuple[AggregateForecastTarget, ...] = Field(min_length=2, max_length=10_000)
    minimum_training_elections: int = Field(default=MINIMUM_TRAINING_ELECTIONS, ge=2, le=20)
    minimum_holdout_elections: int = Field(default=MINIMUM_HOLDOUT_ELECTIONS, ge=1, le=20)
    maximum_validated_mae: float = Field(default=MAXIMUM_VALIDATED_MAE, gt=0.0, le=25.0)
    minimum_baseline_improvement: float = Field(
        default=MINIMUM_BASELINE_IMPROVEMENT, ge=0.0, le=25.0
    )
    minimum_interval_coverage: float = Field(default=MINIMUM_INTERVAL_COVERAGE, ge=0.5, le=1.0)
    interval_confidence: float = Field(default=INTERVAL_CONFIDENCE, ge=0.5, lt=1.0)

    @model_validator(mode="after")
    def enforce_aggregate_temporal_boundary(self) -> Self:
        observation_keys = [
            (
                item.election_key,
                item.contest_key,
                item.geography_key,
                item.option_key,
            )
            for item in self.observations
        ]
        if len(observation_keys) != len(set(observation_keys)):
            raise ValueError("aggregate election observations must be unique")
        observation_group_keys = [
            (
                item.election_key,
                item.contest_key,
                item.geography_key,
                item.option_group_key,
            )
            for item in self.observations
        ]
        if len(observation_group_keys) != len(set(observation_group_keys)):
            raise ValueError("observation option groups must be unique within each cell")
        target_keys = [
            (
                item.election_key,
                item.contest_key,
                item.geography_key,
                item.option_key,
            )
            for item in self.targets
        ]
        if len(target_keys) != len(set(target_keys)):
            raise ValueError("aggregate forecast targets must be unique")
        target_group_keys = [
            (
                item.election_key,
                item.contest_key,
                item.geography_key,
                item.option_group_key,
            )
            for item in self.targets
        ]
        if len(target_group_keys) != len(set(target_group_keys)):
            raise ValueError("target option groups must be unique within each cell")
        latest_observation = max(item.election_date for item in self.observations)
        if any(item.election_date <= latest_observation for item in self.targets):
            raise ValueError("forecast targets must be later than every training observation")
        if {item.election_key for item in self.observations} & {
            item.election_key for item in self.targets
        }:
            raise ValueError("forecast target elections cannot appear in training observations")

        denominators: dict[tuple[str, date, str, str], int] = {}
        vote_totals: dict[tuple[str, date, str, str], int] = defaultdict(int)
        for observation in self.observations:
            key = (
                observation.election_key,
                observation.election_date,
                observation.contest_key,
                observation.geography_key,
            )
            previous = denominators.setdefault(key, observation.valid_votes)
            if previous != observation.valid_votes:
                raise ValueError("valid contest votes must be consistent within an election cell")
            vote_totals[key] += observation.votes
        if any(vote_totals[key] != denominator for key, denominator in denominators.items()):
            raise ValueError("option votes must sum to valid votes within each election cell")

        target_cells: dict[tuple[str, date, str, str], int] = defaultdict(int)
        for target in self.targets:
            target_cells[
                (
                    target.election_key,
                    target.election_date,
                    target.contest_key,
                    target.geography_key,
                )
            ] += 1
        if any(count < 2 for count in target_cells.values()):
            raise ValueError("aggregate forecast requires at least two options per target cell")
        latest_date_by_scope: dict[tuple[str, str], date] = {}
        for observation in self.observations:
            scope = (observation.contest_key, observation.geography_key)
            latest_date_by_scope[scope] = max(
                latest_date_by_scope.get(scope, observation.election_date),
                observation.election_date,
            )
        latest_groups_by_scope: dict[tuple[str, str], set[str]] = defaultdict(set)
        for observation in self.observations:
            scope = (observation.contest_key, observation.geography_key)
            if observation.election_date == latest_date_by_scope[scope]:
                latest_groups_by_scope[scope].add(observation.option_group_key)
        target_groups_by_cell: dict[tuple[str, date, str, str], set[str]] = defaultdict(set)
        for target in self.targets:
            target_groups_by_cell[
                (
                    target.election_key,
                    target.election_date,
                    target.contest_key,
                    target.geography_key,
                )
            ].add(target.option_group_key)
        for (_, _, contest_key, geography_key), groups in target_groups_by_cell.items():
            if groups != latest_groups_by_scope.get((contest_key, geography_key), set()):
                raise ValueError(
                    "forecast targets must contain the complete latest historical option set"
                )
        latest_option_by_group: dict[tuple[str, str, str], tuple[date, str]] = {}
        for observation in self.observations:
            group = (
                observation.contest_key,
                observation.geography_key,
                observation.option_group_key,
            )
            existing_latest = latest_option_by_group.get(group)
            candidate = (observation.election_date, observation.option_key)
            if existing_latest is None or candidate[0] > existing_latest[0]:
                latest_option_by_group[group] = candidate
        for target in self.targets:
            group = (target.contest_key, target.geography_key, target.option_group_key)
            canonical = latest_option_by_group.get(group)
            if canonical is not None and target.option_key != canonical[1]:
                raise ValueError(
                    "target option labels must match the latest admitted historical option"
                )
        admitted_target_keys = {
            (
                item.election_key,
                item.election_date,
                item.contest_key,
                item.geography_key,
                item.option_key,
                item.option_group_key,
            )
            for item in self.admitted_targets
        }
        requested_target_keys = {
            (
                item.election_key,
                item.election_date,
                item.contest_key,
                item.geography_key,
                item.option_key,
                item.option_group_key,
            )
            for item in self.targets
        }
        if len(admitted_target_keys) != len(self.admitted_targets):
            raise ValueError("admitted aggregate forecast targets must be unique")
        if requested_target_keys != admitted_target_keys:
            raise ValueError("forecast targets must exactly match the admitted target set")
        return self


class AggregateForecastPrediction(FrozenModel):
    election_key: Key
    election_date: date
    contest_key: Key
    geography_key: Key
    option_key: Key
    option_group_key: Key
    predicted_vote_share: float = Field(ge=0.0, le=100.0)
    interval_lower: float = Field(ge=0.0, le=100.0)
    interval_upper: float = Field(ge=0.0, le=100.0)
    scope_sensitivity_lower: float = Field(ge=0.0, le=100.0)
    scope_sensitivity_upper: float = Field(ge=0.0, le=100.0)
    training_election_count: int = Field(ge=2)
    method: Literal["linear_trend", "last_result"]

    @model_validator(mode="after")
    def ordered_interval(self) -> Self:
        if not self.interval_lower <= self.predicted_vote_share <= self.interval_upper:
            raise ValueError("forecast interval must contain the predicted vote share")
        if not (
            self.scope_sensitivity_lower
            <= self.predicted_vote_share
            <= self.scope_sensitivity_upper
        ):
            raise ValueError("scope sensitivity bounds must contain the prediction")
        return self


class AggregateForecastOptionError(FrozenModel):
    option_key: Key
    option_group_key: Key
    actual_vote_share: float = Field(ge=0.0, le=100.0)
    predicted_vote_share: float = Field(ge=0.0, le=100.0)
    baseline_vote_share: float = Field(ge=0.0, le=100.0)
    absolute_error: float = Field(ge=0.0, le=100.0)
    interval_lower: float = Field(ge=0.0, le=100.0)
    interval_upper: float = Field(ge=0.0, le=100.0)
    scope_sensitivity_lower: float = Field(ge=0.0, le=100.0)
    scope_sensitivity_upper: float = Field(ge=0.0, le=100.0)


class AggregateForecastElectionError(FrozenModel):
    election_key: Key
    election_date: date
    contest_key: Key
    geography_key: Key
    training_election_count: int = Field(ge=2)
    prediction_count: int = Field(ge=2)
    mae: float = Field(ge=0.0, le=100.0)
    baseline_mae: float = Field(ge=0.0, le=100.0)
    interval_coverage: float = Field(ge=0.0, le=1.0)
    option_errors: tuple[AggregateForecastOptionError, ...] = Field(min_length=2)


class AggregateForecastBacktest(FrozenModel):
    protocol: Literal["strict_walk_forward"] = "strict_walk_forward"
    validation_design: Literal["retrospective_walk_forward"] = "retrospective_walk_forward"
    sealed_out_of_time_holdout: Literal[False] = False
    holdout_election_count: int = Field(ge=0)
    prediction_count: int = Field(ge=0)
    mae: float | None = Field(default=None, ge=0.0, le=100.0)
    baseline_mae: float | None = Field(default=None, ge=0.0, le=100.0)
    improvement_vs_last_result_baseline: float | None = Field(default=None, ge=-100.0, le=100.0)
    interval_coverage: float | None = Field(default=None, ge=0.0, le=1.0)
    temporal_leakage_detected: Literal[False] = False
    retrospective_quality_gate_passed: bool = False
    election_errors: tuple[AggregateForecastElectionError, ...] = ()
    scope_drift_assessment: ShortText = (
        "Sensitivity bounds exclude the latest available training election; source-scope "
        "differences remain a limitation, not a corrected causal estimate."
    )


AggregateForecastEvidenceStatus = Literal["experimental", "insufficient_evidence"]


class AggregateForecastResult(FrozenModel):
    schema_version: Literal[1] = 1
    model_version: Label
    evidence_status: AggregateForecastEvidenceStatus
    source_id: Key
    source_version: Label
    source_checksum_sha256: Sha256
    respondent_data_used: Literal[False] = False
    predictions: tuple[AggregateForecastPrediction, ...] = Field(min_length=2)
    backtest: AggregateForecastBacktest
    limitations: tuple[ShortText, ...] = Field(min_length=1, max_length=10)
    reproducibility_checksum_sha256: Sha256 = "0" * 64


def _group_history(
    observations: tuple[AggregateElectionObservation, ...],
) -> dict[tuple[str, str, str], tuple[AggregateElectionObservation, ...]]:
    grouped: dict[tuple[str, str, str], list[AggregateElectionObservation]] = defaultdict(list)
    for item in observations:
        grouped[(item.contest_key, item.geography_key, item.option_group_key)].append(item)
    return {
        key: tuple(sorted(values, key=lambda item: (item.election_date, item.election_key)))
        for key, values in grouped.items()
    }


def _linear_trend(history: tuple[AggregateElectionObservation, ...], _target_date: date) -> float:
    if len(history) < 2:
        raise ValueError("aggregate forecast requires at least two prior elections per option")
    x_values = tuple(float(index) for index in range(len(history)))
    y_values = tuple(item.vote_share for item in history)
    x_mean = fsum(x_values) / len(x_values)
    y_mean = fsum(y_values) / len(y_values)
    denominator = fsum((value - x_mean) ** 2 for value in x_values)
    if isclose(denominator, 0.0, abs_tol=1e-12):
        return y_values[-1]
    slope = (
        fsum(
            (x_value - x_mean) * (y_value - y_mean)
            for x_value, y_value in zip(x_values, y_values, strict=True)
        )
        / denominator
    )
    # Admitted targets are one explicitly versioned election horizon. Trend uses
    # election order, not self-authored day intervals from the source manifest.
    target_x = x_values[-1] + 1.0
    return min(100.0, max(0.0, y_mean + slope * (target_x - x_mean)))


def _normalize(raw: dict[str, float]) -> dict[str, float]:
    total = fsum(raw.values())
    if total <= 0.0:
        raise ValueError("aggregate forecast options have no estimable vote share")
    return {key: 100.0 * value / total for key, value in raw.items()}


def _nearest_rank(values: list[float], confidence: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = min(len(ordered), max(1, ceil(confidence * len(ordered))))
    return ordered[rank - 1]


ForecastMethod = Literal["linear_trend", "last_result"]


def _method_prediction(
    history: tuple[AggregateElectionObservation, ...],
    target_date: date,
    method: ForecastMethod,
) -> float:
    if method == "last_result":
        return history[-1].vote_share
    return _linear_trend(history, target_date)


def _method_errors(
    history: tuple[AggregateElectionObservation, ...], method: ForecastMethod
) -> list[float]:
    return [
        abs(
            _method_prediction(history[:index], history[index].election_date, method)
            - history[index].vote_share
        )
        for index in range(2, len(history))
    ]


def _select_method(
    history: tuple[AggregateElectionObservation, ...],
) -> tuple[ForecastMethod, list[float]]:
    trend_errors = _method_errors(history, "linear_trend")
    if not trend_errors:
        return "linear_trend", []
    last_errors = _method_errors(history, "last_result")
    trend_mae = fsum(trend_errors) / len(trend_errors)
    last_mae = fsum(last_errors) / len(last_errors)
    if last_mae <= trend_mae:
        return "last_result", last_errors
    return "linear_trend", trend_errors


def _scope_sensitivity_prediction(
    history: tuple[AggregateElectionObservation, ...],
    target_date: date,
    minimum_training_elections: int,
) -> float | None:
    reduced = history[:-1]
    if len(reduced) < minimum_training_elections:
        return None
    method, _ = _select_method(reduced)
    return _method_prediction(reduced, target_date, method)


def _walk_forward(
    request: AggregateForecastRequest,
) -> tuple[AggregateForecastBacktest, float]:
    history = _group_history(request.observations)
    cells: dict[tuple[date, str, str], list[AggregateElectionObservation]] = defaultdict(list)
    for item in request.observations:
        cells[(item.election_date, item.contest_key, item.geography_key)].append(item)

    errors: list[float] = []
    baseline_errors: list[float] = []
    covered: list[float] = []
    holdout_dates: set[date] = set()
    prior_errors: list[float] = []
    pending_date_errors: list[float] = []
    active_holdout_date: date | None = None
    election_errors: list[AggregateForecastElectionError] = []
    for (holdout_date, contest_key, geography_key), actual_rows in sorted(cells.items()):
        if active_holdout_date is not None and holdout_date != active_holdout_date:
            prior_errors.extend(pending_date_errors)
            pending_date_errors = []
        active_holdout_date = holdout_date
        actual_rows = sorted(actual_rows, key=lambda item: item.option_key)
        prior_by_group: dict[str, tuple[AggregateElectionObservation, ...]] = {}
        for actual in actual_rows:
            group_key = (contest_key, geography_key, actual.option_group_key)
            prior = tuple(item for item in history[group_key] if item.election_date < holdout_date)
            if len(prior) < request.minimum_training_elections:
                break
            prior_by_group[actual.option_group_key] = prior
        else:
            methods = {
                group_key: _select_method(prior)[0] for group_key, prior in prior_by_group.items()
            }
            raw = {
                actual.option_group_key: _method_prediction(
                    prior_by_group[actual.option_group_key],
                    holdout_date,
                    methods[actual.option_group_key],
                )
                for actual in actual_rows
            }
            predictions = _normalize(raw)
            baselines = _normalize(
                {group_key: prior[-1].vote_share for group_key, prior in prior_by_group.items()}
            )
            scope_alternatives = _normalize(
                {
                    group_key: alternative if alternative is not None else predictions[group_key]
                    for group_key, prior in prior_by_group.items()
                    for alternative in (
                        _scope_sensitivity_prediction(
                            prior,
                            holdout_date,
                            request.minimum_training_elections,
                        ),
                    )
                }
            )
            training_errors = [
                error for prior in prior_by_group.values() for error in _select_method(prior)[1]
            ]
            interval_radius = _nearest_rank(
                [*training_errors, *prior_errors], request.interval_confidence
            )
            cell_errors: list[float] = []
            cell_baseline_errors: list[float] = []
            cell_covered: list[float] = []
            option_errors: list[AggregateForecastOptionError] = []
            for actual in actual_rows:
                predicted = predictions[actual.option_group_key]
                error = abs(predicted - actual.vote_share)
                baseline_error = abs(baselines[actual.option_group_key] - actual.vote_share)
                is_covered = float(error <= interval_radius + 1e-12)
                scope_alternative = scope_alternatives[actual.option_group_key]
                errors.append(error)
                cell_errors.append(error)
                baseline_errors.append(baseline_error)
                cell_baseline_errors.append(baseline_error)
                covered.append(is_covered)
                cell_covered.append(is_covered)
                option_errors.append(
                    AggregateForecastOptionError(
                        option_key=actual.option_key,
                        option_group_key=actual.option_group_key,
                        actual_vote_share=actual.vote_share,
                        predicted_vote_share=predicted,
                        baseline_vote_share=baselines[actual.option_group_key],
                        absolute_error=error,
                        interval_lower=max(0.0, predicted - interval_radius),
                        interval_upper=min(100.0, predicted + interval_radius),
                        scope_sensitivity_lower=min(predicted, scope_alternative),
                        scope_sensitivity_upper=max(predicted, scope_alternative),
                    )
                )
            pending_date_errors.extend(cell_errors)
            holdout_dates.add(holdout_date)
            election_errors.append(
                AggregateForecastElectionError(
                    election_key=actual_rows[0].election_key,
                    election_date=holdout_date,
                    contest_key=contest_key,
                    geography_key=geography_key,
                    training_election_count=min(len(value) for value in prior_by_group.values()),
                    prediction_count=len(option_errors),
                    mae=fsum(cell_errors) / len(cell_errors),
                    baseline_mae=fsum(cell_baseline_errors) / len(cell_baseline_errors),
                    interval_coverage=fsum(cell_covered) / len(cell_covered),
                    option_errors=tuple(option_errors),
                )
            )

    if not errors:
        return (
            AggregateForecastBacktest(holdout_election_count=0, prediction_count=0),
            0.0,
        )
    mae = fsum(errors) / len(errors)
    baseline_mae = fsum(baseline_errors) / len(baseline_errors)
    return (
        AggregateForecastBacktest(
            holdout_election_count=len(holdout_dates),
            prediction_count=len(errors),
            mae=mae,
            baseline_mae=baseline_mae,
            improvement_vs_last_result_baseline=baseline_mae - mae,
            interval_coverage=fsum(covered) / len(covered),
            election_errors=tuple(election_errors),
        ),
        _nearest_rank(errors, request.interval_confidence),
    )


def forecast_aggregate_election(request: AggregateForecastRequest) -> AggregateForecastResult:
    """Forecast aggregate vote shares and evaluate the method without respondents."""

    grouped_history = _group_history(request.observations)
    targets_by_cell: dict[tuple[str, date, str, str], list[AggregateForecastTarget]] = defaultdict(
        list
    )
    for target in request.targets:
        targets_by_cell[
            (
                target.election_key,
                target.election_date,
                target.contest_key,
                target.geography_key,
            )
        ].append(target)

    backtest, interval_radius = _walk_forward(request)
    predictions: list[AggregateForecastPrediction] = []
    for (_, target_date, contest_key, geography_key), targets in sorted(targets_by_cell.items()):
        target_history: dict[str, tuple[AggregateElectionObservation, ...]] = {}
        target_methods: dict[str, ForecastMethod] = {}
        raw: dict[str, float] = {}
        scope_raw: dict[str, float] = {}
        for target in targets:
            key = (contest_key, geography_key, target.option_group_key)
            history = grouped_history.get(key, ())
            if len(history) < request.minimum_training_elections:
                raise ValueError(
                    "aggregate forecast target lacks the required prior election history"
                )
            target_history[target.option_key] = history
            method, _ = _select_method(history)
            target_methods[target.option_key] = method
            raw[target.option_key] = _method_prediction(history, target_date, method)
            scope_alternative = _scope_sensitivity_prediction(
                history,
                target_date,
                request.minimum_training_elections,
            )
            scope_raw[target.option_key] = (
                raw[target.option_key] if scope_alternative is None else scope_alternative
            )
        normalized = _normalize(raw)
        scope_normalized = _normalize(scope_raw)
        for target in sorted(targets, key=lambda item: item.option_key):
            predicted = normalized[target.option_key]
            scope_alternative = scope_normalized[target.option_key]
            predictions.append(
                AggregateForecastPrediction(
                    **target.model_dump(),
                    predicted_vote_share=predicted,
                    interval_lower=max(0.0, predicted - interval_radius),
                    interval_upper=min(100.0, predicted + interval_radius),
                    scope_sensitivity_lower=min(predicted, scope_alternative),
                    scope_sensitivity_upper=max(predicted, scope_alternative),
                    training_election_count=len(target_history[target.option_key]),
                    method=target_methods[target.option_key],
                )
            )

    evidence_status: AggregateForecastEvidenceStatus = "insufficient_evidence"
    if backtest.holdout_election_count >= request.minimum_holdout_elections:
        if (
            backtest.mae is None
            or backtest.improvement_vs_last_result_baseline is None
            or backtest.interval_coverage is None
        ):
            raise RuntimeError("aggregate forecast backtest metrics are incomplete")
        quality_gate_passed = (
            backtest.mae <= request.maximum_validated_mae
            and backtest.improvement_vs_last_result_baseline >= request.minimum_baseline_improvement
            and backtest.interval_coverage >= request.minimum_interval_coverage
        )
        backtest = backtest.model_copy(
            update={"retrospective_quality_gate_passed": quality_gate_passed}
        )
        evidence_status = "experimental"

    result = AggregateForecastResult(
        model_version=request.model_version,
        evidence_status=evidence_status,
        source_id=request.source.source_id,
        source_version=request.source.source_version,
        source_checksum_sha256=request.source.checksum_sha256,
        predictions=tuple(predictions),
        backtest=backtest,
        limitations=(
            "Aggregate forecast from official historical outcomes; no respondent or "
            "person-level data were used.",
            "Historical association is not causal evidence of message persuasion or "
            "individual behavior.",
            "Validity is limited to the named contests, geographies, options, source "
            "version, and target dates.",
            "Walk-forward results are retrospective, not a pre-registered sealed "
            "out-of-time validation; scope-sensitivity bounds exclude the latest "
            "training election.",
        ),
    )
    checksum_payload = result.model_dump(mode="json", exclude={"reproducibility_checksum_sha256"})
    return result.model_copy(
        update={
            "reproducibility_checksum_sha256": sha256(
                canonical_json_dumps(checksum_payload)
            ).hexdigest()
        }
    )
