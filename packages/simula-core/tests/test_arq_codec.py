from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import pytest
from simula_core.arq_codec import (
    ARQ_QUEUE_NAME,
    MAX_ARQ_BYTES,
    MAX_ARQ_DEPTH,
    MAX_ARQ_TRIES,
    MAX_STRING_BYTES,
    MAX_UNIX_MILLISECONDS,
    ArqCodecError,
    RunJobV1,
    arq_json_dumps,
    arq_json_loads,
    job_id_for,
)

RUN_ID = UUID("00000000-0000-4000-8000-000000000101")
OTHER_RUN_ID = UUID("00000000-0000-4000-8000-000000000102")


def _job_envelope(*, job_try: int | None = None) -> dict[str, Any]:
    return {
        "a": [{"run_id": str(RUN_ID), "schema_version": 1}],
        "et": 1_700_000_000_000,
        "f": "process_run_v1",
        "k": {},
        "t": job_try,
    }


def _result_envelope() -> dict[str, Any]:
    return {
        **_job_envelope(job_try=1),
        "ft": 1_700_000_000_010,
        "id": job_id_for(RUN_ID, generation=1),
        "q": ARQ_QUEUE_NAME,
        "r": None,
        "s": False,
        "st": 1_700_000_000_000,
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
    assert MAX_ARQ_TRIES == 16


def test_result_envelope_has_one_canonical_encoding_and_round_trips() -> None:
    envelope = _result_envelope()

    encoded = arq_json_dumps(envelope)

    assert encoded == (
        b'{"a":[{"run_id":"00000000-0000-4000-8000-000000000101",'
        b'"schema_version":1}],"et":1700000000000,"f":"process_run_v1",'
        b'"ft":1700000000010,"id":"run:00000000-0000-4000-8000-000000000101:'
        b'dispatch:1","k":{},"q":"simula:runs:v1","r":null,"s":false,'
        b'"st":1700000000000,"t":1}'
    )
    assert arq_json_loads(encoded) == envelope


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
    "envelope",
    [
        {**_job_envelope(), "f": 1},
        {**_job_envelope(), "a": []},
        {**_job_envelope(), "a": [{"run_id": str(RUN_ID), "schema_version": 2}]},
        {
            **_job_envelope(),
            "a": [{"run_id": "00000000-0000-4000-8000-00000000010A", "schema_version": 1}],
        },
        {**_job_envelope(), "k": {"unexpected": True}},
        {**_job_envelope(), "t": True},
        {**_job_envelope(), "t": 0},
        {**_job_envelope(), "t": 17},
        {**_job_envelope(), "et": True},
        {**_job_envelope(), "et": -1},
        {**_job_envelope(), "et": MAX_UNIX_MILLISECONDS + 1},
    ],
)
def test_arq_encoder_rejects_wrong_job_field_types_and_ranges(envelope: dict[str, Any]) -> None:
    with pytest.raises(ArqCodecError):
        arq_json_dumps(envelope)


@pytest.mark.parametrize(
    "envelope",
    [
        {**_result_envelope(), "t": None},
        {**_result_envelope(), "t": True},
        {**_result_envelope(), "s": 1},
        {**_result_envelope(), "r": "serialized result"},
        {**_result_envelope(), "st": True},
        {**_result_envelope(), "ft": 1_699_999_999_999},
        {**_result_envelope(), "q": "other-queue"},
        {**_result_envelope(), "id": job_id_for(OTHER_RUN_ID, generation=1)},
    ],
)
def test_arq_encoder_rejects_wrong_result_field_types_and_bindings(
    envelope: dict[str, Any],
) -> None:
    with pytest.raises(ArqCodecError):
        arq_json_dumps(envelope)


def test_arq_codec_enforces_utf8_string_and_transport_size_boundaries() -> None:
    exact_string_limit = "\U0001f600" * (MAX_STRING_BYTES // len("\U0001f600".encode("utf-8")))
    at_string_limit = {**_job_envelope(), "k": {"only_for_shape_validation": exact_string_limit}}
    above_string_limit = {
        **_job_envelope(),
        "k": {"only_for_shape_validation": f"{exact_string_limit}\U0001f600"},
    }

    with pytest.raises(ArqCodecError, match="keyword arguments must be empty"):
        arq_json_dumps(at_string_limit)
    with pytest.raises(ArqCodecError, match="JSON string exceeds maximum size"):
        arq_json_dumps(above_string_limit)

    canonical_payload = arq_json_dumps(_job_envelope())
    payload_at_limit = canonical_payload + b" " * (MAX_ARQ_BYTES - len(canonical_payload))
    payload_above_limit = payload_at_limit + b" "

    with pytest.raises(ArqCodecError, match="canonically encoded"):
        arq_json_loads(payload_at_limit)
    with pytest.raises(ArqCodecError, match="ARQ envelope exceeds maximum size"):
        arq_json_loads(payload_above_limit)
    with pytest.raises(ArqCodecError, match="strict UTF-8 JSON"):
        arq_json_loads(b"\xff")


def test_arq_codec_enforces_json_depth_boundary_before_schema_validation() -> None:
    value_at_limit: list[object] = []
    for _ in range(MAX_ARQ_DEPTH - 2):
        value_at_limit = [value_at_limit]

    value_above_limit = [value_at_limit]
    at_depth_limit = {**_job_envelope(), "k": {"only_for_shape_validation": value_at_limit}}
    above_depth_limit = {**_job_envelope(), "k": {"only_for_shape_validation": value_above_limit}}

    with pytest.raises(ArqCodecError, match="keyword arguments must be empty"):
        arq_json_dumps(at_depth_limit)
    with pytest.raises(ArqCodecError, match="JSON exceeds maximum depth"):
        arq_json_dumps(above_depth_limit)


@pytest.mark.parametrize("constant", [b"NaN", b"Infinity", b"-Infinity"])
def test_arq_decoder_rejects_non_finite_json_numbers(constant: bytes) -> None:
    payload = arq_json_dumps(_job_envelope()).replace(b'"et":1700000000000', b'"et":' + constant)

    with pytest.raises(ArqCodecError, match="non-finite JSON number is forbidden"):
        arq_json_loads(payload)


def test_arq_failure_result_fallback_rejects_empty_function_without_stopping_poll_loop() -> None:
    from arq.jobs import serialize_result

    calls: list[dict[str, Any]] = []

    def strict_serializer(value: dict[str, Any]) -> bytes:
        calls.append(dict(value))
        return arq_json_dumps(value)

    result_data = serialize_result(
        function="",
        args=(),
        kwargs={},
        job_try=1,
        enqueue_time_ms=0,
        success=False,
        result=RuntimeError("decoder failure"),
        start_ms=1,
        finished_ms=2,
        ref="run failure",
        queue_name=ARQ_QUEUE_NAME,
        job_id=job_id_for(RUN_ID, generation=1),
        serializer=strict_serializer,
    )

    assert result_data is None
    assert len(calls) == 2
    assert [call["f"] for call in calls] == ["", ""]
    assert isinstance(calls[0]["r"], RuntimeError)
    assert calls[1]["r"] == "unable to serialize result"


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
