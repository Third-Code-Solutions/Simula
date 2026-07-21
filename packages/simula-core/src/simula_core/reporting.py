"""Phase 4 report, segment, comparison, and safe export primitives."""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime
from hashlib import sha256
from math import fsum
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import Field, StringConstraints, model_validator

from simula_core.json_codec import canonical_json_dumps
from simula_core.methodology import (
    AggregateReport,
    AudienceSample,
    FrozenModel,
    Key,
    MethodologyRunResult,
    ReactionKey,
    SampledCell,
    aggregate_cohort_responses,
)

ReportLabel = Annotated[str, StringConstraints(min_length=1, max_length=160)]
ReportText = Annotated[str, StringConstraints(min_length=1, max_length=2000)]
ReportFormat = Literal["json", "csv"]


class ReportIdentity(FrozenModel):
    report_id: UUID
    run_id: UUID
    project_id: UUID
    stimulus_version_id: UUID
    variant_key: Key
    variant_label: ReportLabel
    created_at: datetime

    @model_validator(mode="after")
    def aware_timestamp(self) -> Self:
        if self.created_at.utcoffset() is None:
            raise ValueError("report creation timestamp must be timezone-aware")
        return self


class MethodologyTransparency(FrozenModel):
    validation_label: Literal["experimental", "benchmarked", "calibrated"]
    numerical_output_kind: Literal["heuristic_score", "model_estimate"]
    qualitative_output_kind: Literal["generated_qualitative"] = "generated_qualitative"
    methodology_version: Key
    population_checksum_sha256: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
    audience_version_id: UUID
    sampling_checksum_sha256: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
    provider_id: Key
    provider_version: ReportLabel
    model_id: ReportLabel
    template_id: Key
    input_sha256: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
    output_sha256: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
    seed: int
    cost_microusd: int = Field(ge=0)


class SegmentReport(FrozenModel):
    dimension: Key
    value: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    sample_count: int = Field(ge=0)
    status: Literal["available", "suppressed"]
    report: AggregateReport | None
    reason: ReportText | None = None

    @model_validator(mode="after")
    def valid_availability(self) -> Self:
        if self.status == "available" and (self.report is None or self.reason is not None):
            raise ValueError("available segment must contain only a report")
        if self.status == "suppressed" and (self.report is not None or self.reason is None):
            raise ValueError("suppressed segment must contain only a reason")
        return self


class DisagreementFinding(FrozenModel):
    cell_key: Key
    disagreement: float = Field(ge=0.0, le=1.0)
    sample_count: int = Field(ge=1)
    dimensions: tuple[tuple[Key, str], ...]


class SyntheticRationale(FrozenModel):
    cell_key: Key
    text: ReportText
    synthetic: Literal[True] = True


class CompleteReport(FrozenModel):
    schema_version: Literal["2.0.0"] = "2.0.0"
    identity: ReportIdentity
    experimental_notice: ReportText
    executive_summary: ReportText
    overall: AggregateReport
    segments: tuple[SegmentReport, ...]
    disagreement_findings: tuple[DisagreementFinding, ...]
    rationales: tuple[SyntheticRationale, ...]
    recommendations: tuple[ReportText, ...]
    transparency: MethodologyTransparency
    limitations: tuple[ReportText, ...]
    content_sha256: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]


def _top_reaction(report: AggregateReport) -> ReactionKey:
    return max(report.distribution.categories, key=lambda item: item.value).key


def _segment_sample(
    sample: AudienceSample,
    cells: tuple[SampledCell, ...],
) -> AudienceSample:
    total = fsum(cell.audience_weight for cell in cells)
    normalized = tuple(
        cell.model_copy(update={"audience_weight": cell.audience_weight / total}) for cell in cells
    )
    configuration = sample.configuration.model_copy(update={"sparse_cell_threshold": 1})
    return AudienceSample(
        population_version_id=sample.population_version_id,
        audience_version_id=sample.audience_version_id,
        configuration=configuration,
        cells=normalized,
        excluded_population_weight=max(0.0, min(0.999999999, 1.0 - total)),
        checksum_sha256=sample.checksum_sha256,
    )


