"""Immutable software commitments, with no claim of externally verified blinding."""

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from simula_core.historical_backtesting import (
    BlindBacktestPredictionSet,
    HistoricalBacktestProtocol,
    HistoricalOutcomeDataset,
    evaluate_historical_backtest,
)
from simula_core.survey_binding import evidence_digest

DISCLOSURE = (
    "Scoped historical comparison. The software records predictions before outcome admission; "
    "it cannot establish absence of prior external knowledge or independent scientific validation."
)


def verify_backtest_commitment(payload: Mapping[str, Any]) -> dict[str, Any]:
    protocol = HistoricalBacktestProtocol.model_validate(payload.get("protocol"))
    predictions = BlindBacktestPredictionSet.model_validate(payload.get("prediction_set"))
    binding = payload.get("evidence_binding")
    if not isinstance(binding, dict) or binding.get("version") != "backtest_commitment_v1":
        raise ValueError("backtest commitment binding is missing")
    if (
        evidence_digest(payload.get("protocol")) != binding.get("protocol_sha256")
        or evidence_digest(payload.get("prediction_set")) != binding.get("predictions_sha256")
        or protocol.protocol_id != predictions.protocol_id
        or protocol.protocol_version != predictions.protocol_version
        or protocol.model_version != predictions.model_version
        or protocol.methodology_version != predictions.methodology_version
        or set(protocol.holdout_campaign_ids) != {p.campaign_key for p in predictions.predictions}
    ):
        raise ValueError("backtest commitment inputs do not match")
    return {
        "phase": "preregistered",
        "protocol": protocol.model_dump(mode="json"),
        "prediction_set": predictions.model_dump(mode="json", exclude={"predictions_are_blind"}),
        "evidence_binding": binding,
        "scientific_disclosure": DISCLOSURE,
    }


def evaluate_bound_backtest(
    payload: Mapping[str, Any], secret: Mapping[str, Any] | None
) -> dict[str, Any]:
    if payload.get("phase") == "preregister":
        if secret is not None:
            raise ValueError("predictions must be committed without outcome data")
        return verify_backtest_commitment(payload)
    binding = payload.get("evidence_binding")
    commitment = payload.get("commitment")
    if (
        not isinstance(binding, dict)
        or binding.get("version") != "bound_backtest_v1"
        or not isinstance(commitment, dict)
        or secret is None
    ):
        raise ValueError("bound backtest admission is missing")
    verified = verify_backtest_commitment(commitment)
    if (
        evidence_digest(commitment) != binding.get("commitment_result_sha256")
        or evidence_digest(secret.get("outcomes")) != binding.get("outcomes_sha256")
        or binding.get("custodian_id") in verified["evidence_binding"].get("input_authors", [])
        or binding.get("source_author_id") in verified["evidence_binding"].get("input_authors", [])
        or not binding.get("custodian_id")
        or binding.get("custodian_id") == binding.get("commitment_author_id")
    ):
        raise ValueError("backtest evidence or independent custodian binding is invalid")
    if datetime.fromisoformat(binding["source_registered_at"]) <= datetime.fromisoformat(
        binding["commitment_completed_at"]
    ):
        raise ValueError("historical source registration must follow commitment completion")
    outcomes = HistoricalOutcomeDataset.model_validate(secret.get("outcomes"))
    if outcomes.provenance.checksum_sha256 != binding.get("approved_payload_sha256"):
        raise ValueError("historical outcome source does not match admission")
    result = evaluate_historical_backtest(
        protocol=HistoricalBacktestProtocol.model_validate(verified["protocol"]),
        prediction_set=BlindBacktestPredictionSet.model_validate(verified["prediction_set"]),
        outcomes=outcomes,
    ).model_dump(mode="json")
    result.pop("predictions_were_blind")
    result.pop("outcomes_revealed")
    result.pop("reproducibility_checksum_sha256")
    result.update(
        status="Insufficient evidence"
        if result["status"] == "Insufficient evidence"
        else "Scoped historical comparison",
        analysis_type="scoped_historical_comparison",
        minimum_campaigns=verified["protocol"]["minimum_campaigns"],
        phase="evaluated",
        evidence_binding=binding,
        scientific_disclosure=DISCLOSURE,
    )
    result["reproducibility_checksum_sha256"] = evidence_digest(result)
    return result
