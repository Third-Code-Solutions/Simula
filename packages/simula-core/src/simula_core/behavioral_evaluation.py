"""Prespecified held-out evaluation for experimental behavioral scores."""

from __future__ import annotations

from hashlib import sha256
from math import fsum, sqrt
from typing import Literal, Self
from uuid import UUID

from pydantic import AwareDatetime, Field, model_validator

from simula_core.behavioral_engine import FrozenModel, Sha256
from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import Key

EVALUATION_LIMITATION = (
    "This report measures agreement on one frozen held-out corpus. It does not establish "
    "population representation, causal effect, future performance, or product validity."
)


class BehavioralEvaluationProtocol(FrozenModel):
    protocol_id: UUID
    version: int = Field(ge=1)
    methodology_version: Key
    registered_at: AwareDatetime
    development_campaign_ids: tuple[UUID, ...] = Field(min_length=1)
    holdout_campaign_ids: tuple[UUID, ...] = Field(min_length=2)
    minimum_subgroup_size: int = Field(ge=2, le=10000)
    score_minimum: float = Field(default=0.0, allow_inf_nan=False)
    score_maximum: float = Field(default=100.0, allow_inf_nan=False)
    primary_metric: Literal["mean_absolute_error"] = "mean_absolute_error"
    secondary_metric: Literal["pearson_correlation"] = "pearson_correlation"

    @model_validator(mode="after")
    def split_is_frozen_and_disjoint(self) -> Self:
        development = set(self.development_campaign_ids)
        holdout = set(self.holdout_campaign_ids)
        if len(development) != len(self.development_campaign_ids):
            raise ValueError("development campaign identifiers must be unique")
        if len(holdout) != len(self.holdout_campaign_ids):
            raise ValueError("holdout campaign identifiers must be unique")
        if development & holdout:
            raise ValueError("development and holdout campaigns must be disjoint")
        if self.score_maximum <= self.score_minimum:
            raise ValueError("evaluation score bounds are invalid")
        return self


class OutcomeProvenance(FrozenModel):
    source_id: Key
    source_version: Key
    owner: str = Field(min_length=1, max_length=200)
    license: str = Field(min_length=1, max_length=500)
    allowed_use: str = Field(min_length=1, max_length=500)
    observed_at: AwareDatetime
    checksum_sha256: Sha256


class BehavioralEvaluationObservation(FrozenModel):
    campaign_id: UUID
    methodology_version: Key
    predicted_score: float = Field(allow_inf_nan=False)
    observed_score: float = Field(allow_inf_nan=False)
    baseline_score: float | None = Field(default=None, allow_inf_nan=False)
    subgroup_keys: tuple[Key, ...] = ()
    outcome_provenance: OutcomeProvenance

    @model_validator(mode="after")
    def subgroup_keys_are_unique(self) -> Self:
        if len(set(self.subgroup_keys)) != len(self.subgroup_keys):
            raise ValueError("evaluation subgroup keys must be unique")
        return self


class AgreementMetrics(FrozenModel):
    sample_size: int = Field(ge=2)
    mean_absolute_error: float = Field(ge=0.0)
    pearson_correlation: float | None = Field(default=None, ge=-1.0, le=1.0)
    correlation_unavailable_reason: Literal["constant_scores"] | None = None
    baseline_mean_absolute_error: float | None = Field(default=None, ge=0.0)

    @model_validator(mode="after")
    def correlation_state_is_exact(self) -> Self:
        if (self.pearson_correlation is None) != (self.correlation_unavailable_reason is not None):
            raise ValueError("correlation availability must have one exact explanation")
        return self


class SubgroupAgreement(FrozenModel):
    subgroup_key: Key
    sample_size: int = Field(ge=1)
    status: Literal["reported", "suppressed"]
    metrics: AgreementMetrics | None
    suppression_reason: Literal["below_prespecified_minimum"] | None

    @model_validator(mode="after")
    def disclosure_is_consistent(self) -> Self:
        if self.status == "reported":
            if self.metrics is None or self.suppression_reason is not None:
                raise ValueError("reported subgroup metrics are incomplete")
        elif self.metrics is not None or self.suppression_reason is None:
            raise ValueError("suppressed subgroup metrics must not be exposed")
        return self


class BehavioralEvaluationReport(FrozenModel):
    schema_version: Literal[1] = 1
    protocol_id: UUID
    protocol_version: int = Field(ge=1)
    methodology_version: Key
    validation_label: Literal["benchmark_only"] = "benchmark_only"
    metrics: AgreementMetrics
    subgroups: tuple[SubgroupAgreement, ...]
    observation_sha256: Sha256
    limitations: tuple[str, ...] = (EVALUATION_LIMITATION,)


