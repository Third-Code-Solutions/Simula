"""Durable Campaign Simulation Lab evaluator.

The worker is the only component allowed to open secret survey/outcome
envelopes. It evaluates deterministic aggregate requests and persists bounded
results through lease-bound database functions.
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from datetime import UTC, datetime
from time import monotonic
from typing import cast
from uuid import UUID

import structlog
from pydantic import ValidationError
from simula_core.calibration_monitoring import (
    build_calibration_version_history,
    monitor_calibration_drift,
    snapshot_from_calibration,
)
from simula_core.campaign_lab import (
    CampaignLabResearchSource,
    CampaignLabSimulationRequest,
    CampaignLabSimulationResult,
    build_campaign_lab_report,
    build_compliance_review,
    build_structured_persona,
    create_synthetic_interview,
    run_campaign_lab_simulation,
)
from simula_core.historical_backtesting import (
    BlindBacktestPredictionSet,
    HistoricalBacktestProtocol,
    HistoricalOutcomeDataset,
    evaluate_historical_backtest,
)
from simula_core.research_ingestion import (
    ResearchMediaType,
    ingest_research_document,
)
from simula_core.survey_calibration import (
    SurveyCalibrationResult,
    SurveyDataset,
    SyntheticVariantObservation,
    calibrate_synthetic_panel,
)
from simula_core.survey_imports import (
    SurveyImportFieldMap,
    SurveyImportFormat,
    SurveyImportMetadata,
    SurveyImportPayload,
    import_survey,
)

from simula_worker.database import CampaignLabClaim, CampaignLabDatabase

logger = structlog.get_logger()


def _import_survey_payload(
    request: Mapping[str, object], secret_payload: Mapping[str, object] | None
) -> Mapping[str, object]:
    """Normalize a raw survey export without returning respondent rows."""

    import_format = request.get("format")
    metadata = request.get("metadata")
    field_map = request.get("field_map", {})
    if import_format not in {"csv", "formbricks", "odk", "generic_json"}:
        raise ValueError("survey import format is unsupported")
    if secret_payload is None or "payload" not in secret_payload:
        raise ValueError("survey import requires a worker-only payload")
    if not isinstance(metadata, Mapping):
        raise ValueError("survey import metadata is missing")
    if not isinstance(field_map, Mapping):
        raise ValueError("survey import field_map is invalid")
    imported = import_survey(
        cast(SurveyImportPayload, secret_payload["payload"]),
        import_format=import_format,
        metadata=SurveyImportMetadata.model_validate(metadata),
        field_map=SurveyImportFieldMap.model_validate(field_map),
    )
    return imported.model_dump(mode="json")


def _evaluate_calibration(
    request: Mapping[str, object], secret_payload: Mapping[str, object] | None
) -> Mapping[str, object]:
    synthetic_raw = request.get("synthetic_observations")
    if not isinstance(synthetic_raw, list):
        raise ValueError("synthetic observations are missing")
    synthetic = tuple(SyntheticVariantObservation.model_validate(item) for item in synthetic_raw)
    survey_import = request.get("survey_import")
    if isinstance(survey_import, Mapping) and "payload" in survey_import:
        raise ValueError("survey import payload must remain worker-only")
    if secret_payload is not None and isinstance(secret_payload.get("survey_import"), Mapping):
        secret_import = cast(Mapping[str, object], secret_payload["survey_import"])
        survey_import = {**cast(Mapping[str, object], survey_import or {}), **secret_import}
    if isinstance(survey_import, Mapping):
        import_format = survey_import.get("format")
        metadata = survey_import.get("metadata")
        import_payload = survey_import.get("payload")
        if import_payload is None or not isinstance(metadata, Mapping):
            raise ValueError("survey import requires a worker-only payload and metadata")
        imported = import_survey(
            cast(SurveyImportPayload, import_payload),
            import_format=cast(SurveyImportFormat, import_format),
            metadata=SurveyImportMetadata.model_validate(metadata),
            field_map=SurveyImportFieldMap.model_validate(survey_import.get("field_map", {})),
        )
        survey = imported.dataset
    else:
        survey = SurveyDataset.model_validate(request.get("survey"))
    calibration = calibrate_synthetic_panel(
        synthetic_observations=synthetic,
        survey=survey,
        calibration_version=str(request.get("calibration_version", "calibration_v1")),
        model_version=str(request.get("model_version", "unspecified")),
    )
    now = datetime.now(UTC)
    current_snapshot = snapshot_from_calibration(calibration, observed_at=now)
    history_snapshots = [current_snapshot]
    history_raw = request.get("calibration_history", [])
    if not isinstance(history_raw, list):
        raise ValueError("calibration history must be a list")
    for item in history_raw:
        if not isinstance(item, Mapping):
            raise ValueError("calibration history entries must be objects")
        history_result = SurveyCalibrationResult.model_validate(item)
        history_snapshots.append(
            snapshot_from_calibration(
                history_result,
                observed_at=datetime(1970, 1, 1, tzinfo=UTC),
            )
        )
    history = build_calibration_version_history(
        history_snapshots,
        current_calibration_version=calibration.calibration_version,
    )
    baseline_raw = request.get("baseline_calibration")
    if baseline_raw is not None:
        if not isinstance(baseline_raw, Mapping):
            raise ValueError("baseline calibration must be an object")
        baseline_result = SurveyCalibrationResult.model_validate(baseline_raw)
        baseline_snapshot = snapshot_from_calibration(
            baseline_result,
            observed_at=datetime(1970, 1, 1, tzinfo=UTC),
        )
        drift = monitor_calibration_drift(
            baseline=baseline_snapshot,
            current=current_snapshot,
        ).model_dump(mode="json")
    else:
        drift = {
            "monitor_type": "calibration_model_drift",
            "threshold_version": "calibration_drift_thresholds_v1",
            "status": "unavailable",
            "drift_detected": False,
            "baseline_calibration_version": None,
            "current_calibration_version": calibration.calibration_version,
            "metrics": [],
            "limitations": [
                "Provide an authorized prior calibration result to run adjacent-version "
                "drift monitoring."
            ],
        }
    return {
        **calibration.model_dump(mode="json"),
        "drift_monitoring": drift,
        "calibration_version_history": history.model_dump(mode="json"),
    }


def _evaluate_survey_import(
    request: Mapping[str, object], secret_payload: Mapping[str, object] | None
) -> Mapping[str, object]:
    return _import_survey_payload(request, secret_payload)


def _evaluate_backtest(
    request: Mapping[str, object], secret_payload: Mapping[str, object] | None
) -> Mapping[str, object]:
    if "outcomes" in request:
        raise ValueError("historical outcomes must remain worker-only")
    if secret_payload is None or not isinstance(secret_payload.get("outcomes"), Mapping):
        raise ValueError("historical outcomes are missing")
    protocol = HistoricalBacktestProtocol.model_validate(request.get("protocol"))
    prediction_set = BlindBacktestPredictionSet.model_validate(request.get("prediction_set"))
    baseline_raw = request.get("baseline_prediction_set")
    baseline = (
        BlindBacktestPredictionSet.model_validate(baseline_raw)
        if baseline_raw is not None
        else None
    )
    outcomes = HistoricalOutcomeDataset.model_validate(secret_payload["outcomes"])
    return evaluate_historical_backtest(
        protocol=protocol,
        prediction_set=prediction_set,
        outcomes=outcomes,
        baseline_prediction_set=baseline,
    ).model_dump(mode="json")


def _evaluate_research(
    request: Mapping[str, object], secret_payload: Mapping[str, object] | None
) -> Mapping[str, object]:
    if secret_payload is None:
        raise ValueError("research document is missing")
    source = CampaignLabResearchSource.model_validate(request.get("source"))
    filename = request.get("filename")
    media_type = request.get("media_type")
    if not isinstance(filename, str) or not isinstance(media_type, str):
        raise ValueError("research document metadata is missing")
    chunk_size_raw = request.get("chunk_size", 1200)
    overlap_raw = request.get("overlap", 120)
    if not isinstance(chunk_size_raw, int) or not isinstance(overlap_raw, int):
        raise ValueError("research chunk sizing is invalid")
    result = ingest_research_document(
        source=source,
        filename=filename,
        media_type=cast(ResearchMediaType, media_type),
        secret_payload=secret_payload,
        chunk_size=chunk_size_raw,
        overlap=overlap_raw,
    )
    return result.model_dump(mode="json")


def _evaluate_interview(request: Mapping[str, object]) -> Mapping[str, object]:
    simulation_request = CampaignLabSimulationRequest.model_validate(
        request.get("simulation_request")
    )
    simulation_result = CampaignLabSimulationResult.model_validate(request.get("simulation_result"))
    diagnostics = simulation_result.behavioral_diagnostics
    if diagnostics is None:
        raise ValueError("simulation has no behavioral interview evidence")
    source_run_id = request.get("source_run_id")
    agent_id = request.get("agent_id")
    variant_key = request.get("variant_key")
    question = request.get("question")
    prompt_version = request.get("prompt_version")
    if not all(
        isinstance(item, str) and item
        for item in (source_run_id, agent_id, variant_key, prompt_version)
    ):
        raise ValueError("interview source identifiers are missing")
    source_run_id_value = cast(str, source_run_id)
    agent_id_value = cast(str, agent_id)
    variant_key_value = cast(str, variant_key)
    prompt_version_value = cast(str, prompt_version)
    variant = next(
        (item for item in diagnostics.variants if item.variant_key == variant_key_value),
        None,
    )
    if variant is None:
        raise ValueError("interview variant is not part of the simulation")
    evidence = next(
        (item for item in variant.interviewable_agents if str(item.agent_id) == agent_id_value),
        None,
    )
    if evidence is None:
        raise ValueError("interview agent evidence is not part of the simulation")
    persona = build_structured_persona(
        simulation_request.cohort,
        sampled_cell_key=evidence.cohort_key,
        sample_index=abs(UUID(agent_id_value).int) % 900_000,
        seed=simulation_request.configuration.random_seed,
    )
    interview = create_synthetic_interview(
        persona,
        variant_key=variant_key_value,
        question=question if isinstance(question, str) else "What happened in this simulation?",
        prompt_version=prompt_version_value,
        interview_id=UUID(source_run_id_value),
        simulation_run_id=UUID(source_run_id_value),
        agent_id=UUID(agent_id_value),
        exposure_history=evidence.exposure_history,
        action_history=evidence.action_history,
        memory_evidence=evidence.memory_entries,
        evidence_event_ids=evidence.evidence_event_ids,
        research_source_ids=tuple(
            source.source_id for source in simulation_request.research_sources
        ),
        research_citation_ids=tuple(
            str(citation.get("citation_id"))
            for graph in simulation_request.research_knowledge
            for citation in graph.get("citations", ())
            if isinstance(citation, Mapping) and isinstance(citation.get("citation_id"), str)
        ),
    )
    return interview.model_dump(mode="json")


def _evaluate_compliance(request: Mapping[str, object]) -> Mapping[str, object]:
    reviewer = request.get("reviewer")
    return build_compliance_review(
        review_id=UUID(str(request.get("review_id"))),
        payload=request.get("payload"),
        reviewer=reviewer if isinstance(reviewer, str) else None,
    ).model_dump(mode="json")


def _evaluate_report(request: Mapping[str, object]) -> Mapping[str, object]:
    lab_request = CampaignLabSimulationRequest.model_validate(request.get("simulation_request"))
    lab_result = CampaignLabSimulationResult.model_validate(request.get("simulation_result"))
    survey_calibration = request.get("survey_calibration")
    historical_backtest = request.get("historical_backtest")
    cultural_evaluation = request.get("cultural_evaluation")
    compliance_review = request.get("compliance_review")
    human_reviewer = request.get("human_reviewer")
    report = build_campaign_lab_report(
        lab_request,
        lab_result,
        survey_calibration=cast(Mapping[str, object], survey_calibration)
        if isinstance(survey_calibration, Mapping)
        else None,
        historical_backtest=cast(Mapping[str, object], historical_backtest)
        if isinstance(historical_backtest, Mapping)
        else None,
        cultural_evaluation=cast(Mapping[str, object], cultural_evaluation)
        if isinstance(cultural_evaluation, Mapping)
        else None,
        compliance_review=cast(Mapping[str, object], compliance_review)
        if isinstance(compliance_review, Mapping)
        else None,
        human_reviewer=human_reviewer if isinstance(human_reviewer, str) else None,
        approval_status=request.get("approval_status", "draft"),  # type: ignore[arg-type]
    )
    return report.model_dump(mode="json")


def evaluate_campaign_lab_claim(claim: CampaignLabClaim) -> Mapping[str, object]:
    if claim.run_type == "repeated_simulation":
        request = CampaignLabSimulationRequest.model_validate(claim.request)
        if request.configuration.provider != "deterministic":
            raise ValueError("unsupported_campaign_lab_provider")
        return run_campaign_lab_simulation(request).model_dump(mode="json")
    if claim.run_type == "survey_calibration":
        return _evaluate_calibration(claim.request, claim.secret_payload)
    if claim.run_type == "survey_import":
        return _evaluate_survey_import(claim.request, claim.secret_payload)
    if claim.run_type == "historical_backtest":
        return _evaluate_backtest(claim.request, claim.secret_payload)
    if claim.run_type == "research_ingestion":
        return _evaluate_research(claim.request, claim.secret_payload)
    if claim.run_type == "interview":
        return _evaluate_interview(claim.request)
    if claim.run_type == "compliance_review":
        return _evaluate_compliance(claim.request)
    if claim.run_type == "report":
        return _evaluate_report(claim.request)
    raise ValueError("unsupported Campaign Lab durable run type")


async def process_campaign_lab_claim(database: CampaignLabDatabase, claim: CampaignLabClaim) -> str:
    if not await database.update_campaign_lab_progress(
        claim.run_id,
        claim.lease_token,
        "validating",
        15,
        "Validating aggregate inputs, provenance, and privacy boundaries.",
    ):
        return (
            "canceled"
            if await database.finalize_canceled_campaign_lab_run(claim.run_id, claim.lease_token)
            else "stale"
        )
    try:
        if not await database.update_campaign_lab_progress(
            claim.run_id,
            claim.lease_token,
            "evaluating",
            55,
            "Running deterministic repeated metrics or evidence comparison.",
        ):
            return (
                "canceled"
                if await database.finalize_canceled_campaign_lab_run(
                    claim.run_id, claim.lease_token
                )
                else "stale"
            )
        result = evaluate_campaign_lab_claim(claim)
        if not await database.update_campaign_lab_progress(
            claim.run_id,
            claim.lease_token,
            "persisting",
            90,
            "Persisting the reproducible result without secret input rows.",
        ):
            return (
                "canceled"
                if await database.finalize_canceled_campaign_lab_run(
                    claim.run_id, claim.lease_token
                )
                else "stale"
            )
        changed = await database.complete_campaign_lab_run(claim.run_id, claim.lease_token, result)
        return "completed" if changed else "stale"
    except (ValidationError, TypeError, ValueError) as campaign_lab_input_error:
        del campaign_lab_input_error
        try:
            return await database.fail_campaign_lab_run(
                claim.run_id,
                claim.lease_token,
                "invalid_campaign_lab_input",
                "Campaign Lab input failed the declared aggregate, provenance, or "
                "evidence contract.",
                False,
            )
        except Exception:
            logger.warning(
                "campaign_lab_failure_persist_failed",
                run_id=str(claim.run_id),
                error_code="invalid_campaign_lab_input",
            )
            return "failure_persist_failed"
    except Exception as error:
        logger.warning(
            "campaign_lab_evaluation_failed",
            run_id=str(claim.run_id),
            error_type=type(error).__name__,
        )
        try:
            return await database.fail_campaign_lab_run(
                claim.run_id,
                claim.lease_token,
                "campaign_lab_worker_error",
                "The Campaign Lab evaluator failed before producing a result.",
                True,
            )
        except Exception:
            logger.warning(
                "campaign_lab_failure_persist_failed",
                run_id=str(claim.run_id),
                error_code="campaign_lab_worker_error",
            )
            return "failure_persist_failed"


async def campaign_lab_loop(
    stop: asyncio.Event,
    database: CampaignLabDatabase,
    *,
    poll_seconds: float = 1.0,
    retention_cleanup_seconds: float = 60.0,
) -> None:
    """Poll the database-backed Campaign Lab queue; leases permit multiple workers."""

    last_retention_cleanup_at = 0.0
    while not stop.is_set():
        now = monotonic()
        if now - last_retention_cleanup_at >= retention_cleanup_seconds:
            try:
                deleted = await database.expire_campaign_lab_runs(50)
                if deleted:
                    logger.info("campaign_lab_retention_deleted", deleted=deleted)
            except Exception as error:
                logger.warning(
                    "campaign_lab_retention_cleanup_failed",
                    error_type=type(error).__name__,
                )
            last_retention_cleanup_at = now
        try:
            claims = await database.claim_campaign_lab_runs(5)
        except Exception as error:
            logger.warning("campaign_lab_claim_failed", error_type=type(error).__name__)
            try:
                await asyncio.wait_for(stop.wait(), timeout=5.0)
            except TimeoutError:
                pass
            continue
        if not claims:
            try:
                await asyncio.wait_for(stop.wait(), timeout=poll_seconds)
            except TimeoutError:
                pass
            continue
        for claim in claims:
            if stop.is_set():
                return
            await process_campaign_lab_claim(database, claim)
