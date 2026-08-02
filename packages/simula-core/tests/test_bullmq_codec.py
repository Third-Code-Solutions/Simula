from __future__ import annotations

import pytest
from pydantic import ValidationError
from simula_core.bullmq_codec import (
    BULLMQ_JOB_NAME,
    BULLMQ_QUEUE_NAME,
    BullMqBindingError,
    BullMqRunJobV2,
    bind_bullmq_delivery,
)

RUN_ID = "018f274b-3c77-7b22-b749-c9274230ef9a"
JOB_ID = f"run-{RUN_ID}-generation-2"
PAYLOAD = {
    "schema_version": 2,
    "run_id": RUN_ID,
    "dispatch_generation": 2,
}


def test_bullmq_v2_contract_byte_matches_the_typescript_payload() -> None:
    job = BullMqRunJobV2.model_validate(PAYLOAD)

    assert job.job_id == JOB_ID
    assert job.canonical_json() == (
        b'{"dispatch_generation":2,"run_id":"018f274b-3c77-7b22-b749-c9274230ef9a",'
        b'"schema_version":2}'
    )
    assert str(job.run_uuid) == RUN_ID


def test_bullmq_delivery_requires_all_four_exact_bindings() -> None:
    assert (
        bind_bullmq_delivery(
            queue_name=BULLMQ_QUEUE_NAME,
            job_name=BULLMQ_JOB_NAME,
            job_id=JOB_ID,
            data=PAYLOAD,
        ).model_dump()
        == PAYLOAD
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("schema_version", 1),
        ("schema_version", True),
        ("run_id", RUN_ID.upper()),
        ("run_id", "00000000-0000-0000-0000-000000000000"),
        ("dispatch_generation", 0),
        ("dispatch_generation", 4),
        ("dispatch_generation", True),
    ],
)
def test_bullmq_payload_fails_closed_on_type_or_range_drift(
    field: str,
    value: object,
) -> None:
    with pytest.raises(ValidationError):
        BullMqRunJobV2.model_validate({**PAYLOAD, field: value})


def test_bullmq_payload_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        BullMqRunJobV2.model_validate({**PAYLOAD, "stimulus": "confidential"})


@pytest.mark.parametrize(
    ("queue_name", "job_name", "job_id", "data"),
    [
        ("wrong", BULLMQ_JOB_NAME, JOB_ID, PAYLOAD),
        (BULLMQ_QUEUE_NAME, "wrong", JOB_ID, PAYLOAD),
        (BULLMQ_QUEUE_NAME, BULLMQ_JOB_NAME, JOB_ID.upper(), PAYLOAD),
        (
            BULLMQ_QUEUE_NAME,
            BULLMQ_JOB_NAME,
            f"run-{RUN_ID}-generation-3",
            PAYLOAD,
        ),
    ],
)
def test_bullmq_delivery_rejects_wrong_or_mismatched_bindings(
    queue_name: object,
    job_name: object,
    job_id: object,
    data: object,
) -> None:
    with pytest.raises(BullMqBindingError):
        bind_bullmq_delivery(
            queue_name=queue_name,
            job_name=job_name,
            job_id=job_id,
            data=data,
        )
