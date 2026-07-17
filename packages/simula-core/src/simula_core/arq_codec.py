"""Strict, non-executable ARQ v0.28 wire codec for SIMULA run jobs."""

from __future__ import annotations

import json
import re
from collections.abc import Iterable, Mapping
from typing import Any, Literal, Never
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

ARQ_QUEUE_NAME = "simula:runs:v1"
MAX_ARQ_BYTES = 16 * 1024
MAX_ARQ_DEPTH = 8
MAX_CONTAINER_ENTRIES = 64
MAX_STRING_BYTES = 4 * 1024
MAX_UNIX_MILLISECONDS = 4_102_444_800_000
_JOB_KEYS = frozenset({"t", "f", "a", "k", "et"})
_RESULT_KEYS = frozenset({"t", "f", "a", "k", "et", "s", "r", "st", "ft", "q", "id"})
_JOB_ID = re.compile(
    r"^run:(?P<run_id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):dispatch:(?P<generation>[1-3])$"
)


class ArqCodecError(ValueError):
    """An ARQ transport payload is malformed, oversized, or noncanonical."""


class RunJobV1(BaseModel):
    """The sole JSON-safe argument accepted by ``process_run_v1``."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1]
    run_id: UUID

    @field_validator("run_id", mode="before")
    @classmethod
    def canonical_run_id(cls, value: object) -> object:
        if not isinstance(value, str):
            raise ValueError("run_id must be a canonical UUID string")
        try:
            parsed = UUID(value)
        except ValueError as error:
            raise ValueError("run_id must be a canonical UUID string") from error
        if str(parsed) != value:
            raise ValueError("run_id must be a canonical lowercase UUID string")
        return value


def job_id_for(run_id: UUID, *, generation: int) -> str:
    """Return the unique and stable ARQ identifier for one dispatch generation."""

    if isinstance(generation, bool) or generation not in {1, 2, 3}:
        raise ArqCodecError("generation must be an integer from 1 through 3")
    return f"run:{run_id}:dispatch:{generation}"


def parse_job_id(value: object) -> tuple[UUID, int]:
    """Validate a canonical job identifier and return its immutable binding."""

    if not isinstance(value, str):
        raise ArqCodecError("job id must be a string")
    match = _JOB_ID.fullmatch(value)
    if match is None:
        raise ArqCodecError("job id has an invalid format")
    run_id = UUID(match.group("run_id"))
    generation = int(match.group("generation"))
    if job_id_for(run_id, generation=generation) != value:
        raise ArqCodecError("job id is not canonical")
    return run_id, generation


def _reject_constant(value: str) -> Never:
    raise ArqCodecError(f"non-finite JSON number is forbidden: {value}")


def _unique_object(pairs: Iterable[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ArqCodecError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _require_int(value: object, *, name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ArqCodecError(f"{name} must be an integer from {minimum} through {maximum}")
    return value


def _require_keys(value: Mapping[str, object], expected: frozenset[str], *, name: str) -> None:
    if frozenset(value) != expected:
        raise ArqCodecError(f"{name} keys must be exactly {sorted(expected)}")


def _validate_shape(value: object, *, depth: int = 0) -> None:
    if depth > MAX_ARQ_DEPTH:
        raise ArqCodecError(f"JSON exceeds maximum depth {MAX_ARQ_DEPTH}")
    if isinstance(value, str):
        if len(value.encode("utf-8")) > MAX_STRING_BYTES:
            raise ArqCodecError(f"JSON string exceeds maximum size {MAX_STRING_BYTES}")
        return
    if value is None or isinstance(value, (bool, int)):
        return
    if isinstance(value, (float, bytes, bytearray)):
        raise ArqCodecError("ARQ envelope contains a non-JSON value")
    if isinstance(value, Mapping):
        if len(value) > MAX_CONTAINER_ENTRIES:
            raise ArqCodecError(f"JSON object exceeds maximum entries {MAX_CONTAINER_ENTRIES}")
        for key, child in value.items():
            if not isinstance(key, str):
                raise ArqCodecError("JSON object keys must be strings")
            _validate_shape(key, depth=depth + 1)
            _validate_shape(child, depth=depth + 1)
        return
    if isinstance(value, list):
        if len(value) > MAX_CONTAINER_ENTRIES:
            raise ArqCodecError(f"JSON array exceeds maximum entries {MAX_CONTAINER_ENTRIES}")
        for child in value:
            _validate_shape(child, depth=depth + 1)
        return
    raise ArqCodecError("ARQ envelope contains a non-JSON value")


def _normalized_arguments(value: object) -> list[object]:
    if isinstance(value, tuple):
        value = list(value)
    if not isinstance(value, list) or len(value) != 1:
        raise ArqCodecError("ARQ arguments must contain exactly one run job")
    return value


def _validated_run_job(value: object) -> dict[str, object]:
    if not isinstance(value, Mapping):
        raise ArqCodecError("ARQ run job must be an object")
    try:
        job = RunJobV1.model_validate(value)
    except ValueError as error:
        raise ArqCodecError("ARQ run job is invalid") from error
    return {"run_id": str(job.run_id), "schema_version": job.schema_version}


def _validate_job_envelope(value: Mapping[str, object]) -> dict[str, object]:
    _require_keys(value, _JOB_KEYS, name="job envelope")
    arguments = _normalized_arguments(value["a"])
    if not isinstance(value["f"], str) or value["f"] != "process_run_v1":
        raise ArqCodecError("ARQ function must be process_run_v1")
    if not isinstance(value["k"], Mapping) or dict(value["k"]):
        raise ArqCodecError("ARQ keyword arguments must be empty")
    job_try = value["t"]
    if job_try is not None:
        _require_int(job_try, name="ARQ job try", minimum=1, maximum=16)
    return {
        "a": [_validated_run_job(arguments[0])],
        "et": _require_int(
            value["et"], name="ARQ enqueue time", minimum=0, maximum=MAX_UNIX_MILLISECONDS
        ),
        "f": "process_run_v1",
        "k": {},
        "t": job_try,
    }


def _validate_result_envelope(value: Mapping[str, object]) -> dict[str, object]:
    _require_keys(value, _RESULT_KEYS, name="result envelope")
    job = _validate_job_envelope({key: value[key] for key in _JOB_KEYS})
    _require_int(value["t"], name="ARQ result job try", minimum=1, maximum=16)
    run_job = job["a"]
    if not isinstance(run_job, list):  # pragma: no cover - validated by _validate_job_envelope.
        raise ArqCodecError("ARQ run job must be an array")
    run_id = UUID(str(cast_mapping(run_job[0])["run_id"]))
    if not isinstance(value["s"], bool):
        raise ArqCodecError("ARQ result success must be boolean")
    if value["r"] not in {None, "unable to serialize result"}:
        raise ArqCodecError("ARQ result must be null or the ARQ failure sentinel")
    start = _require_int(
        value["st"], name="ARQ result start", minimum=0, maximum=MAX_UNIX_MILLISECONDS
    )
    finished = _require_int(
        value["ft"], name="ARQ result finish", minimum=start, maximum=MAX_UNIX_MILLISECONDS
    )
    if value["q"] != ARQ_QUEUE_NAME:
        raise ArqCodecError("ARQ result queue is invalid")
    result_run_id, generation = parse_job_id(value["id"])
    if result_run_id != run_id:
        raise ArqCodecError("ARQ result job id does not bind to its run payload")
    return {
        **job,
        "s": value["s"],
        "r": value["r"],
        "st": start,
        "ft": finished,
        "q": ARQ_QUEUE_NAME,
        "id": job_id_for(result_run_id, generation=generation),
    }


def cast_mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise ArqCodecError("ARQ run job must be an object")
    return value


def _normalize_envelope(value: object) -> dict[str, object]:
    if not isinstance(value, Mapping):
        raise ArqCodecError("ARQ envelope must be an object")
    object_value = dict(value)
    keys = frozenset(object_value)
    if keys in {_JOB_KEYS, _RESULT_KEYS} and isinstance(object_value.get("a"), tuple):
        object_value["a"] = list(object_value["a"])
    _validate_shape(object_value)
    if keys == _JOB_KEYS:
        return _validate_job_envelope(object_value)
    if keys == _RESULT_KEYS:
        return _validate_result_envelope(object_value)
    raise ArqCodecError("ARQ envelope has an unsupported schema")


def arq_json_dumps(value: object) -> bytes:
    """Serialize only the exact canonical ARQ job/result envelopes."""

    normalized = _normalize_envelope(value)
    try:
        payload = json.dumps(
            normalized,
            allow_nan=False,
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (TypeError, ValueError) as error:  # pragma: no cover - shape validation guards this.
        raise ArqCodecError("ARQ envelope is not JSON serializable") from error
    if len(payload) > MAX_ARQ_BYTES:
        raise ArqCodecError(f"ARQ envelope exceeds maximum size {MAX_ARQ_BYTES}")
    return payload


def arq_json_loads(payload: bytes) -> dict[str, object]:
    """Decode only exact canonical UTF-8 envelopes; never invoke pickle."""

    if not isinstance(payload, bytes):
        raise ArqCodecError("ARQ payload must be bytes")
    if len(payload) > MAX_ARQ_BYTES:
        raise ArqCodecError(f"ARQ envelope exceeds maximum size {MAX_ARQ_BYTES}")
    try:
        decoded = json.loads(
            payload.decode("utf-8", errors="strict"),
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ArqCodecError("ARQ payload is not strict UTF-8 JSON") from error
    normalized = _normalize_envelope(decoded)
    if arq_json_dumps(normalized) != payload:
        raise ArqCodecError("ARQ payload is not canonically encoded")
    return normalized