def _build_segments(result: MethodologyRunResult) -> tuple[SegmentReport, ...]:
    responses = {response.cell_key: response for response in result.cohort_responses}
    groups: dict[tuple[Key, str], list[SampledCell]] = {}
    for cell in result.sample.cells:
        for dimension_value in cell.dimensions:
            groups.setdefault((dimension_value.dimension, dimension_value.value), []).append(cell)
    segments: list[SegmentReport] = []
    threshold = result.sample.configuration.sparse_cell_threshold
    for dimension, value in sorted(groups):
        cells = tuple(groups[(dimension, value)])
        sample_count = sum(cell.sample_count for cell in cells)
        if sample_count < threshold:
            segments.append(
                SegmentReport(
                    dimension=dimension,
                    value=value,
                    sample_count=sample_count,
                    status="suppressed",
                    report=None,
                    reason="Segment is below configured minimum cohort size.",
                )
            )
            continue
        segment_sample = _segment_sample(result.sample, cells)
        segments.append(
            SegmentReport(
                dimension=dimension,
                value=value,
                sample_count=sample_count,
                status="available",
                report=aggregate_cohort_responses(
                    segment_sample,
                    tuple(responses[cell.key] for cell in cells),
                ),
            )
        )
    return tuple(segments)


def build_complete_report(
    result: MethodologyRunResult,
    *,
    report_id: UUID,
    project_id: UUID,
    stimulus_version_id: UUID,
    variant_key: Key,
    variant_label: ReportLabel,
    created_at: datetime,
) -> CompleteReport:
    top_reaction = _top_reaction(result.report)
    identity = ReportIdentity(
        report_id=report_id,
        run_id=result.run_id,
        project_id=project_id,
        stimulus_version_id=stimulus_version_id,
        variant_key=variant_key,
        variant_label=variant_label,
        created_at=created_at,
    )
    transparency = MethodologyTransparency(
        validation_label=result.validation_label,
        numerical_output_kind=(
            "model_estimate" if result.validation_label != "experimental" else "heuristic_score"
        ),
        methodology_version=result.reproducibility.methodology_version,
        population_checksum_sha256=result.reproducibility.population_checksum_sha256,
        audience_version_id=result.reproducibility.audience_version_id,
        sampling_checksum_sha256=result.reproducibility.sampling_checksum_sha256,
        provider_id=result.reproducibility.provider_id,
        provider_version=result.reproducibility.provider_version,
        model_id=result.reproducibility.model_id,
        template_id=result.reproducibility.template_id,
        input_sha256=result.reproducibility.input_sha256,
        output_sha256=result.reproducibility.output_sha256,
        seed=result.reproducibility.seed,
        cost_microusd=result.usage.cost_microusd,
    )
    disagreement = tuple(
        DisagreementFinding(
            cell_key=response.cell_key,
            disagreement=response.disagreement,
            sample_count=response.sample_count,
            dimensions=tuple(
                (item.dimension, item.value)
                for item in next(
                    cell for cell in result.sample.cells if cell.key == response.cell_key
                ).dimensions
            ),
        )
        for response in sorted(
            result.cohort_responses,
            key=lambda item: (-item.disagreement, item.cell_key),
        )[:5]
    )
    rationales = tuple(
        SyntheticRationale(cell_key=response.cell_key, text=response.rationale)
        for response in sorted(result.cohort_responses, key=lambda item: item.cell_key)[:8]
    )
    core = {
        "schema_version": "2.0.0",
        "identity": identity.model_dump(mode="json"),
        "experimental_notice": (
            "Experimental synthetic-cohort rehearsal. No survey, participant, population, "
            "or outcome claim is made."
        ),
        "executive_summary": (
            f"Largest synthetic reaction category: {top_reaction}. "
            "Treat as a variant-rehearsal diagnostic and validate with human research."
        ),
        "overall": result.report.model_dump(mode="json"),
        "segments": [segment.model_dump(mode="json") for segment in _build_segments(result)],
        "disagreement_findings": [item.model_dump(mode="json") for item in disagreement],
        "rationales": [item.model_dump(mode="json") for item in rationales],
        "recommendations": [
            "Use segment differences to form human-research questions, not targeting claims.",
            "Review high-disagreement cohorts before choosing a variant.",
            "Collect eligible held-out human evidence before promoting any numerical output.",
        ],
        "transparency": transparency.model_dump(mode="json"),
        "limitations": list(
            dict.fromkeys(
                (
                    *result.report.limitations,
                    "Synthetic rationales are generated artifacts, not participant quotations.",
                    "Segment values below the configured cohort threshold are suppressed.",
                    "Comparison can reveal model differences but cannot establish market lift.",
                )
            )
        ),
    }
    return CompleteReport.model_validate(
        {**core, "content_sha256": sha256(canonical_json_dumps(core)).hexdigest()}
    )


