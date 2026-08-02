"""Strict private HTTP adapter for the governed behavioral engine."""

from __future__ import annotations

from datetime import datetime
from hashlib import sha256
from typing import Literal, Self
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError, model_validator
from simula_core.behavioral_engine import (
    MAX_BEHAVIORAL_RESULT_BYTES,
    BehavioralRunCommand,
    BehavioralRunResult,
    build_agent_fleet,
)
from simula_core.json_codec import canonical_json_dumps, canonical_json_dumps_bounded
from simula_core.methodology import sample_population

EXECUTION_PATH = "/internal/v1/behavioral-runs:execute"
MAX_COMMAND_BYTES = 2_000_000
MAX_RESULT_BYTES = MAX_BEHAVIORAL_RESULT_BYTES


class BehavioralExecutionReceipt(BaseModel):
    """Lease-attempt receipt bound to the exact canonical result bytes."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    schema_version: Literal[1] = 1
    receipt_kind: Literal["behavioral_success"] = "behavioral_success"
    request_id: UUID
    attempt_id: UUID
    run_id: UUID
    started_at: datetime
    ended_at: datetime
    artifact_sha256: str

    @model_validator(mode="after")
    def execution_window_is_bounded(self) -> Self:
        if (
            self.request_id != self.attempt_id
            or self.started_at.tzinfo is None
            or self.ended_at.tzinfo is None
            or self.ended_at < self.started_at
            or (self.ended_at - self.started_at).total_seconds() > 300
            or len(self.artifact_sha256) != 64
            or any(character not in "0123456789abcdef" for character in self.artifact_sha256)
        ):
            raise ValueError("behavioral execution receipt is invalid")
        return self


def serialize_behavioral_result(
    result: BehavioralRunResult,
    *,
    attempt_id: UUID,
    started_at: datetime,
    ended_at: datetime,
) -> tuple[bytes, BehavioralExecutionReceipt]:
    """Produce one exact payload/receipt pair for atomic database completion."""

    artifact = canonical_json_dumps_bounded(
        result.model_dump(mode="json"),
        maximum_bytes=MAX_BEHAVIORAL_RESULT_BYTES,
    )
    receipt = BehavioralExecutionReceipt(
        request_id=attempt_id,
        attempt_id=attempt_id,
        run_id=result.run_id,
        started_at=started_at,
        ended_at=ended_at,
        artifact_sha256=sha256(artifact).hexdigest(),
    )
    return artifact, receipt


class BehavioralEngineClientError(RuntimeError):
    """Base safe adapter failure; response content is never included."""


class BehavioralEngineUnavailableError(BehavioralEngineClientError):
    """The private service was unavailable or returned an unsafe response."""


class BehavioralEngineRateLimitedError(BehavioralEngineClientError):
    """The private service explicitly rejected work for capacity."""


class BehavioralEngineRejectedError(BehavioralEngineClientError):
    """The private service rejected the frozen command."""


def _bounded_response_bytes(response: httpx.Response) -> bytes:
    raw_length = response.headers.get("content-length")
    if raw_length is not None:
        try:
            content_length = int(raw_length)
        except ValueError as error:
            raise BehavioralEngineUnavailableError(
                "private behavioral engine returned an invalid response length"
            ) from error
        if content_length < 0 or content_length > MAX_RESULT_BYTES:
            raise BehavioralEngineUnavailableError(
                "private behavioral engine response exceeded its byte limit"
            )
    chunks = []
    size = 0
    for chunk in response.iter_bytes():
        size += len(chunk)
        if size > MAX_RESULT_BYTES:
            raise BehavioralEngineUnavailableError(
                "private behavioral engine response exceeded its byte limit"
            )
        chunks.append(chunk)
    return b"".join(chunks)


class BehavioralEngineHttpClient:
    def __init__(
        self,
        *,
        base_url: str,
        token: str,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url,
            follow_redirects=False,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            http2=False,
            timeout=httpx.Timeout(connect=2.0, read=31.0, write=5.0, pool=2.0),
            transport=transport,
            trust_env=False,
        )

    def close(self) -> None:
        self._client.close()

    def execute(self, command: BehavioralRunCommand) -> BehavioralRunResult:
        payload = canonical_json_dumps_bounded(
            command.model_dump(mode="json"),
            maximum_bytes=MAX_COMMAND_BYTES,
        )
        if len(payload) > MAX_COMMAND_BYTES:
            raise BehavioralEngineRejectedError(
                "behavioral command exceeded the private service byte limit"
            )
        timeout = httpx.Timeout(
            connect=2.0,
            read=command.engine_configuration.deadline_seconds + 1.0,
            write=5.0,
            pool=2.0,
        )
        try:
            with self._client.stream(
                "POST",
                EXECUTION_PATH,
                content=payload,
                timeout=timeout,
            ) as response:
                if response.status_code == 429:
                    raise BehavioralEngineRateLimitedError(
                        "private behavioral engine rejected work for capacity"
                    )
                if response.status_code == 422:
                    raise BehavioralEngineRejectedError(
                        "private behavioral engine rejected the frozen command"
                    )
                if response.status_code != 200:
                    raise BehavioralEngineUnavailableError(
                        "private behavioral engine returned an unavailable status"
                    )
                if response.headers.get("content-encoding", "identity") != "identity":
                    raise BehavioralEngineUnavailableError(
                        "private behavioral engine returned encoded content"
                    )
                media_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
                if media_type != "application/json":
                    raise BehavioralEngineUnavailableError(
                        "private behavioral engine returned an unsupported media type"
                    )
                response_bytes = _bounded_response_bytes(response)
        except BehavioralEngineClientError:
            raise
        except httpx.HTTPError as error:
            raise BehavioralEngineUnavailableError(
                "private behavioral engine request failed"
            ) from error
        try:
            result = BehavioralRunResult.model_validate_json(response_bytes)
        except ValidationError as error:
            raise BehavioralEngineUnavailableError(
                "private behavioral engine returned an invalid result schema"
            ) from error
        expected_fleet = build_agent_fleet(
            study_id=command.study_id,
            sample=sample_population(
                command.population,
                command.audience,
                command.sampling_configuration,
            ),
            psychographics=command.psychographics,
            configuration=command.fleet_configuration,
        )
        expected_stimulus_sha256 = sha256(canonical_json_dumps(command.stimulus)).hexdigest()
        if (
            result.run_id != command.run_id
            or result.study_id != command.study_id
            or result.variant_key != command.variant_key
            or result.context_graph != command.context_graph
            or result.fleet != expected_fleet
            or result.configuration != command.engine_configuration
            or result.receipt.provider != command.provider
            or result.receipt.stimulus_sha256 != expected_stimulus_sha256
        ):
            raise BehavioralEngineUnavailableError(
                "private behavioral engine result binding is invalid"
            )
        return result

    def __enter__(self) -> BehavioralEngineHttpClient:
        return self

    def __exit__(self, *_error: object) -> None:
        self.close()
