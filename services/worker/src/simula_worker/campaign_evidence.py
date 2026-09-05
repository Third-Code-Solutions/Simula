"""Durable survey-calibration and historical-backtest worker execution.

The public request contains aggregate synthetic observations and a frozen blind
prediction set. Held-out outcomes are accepted only in the worker-only secret
payload and are never written to logs or returned by the API read path.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Mapping
from typing import cast

import structlog
from pydantic import ValidationError
from simula_core.historical_backtesting import (
    BlindBacktestPredictionSet,
    HistoricalBacktestProtocol,
    HistoricalOutcomeDataset,
    evaluate_historical_backtest,
)
from simula_core.isolated_evaluation import evaluate_isolated
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

from simula_worker.database import CampaignEvidenceClaim, CampaignEvidenceDatabase

logger = structlog.get_logger()
_CAMPAIGN_EVIDENCE_HEARTBEAT_SECONDS = 30.0


def _evaluate_survey(
    request: Mapping[str, object], secret_payload: Mapping[str, object] | None
) -> Mapping[str, object]:
    synthetic_raw = request.get("synthetic_observations")
    if not isinstance(synthetic_raw, list):
        raise ValueError("synthetic_observations must be an array")
    synthetic = tuple(SyntheticVariantObservation.model_validate(item) for item in synthetic_raw)
    survey_import = request.get("survey_import")
    if isinstance(survey_import, Mapping) and "payload" in survey_import:
        raise ValueError("survey import payload must remain worker-only")
    if secret_payload is not None:
        secret_import = secret_payload.get("survey_import")
        if isinstance(secret_import, Mapping):
            if survey_import is None:
                survey_import = secret_import
            elif isinstance(survey_import, Mapping):
                survey_import = {**survey_import, **secret_import}
    if survey_import is not None:
        if not isinstance(survey_import, Mapping):
            raise ValueError("survey_import must be an object")
        import_format = survey_import.get("format")
        if import_format not in {"csv", "formbricks", "odk", "generic_json"}:
            raise ValueError("survey_import format is unsupported")
        if "payload" not in survey_import or "metadata" not in survey_import:
            raise ValueError("survey_import requires payload and metadata")
        import_result = import_survey(
            cast(SurveyImportPayload, survey_import["payload"]),
            import_format=cast(SurveyImportFormat, import_format),
            metadata=SurveyImportMetadata.model_validate(survey_import["metadata"]),
            field_map=SurveyImportFieldMap.model_validate(survey_import.get("field_map", {})),
        )
        survey = import_result.dataset
    else:
        survey = SurveyDataset.model_validate(request.get("survey"))
    return calibrate_synthetic_panel(
        synthetic_observations=synthetic,
        survey=survey,
    ).model_dump(mode="json")


def _evaluate_backtest(
    request: Mapping[str, object], secret_payload: Mapping[str, object] | None
) -> Mapping[str, object]:
    if "outcomes" in request:
        raise ValueError("historical outcomes must remain worker-only")
    if secret_payload is None:
        raise ValueError("historical outcomes are missing")
    protocol = HistoricalBacktestProtocol.model_validate(request.get("protocol"))
    prediction_set = BlindBacktestPredictionSet.model_validate(request.get("prediction_set"))
    baseline_raw = request.get("baseline_prediction_set")
    baseline = (
        BlindBacktestPredictionSet.model_validate(baseline_raw)
        if baseline_raw is not None
        else None
    )
    outcomes = HistoricalOutcomeDataset.model_validate(secret_payload.get("outcomes"))
    return evaluate_historical_backtest(
        protocol=protocol,
        prediction_set=prediction_set,
        outcomes=outcomes,
        baseline_prediction_set=baseline,
    ).model_dump(mode="json")


def evaluate_campaign_evidence_claim(
    claim: CampaignEvidenceClaim,
) -> Mapping[str, object]:
    """Evaluate one claim without side effects or network calls."""

    if os.getenv("SIMULA_ENVIRONMENT", "local").strip().lower() == "production":
        raise ValueError("production campaign evidence lacks an exact immutable registry binding")
    if claim.kind == "survey_calibration":
        return _evaluate_survey(claim.request, claim.secret_payload)
    if claim.kind == "historical_backtest":
        return _evaluate_backtest(claim.request, claim.secret_payload)
    raise ValueError("unsupported evidence kind")


async def _evaluate_with_lease_heartbeat(
    database: CampaignEvidenceDatabase,
    claim: CampaignEvidenceClaim,
    *,
    heartbeat_seconds: float,
) -> tuple[Mapping[str, object], bool]:
    if heartbeat_seconds <= 0:
        raise ValueError("Campaign evidence heartbeat interval must be positive")
    stop_heartbeat = asyncio.Event()
    lease_current = True

    async def heartbeat() -> None:
        nonlocal lease_current
        while not stop_heartbeat.is_set():
            try:
                await asyncio.wait_for(stop_heartbeat.wait(), timeout=heartbeat_seconds)
                return
            except TimeoutError:
                pass
            try:
                async with asyncio.timeout(10.0):
                    lease_current = await database.update_campaign_evidence_progress(
                        claim.evidence_id,
                        claim.lease_token,
                        "evaluating",
                        55,
                        "Computing deterministic evidence metrics.",
                    )
            except Exception as error:
                lease_current = False
                logger.warning(
                    "campaign_evidence_heartbeat_failed",
                    evidence_id=str(claim.evidence_id),
                    error_type=type(error).__name__,
                )
            if not lease_current:
                return

    heartbeat_task = asyncio.create_task(heartbeat())
    evaluation_task = asyncio.create_task(
        evaluate_isolated(evaluate_campaign_evidence_claim, claim, timeout_seconds=600.0)
    )
    try:
        done, _ = await asyncio.wait(
            {evaluation_task, heartbeat_task}, return_when=asyncio.FIRST_COMPLETED
        )
        if heartbeat_task in done and not lease_current:
            evaluation_task.cancel()
            await asyncio.gather(evaluation_task, return_exceptions=True)
            return {}, False
        return await evaluation_task, lease_current
    finally:
        if not evaluation_task.done():
            evaluation_task.cancel()
        stop_heartbeat.set()
        heartbeat_task.cancel()
        await asyncio.gather(evaluation_task, heartbeat_task, return_exceptions=True)


async def process_campaign_evidence_claim(
    database: CampaignEvidenceDatabase,
    claim: CampaignEvidenceClaim,
    *,
    heartbeat_seconds: float = _CAMPAIGN_EVIDENCE_HEARTBEAT_SECONDS,
) -> str:
    """Run a leased evidence job and persist a bounded terminal disposition."""

    try:
        if not await database.update_campaign_evidence_progress(
            claim.evidence_id,
            claim.lease_token,
            "validating",
            15,
            "Validating provenance, aggregate inputs, and the blind boundary.",
        ):
            return (
                "canceled"
                if await database.finalize_canceled_campaign_evidence_run(
                    claim.evidence_id, claim.lease_token
                )
                else "stale"
            )
        if not await database.update_campaign_evidence_progress(
            claim.evidence_id,
            claim.lease_token,
            "evaluating",
            55,
            "Computing deterministic evidence metrics.",
        ):
            return (
                "canceled"
                if await database.finalize_canceled_campaign_evidence_run(
                    claim.evidence_id, claim.lease_token
                )
                else "stale"
            )
        result, lease_current = await _evaluate_with_lease_heartbeat(
            database,
            claim,
            heartbeat_seconds=heartbeat_seconds,
        )
        if not lease_current:
            return (
                "canceled"
                if await database.finalize_canceled_campaign_evidence_run(
                    claim.evidence_id, claim.lease_token
                )
                else "stale"
            )
        if not await database.update_campaign_evidence_progress(
            claim.evidence_id,
            claim.lease_token,
            "persisting",
            90,
            "Persisting the reproducible evidence report.",
        ):
            return (
                "canceled"
                if await database.finalize_canceled_campaign_evidence_run(
                    claim.evidence_id, claim.lease_token
                )
                else "stale"
            )
        changed = await database.complete_campaign_evidence_run(
            claim.evidence_id, claim.lease_token, result
        )
        return "completed" if changed else "stale"
    except ValidationError, TypeError, ValueError:
        # Do not serialize Pydantic input values into logs or error details.
        try:
            return await database.fail_campaign_evidence_run(
                claim.evidence_id,
                claim.lease_token,
                "invalid_evidence_input",
                "Evidence input failed the declared provenance or metric contract.",
                False,
            )
        except Exception:
            logger.warning(
                "campaign_evidence_failure_persist_failed",
                evidence_id=str(claim.evidence_id),
                error_code="invalid_evidence_input",
            )
            return "failure_persist_failed"
    except Exception as error:
        logger.warning(
            "campaign_evidence_evaluation_failed",
            evidence_id=str(claim.evidence_id),
            error_type=type(error).__name__,
        )
        try:
            return await database.fail_campaign_evidence_run(
                claim.evidence_id,
                claim.lease_token,
                "evidence_timeout" if isinstance(error, TimeoutError) else "evidence_worker_error",
                "The evidence evaluator failed before producing a report.",
                not isinstance(error, TimeoutError),
            )
        except Exception:
            logger.warning(
                "campaign_evidence_failure_persist_failed",
                evidence_id=str(claim.evidence_id),
                error_code="evidence_worker_error",
            )
            return "failure_persist_failed"


async def campaign_evidence_loop(
    stop: asyncio.Event,
    database: CampaignEvidenceDatabase,
    *,
    poll_seconds: float = 1.0,
) -> None:
    """Poll the database-backed queue; leases make multiple workers safe."""

    while not stop.is_set():
        try:
            await database.expire_campaign_evidence_runs(50)
            claims = await database.claim_campaign_evidence_runs(1)
        except Exception as error:
            logger.warning(
                "campaign_evidence_claim_failed",
                error_type=type(error).__name__,
            )
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
            await process_campaign_evidence_claim(database, claim)
