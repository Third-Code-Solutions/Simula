"""Durable Campaign Simulation Lab evaluator.

The worker is the only component allowed to open secret survey/outcome
envelopes. It evaluates deterministic aggregate requests and persists bounded
results through lease-bound database functions.
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from typing import cast

import structlog
from pydantic import ValidationError
from simula_core.campaign_lab import CampaignLabSimulationRequest, run_campaign_lab_simulation
from simula_core.historical_backtesting import (
    BlindBacktestPredictionSet,
    HistoricalBacktestProtocol,
    HistoricalOutcomeDataset,
    evaluate_historical_backtest,
)
from simula_core.survey_calibration import (
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
        if import_format not in {"csv", "formbricks", "odk", "generic_json"}:
            raise ValueError("survey import format is unsupported")
        metadata = survey_import.get("metadata")
        if "payload" not in survey_import or not isinstance(metadata, Mapping):
            raise ValueError("survey import requires a worker-only payload and metadata")
        imported = import_survey(
            cast(SurveyImportPayload, survey_import["payload"]),
            import_format=cast(SurveyImportFormat, import_format),
            metadata=SurveyImportMetadata.model_validate(metadata),
            field_map=SurveyImportFieldMap.model_validate(survey_import.get("field_map", {})),
        )
        survey = imported.dataset
    else:
        survey = SurveyDataset.model_validate(request.get("survey"))
    return calibrate_synthetic_panel(synthetic_observations=synthetic, survey=survey).model_dump(
        mode="json"
    )


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


def evaluate_campaign_lab_claim(claim: CampaignLabClaim) -> Mapping[str, object]:
    if claim.run_type == "repeated_simulation":
        request = CampaignLabSimulationRequest.model_validate(claim.request)
        if request.configuration.provider != "deterministic":
            raise ValueError("unsupported_campaign_lab_provider")
        return run_campaign_lab_simulation(request).model_dump(mode="json")
    if claim.run_type == "survey_calibration":
        return _evaluate_calibration(claim.request, claim.secret_payload)
    if claim.run_type == "historical_backtest":
        return _evaluate_backtest(claim.request, claim.secret_payload)
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
    except ValidationError, TypeError, ValueError:
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
    stop: asyncio.Event, database: CampaignLabDatabase, *, poll_seconds: float = 1.0
) -> None:
    """Poll the database-backed Campaign Lab queue; leases permit multiple workers."""

    while not stop.is_set():
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