def _metrics(
    observations: tuple[BehavioralEvaluationObservation, ...],
) -> AgreementMetrics:
    predicted = tuple(observation.predicted_score for observation in observations)
    observed = tuple(observation.observed_score for observation in observations)
    sample_size = len(observations)
    mean_absolute_error = (
        fsum(
            abs(predicted_score - observed_score)
            for predicted_score, observed_score in zip(predicted, observed, strict=True)
        )
        / sample_size
    )

    predicted_mean = fsum(predicted) / sample_size
    observed_mean = fsum(observed) / sample_size
    covariance = fsum(
        (predicted_score - predicted_mean) * (observed_score - observed_mean)
        for predicted_score, observed_score in zip(predicted, observed, strict=True)
    )
    predicted_variance = fsum((score - predicted_mean) ** 2 for score in predicted)
    observed_variance = fsum((score - observed_mean) ** 2 for score in observed)
    denominator = sqrt(predicted_variance * observed_variance)
    correlation = None if denominator == 0 else max(-1.0, min(1.0, covariance / denominator))

    baselines = tuple(observation.baseline_score for observation in observations)
    baseline_values = tuple(baseline for baseline in baselines if baseline is not None)
    if baseline_values and len(baseline_values) != sample_size:
        raise ValueError("baseline scores must be supplied for every evaluated row or none")
    baseline_mean_absolute_error = (
        None
        if not baseline_values
        else fsum(
            abs(baseline - observed_score)
            for baseline, observed_score in zip(baseline_values, observed, strict=True)
        )
        / sample_size
    )
    return AgreementMetrics(
        sample_size=sample_size,
        mean_absolute_error=mean_absolute_error,
        pearson_correlation=correlation,
        correlation_unavailable_reason=None if correlation is not None else "constant_scores",
        baseline_mean_absolute_error=baseline_mean_absolute_error,
    )


def evaluate_behavioral_holdout(
    protocol: BehavioralEvaluationProtocol,
    observations: tuple[BehavioralEvaluationObservation, ...],
) -> BehavioralEvaluationReport:
    """Evaluate one complete frozen holdout without selecting or omitting rows."""

    if len(observations) < 2:
        raise ValueError("evaluation requires at least two observations")
    by_campaign = {observation.campaign_id: observation for observation in observations}
    if len(by_campaign) != len(observations):
        raise ValueError("evaluation campaign observations must be unique")
    if set(by_campaign) != set(protocol.holdout_campaign_ids):
        raise ValueError("observations must exactly match the prespecified holdout")
    ordered = tuple(by_campaign[campaign_id] for campaign_id in protocol.holdout_campaign_ids)
    if any(
        observation.methodology_version != protocol.methodology_version for observation in ordered
    ):
        raise ValueError("evaluation methodology version drifted from the protocol")
    if any(
        observation.predicted_score < protocol.score_minimum
        or observation.predicted_score > protocol.score_maximum
        or observation.observed_score < protocol.score_minimum
        or observation.observed_score > protocol.score_maximum
        or (
            observation.baseline_score is not None
            and (
                observation.baseline_score < protocol.score_minimum
                or observation.baseline_score > protocol.score_maximum
            )
        )
        for observation in ordered
    ):
        raise ValueError("evaluation score is outside the protocol bounds")
    baseline_presence = {observation.baseline_score is not None for observation in ordered}
    if len(baseline_presence) != 1:
        raise ValueError("baseline scores must be supplied for every holdout row or none")

    subgroup_keys = sorted(
        {subgroup_key for observation in ordered for subgroup_key in observation.subgroup_keys}
    )
    subgroups = []
    for subgroup_key in subgroup_keys:
        subgroup_observations = tuple(
            observation for observation in ordered if subgroup_key in observation.subgroup_keys
        )
        if len(subgroup_observations) < protocol.minimum_subgroup_size:
            subgroups.append(
                SubgroupAgreement(
                    subgroup_key=subgroup_key,
                    sample_size=len(subgroup_observations),
                    status="suppressed",
                    metrics=None,
                    suppression_reason="below_prespecified_minimum",
                )
            )
        else:
            subgroups.append(
                SubgroupAgreement(
                    subgroup_key=subgroup_key,
                    sample_size=len(subgroup_observations),
                    status="reported",
                    metrics=_metrics(subgroup_observations),
                    suppression_reason=None,
                )
            )

    observation_sha256 = sha256(
        canonical_json_dumps([observation.model_dump(mode="json") for observation in ordered])
    ).hexdigest()
    return BehavioralEvaluationReport(
        protocol_id=protocol.protocol_id,
        protocol_version=protocol.version,
        methodology_version=protocol.methodology_version,
        metrics=_metrics(ordered),
        subgroups=tuple(subgroups),
        observation_sha256=observation_sha256,
    )