class DistributionDelta(FrozenModel):
    key: ReactionKey
    baseline: float = Field(ge=0.0, le=1.0)
    candidate: float = Field(ge=0.0, le=1.0)
    delta: float = Field(ge=-1.0, le=1.0)


class ScoreDelta(FrozenModel):
    key: Key
    baseline: float = Field(ge=0.0, le=100.0)
    candidate: float = Field(ge=0.0, le=100.0)
    delta: float = Field(ge=-100.0, le=100.0)


class VariantComparison(FrozenModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    baseline_report_id: UUID
    candidate_report_id: UUID
    compatibility: Literal["compatible"] = "compatible"
    distribution_deltas: tuple[
        DistributionDelta, DistributionDelta, DistributionDelta, DistributionDelta
    ]
    metric_deltas: tuple[ScoreDelta, ScoreDelta, ScoreDelta, ScoreDelta, ScoreDelta]
    risk_deltas: tuple[ScoreDelta, ScoreDelta, ScoreDelta]
    largest_absolute_change: ReportText
    limitations: tuple[ReportText, ...]


def compare_variants(baseline: CompleteReport, candidate: CompleteReport) -> VariantComparison:
    compatible = (
        baseline.transparency.methodology_version == candidate.transparency.methodology_version
        and baseline.transparency.population_checksum_sha256
        == candidate.transparency.population_checksum_sha256
        and baseline.transparency.audience_version_id == candidate.transparency.audience_version_id
        and baseline.transparency.sampling_checksum_sha256
        == candidate.transparency.sampling_checksum_sha256
        and baseline.transparency.provider_id == candidate.transparency.provider_id
        and baseline.transparency.provider_version == candidate.transparency.provider_version
        and baseline.transparency.model_id == candidate.transparency.model_id
        and baseline.transparency.template_id == candidate.transparency.template_id
        and baseline.transparency.validation_label == candidate.transparency.validation_label
    )
    if not compatible:
        raise ValueError("variant reports use incompatible frozen configurations")
    distributions = tuple(
        DistributionDelta(
            key=left.key,
            baseline=left.value,
            candidate=right.value,
            delta=right.value - left.value,
        )
        for left, right in zip(
            baseline.overall.distribution.categories,
            candidate.overall.distribution.categories,
            strict=True,
        )
    )
    metrics = tuple(
        ScoreDelta(
            key=left.key,
            baseline=left.value,
            candidate=right.value,
            delta=right.value - left.value,
        )
        for left, right in zip(
            baseline.overall.metrics,
            candidate.overall.metrics,
            strict=True,
        )
    )
    risks = tuple(
        ScoreDelta(
            key=left.key,
            baseline=left.value,
            candidate=right.value,
            delta=right.value - left.value,
        )
        for left, right in zip(
            baseline.overall.risks,
            candidate.overall.risks,
            strict=True,
        )
    )
    delta_values = (
        tuple((item.key, item.delta) for item in distributions)
        + tuple((item.key, item.delta) for item in metrics)
        + tuple((item.key, item.delta) for item in risks)
    )
    largest_key, largest_delta = max(delta_values, key=lambda item: (abs(item[1]), item[0]))
    return VariantComparison(
        baseline_report_id=baseline.identity.report_id,
        candidate_report_id=candidate.identity.report_id,
        distribution_deltas=distributions,  # type: ignore[arg-type]
        metric_deltas=metrics,  # type: ignore[arg-type]
        risk_deltas=risks,  # type: ignore[arg-type]
        largest_absolute_change=(
            f"Largest modeled change: {largest_key} ({largest_delta:+.4f}). "
            "This is not evidence of market lift."
        ),
        limitations=(
            "Differences are model diagnostics under one compatible frozen configuration.",
            "No variant winner or causal effect is established.",
        ),
    )


class ReportExport(FrozenModel):
    format: ReportFormat
    media_type: Literal["application/json", "text/csv; charset=utf-8"]
    filename: Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9_.-]{0,119}$")]
    content: bytes
    content_sha256: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]


