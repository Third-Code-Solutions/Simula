"""Strict cross-language BullMQ binding for the NestJS-to-Python handoff."""

from __future__ import annotations

import json
import re
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

BULLMQ_QUEUE_NAME = "simula-behavioral-runs-v2"
BULLMQ_JOB_NAME = "execute-behavioral-run-v2"
BULLMQ_SCHEMA_VERSION = 2
MAX_BULLMQ_PAYLOAD_BYTES = 256
_CANONICAL_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
_JOB_ID = re.compile(
    r"^run-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-"
    r"[0-9a-f]{12})-generation-([1-3])$"
)


class BullMqBindingError(ValueError):
    """The untrusted queue binding does not match the frozen v2 contract."""


class BullMqRunJobV2(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    schema_version: Literal[2]
    run_id: str
    dispatch_generation: int = Field(ge=1, le=3)

    @field_validator("run_id")
    @classmethod
    def canonical_run_id(cls, value: str) -> str:
        if _CANONICAL_UUID.fullmatch(value) is None:
            raise ValueError("run_id must be a canonical supported UUID")
        return value

    def canonical_json(self) -> bytes:
        encoded = json.dumps(
            self.model_dump(mode="json"),
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        if len(encoded) > MAX_BULLMQ_PAYLOAD_BYTES:
            raise BullMqBindingError("BullMQ payload exceeds its byte budget")
        return encoded

    @property
    def job_id(self) -> str:
        return f"run-{self.run_id}-generation-{self.dispatch_generation}"

    @property
    def run_uuid(self) -> UUID:
        return UUID(self.run_id)


def bind_bullmq_delivery(
    *,
    queue_name: object,
    job_name: object,
    job_id: object,
    data: object,
) -> BullMqRunJobV2:
    if queue_name != BULLMQ_QUEUE_NAME or job_name != BULLMQ_JOB_NAME:
        raise BullMqBindingError("BullMQ queue or job name is not admitted")
    if not isinstance(job_id, str):
        raise BullMqBindingError("BullMQ job identity is missing")
    match = _JOB_ID.fullmatch(job_id)
    if match is None:
        raise BullMqBindingError("BullMQ job identity is malformed")
    try:
        job = BullMqRunJobV2.model_validate(data)
    except Exception as error:
        raise BullMqBindingError("BullMQ job payload is malformed") from error
    job.canonical_json()
    if job.run_id != match.group(1) or job.dispatch_generation != int(match.group(2)):
        raise BullMqBindingError("BullMQ job identity and payload do not match")
    return job
