from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import pytest
from simula_core.arq_codec import (
    ARQ_QUEUE_NAME,
    ArqCodecError,
    RunJobV1,
    arq_json_dumps,
    arq_json_loads,
    job_id_for,
)

RUN_ID = UUID("00000000-0000-4000-8000-000000000101")


def _job_envelope(*, job_try: int | None = None) -> dict[str, Any]:
    return {
        "a": [{"run_id": str(RUN_ID), "schema_version": 1}],
        "et": 1_700_000_000_000,
        "f": "process_run_v1",
        "k": {},
        "t": job_try,
    }


def test_run_job_v1_and_arq_envelope_have_one_canonical_encoding() -> None:
    envelope = _job_envelope()

    encoded = arq_json_dumps(envelope)

    assert encoded == (
        b'{"a":[{"run_id":"00000000-0000-4000-8000-000000000101",'
        b'"schema_version":1}],"et":1700000000000,"f":"process_run_v1",'
        b'"k":{},"t":null}'
    )
    assert arq_json_loads(encoded) == envelope
    assert RunJobV1.model_validate(envelope["a"][0]).run_id == RUN_ID
    assert job_id_for(RUN_ID, generation=1) == "run:00000000-0000-4000-8000-000000000101:dispatch:1"
    assert ARQ_QUEUE_NAME == "simula:runs:v1"


def test_arq_serializer_normalizes_only_the_runtime_argument_tuple() -> None:
    envelope = _job_envelope()
    envelope["a"] = tuple(envelope["a"])

    encoded = arq_json_dumps(envelope)

    assert arq_json_loads(encoded) == _job_envelope()


def test_arq_codec_rejects_boolean_schema_version_instead_of_normalizing_it() -> None:
    envelope = _job_envelope()
    envelope["a"] = [{"run_id": str(RUN_ID), "schema_version": True}]

    with pytest.raises(ArqCodecError):
        arq_json_dumps(envelope)


def test_arq_codec_rejects_unhashable_wrong_result_payload_with_its_safe_error() -> None:
    envelope = {
        **_job_envelope(job_try=1),
        "ft": 1_700_000_000_010,
        "id": job_id_for(RUN_ID, generation=1),
        "q": ARQ_QUEUE_NAME,
        "r": [],
        "s": False,
        "st": 1_700_000_000_000,
    }

    with pytest.raises(ArqCodecError):
        arq_json_dumps(envelope)


@pytest.mark.parametrize(
    "payload",
    [
        b"cos\nsystem\n(S'never execute'\ntR.",
        b'{"f":"process_run_v1","a":[{"run_id":"00000000-0000-4000-8000-000000000101","schema_version":1}],"k":{},"et":1700000000000,"t":null}',
        json.dumps({**_job_envelope(), "extra": True}, separators=(",", ":")).encode(),
        b'{"a":[{"run_id":"00000000-0000-4000-8000-000000000101","schema_version":1}],"et":1700000000000,"f":"process_run_v1","k":{},"t":null,"t":null}',
    ],
)
def test_arq_decoder_rejects_pickle_noncanonical_extra_and_duplicate_inputs(payload: bytes) -> None:
    with pytest.raises(ArqCodecError):
        arq_json_loads(payload)