_UNSAFE_SPREADSHEET_PREFIX = re.compile(r"^[\s\x00-\x1f]*[=+\-@]")
_FILENAME_UNSAFE = re.compile(r"[^a-z0-9_.-]+")


def _safe_csv_cell(value: object) -> str:
    text = str(value).replace("\x00", "")
    return f"'{text}" if _UNSAFE_SPREADSHEET_PREFIX.match(text) else text


def _filename(label: str, suffix: str) -> str:
    stem = _FILENAME_UNSAFE.sub("-", label.casefold()).strip("-.") or "report"
    return f"simula-{stem[:96]}.{suffix}"


def export_report(report: CompleteReport, format: ReportFormat) -> ReportExport:
    if format == "json":
        content = canonical_json_dumps(report.model_dump(mode="json")) + b"\n"
        return ReportExport(
            format="json",
            media_type="application/json",
            filename=_filename(report.identity.variant_label, "json"),
            content=content,
            content_sha256=sha256(content).hexdigest(),
        )

    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\r\n")
    writer.writerow(("section", "key", "value", "output_kind", "validation_label"))

    def row(section: str, key: object, value: object, output_kind: str) -> None:
        writer.writerow(
            tuple(
                _safe_csv_cell(item)
                for item in (
                    section,
                    key,
                    value,
                    output_kind,
                    report.transparency.validation_label,
                )
            )
        )

    row("identity", "variant", report.identity.variant_label, "metadata")
    row("notice", "experimental", report.experimental_notice, "limitation")
    for reaction in report.overall.distribution.categories:
        row(
            "reaction",
            reaction.key,
            reaction.value,
            report.transparency.numerical_output_kind,
        )
    for emotion in report.overall.emotions.categories:
        row(
            "emotion",
            emotion.key,
            emotion.value,
            report.transparency.numerical_output_kind,
        )
    for metric in report.overall.metrics:
        row("metric", metric.key, metric.value, report.transparency.numerical_output_kind)
    for risk in report.overall.risks:
        row("risk", risk.key, risk.value, report.transparency.numerical_output_kind)
    for rationale in report.rationales:
        row("rationale", rationale.cell_key, rationale.text, "generated_qualitative")
    for index, recommendation in enumerate(report.recommendations, start=1):
        row("recommendation", index, recommendation, "recommendation")
    for index, limitation in enumerate(report.limitations, start=1):
        row("limitation", index, limitation, "limitation")
    for key, value in report.transparency.model_dump(mode="json").items():
        row("provenance", key, value, "metadata")
    content = stream.getvalue().encode("utf-8")
    return ReportExport(
        format="csv",
        media_type="text/csv; charset=utf-8",
        filename=_filename(report.identity.variant_label, "csv"),
        content=content,
        content_sha256=sha256(content).hexdigest(),
    )
