"""Non-sensitive runtime metadata shared by services."""

from __future__ import annotations

import os
from typing import Literal

from pydantic import BaseModel, ConfigDict


class RuntimeMetadata(BaseModel):
    """Safe release identity for health responses and structured logs."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    environment: str
    release_sha: str
    service: Literal["api", "worker"]

    @classmethod
    def from_environment(cls, *, service: Literal["api", "worker"]) -> RuntimeMetadata:
        return cls(
            environment=os.getenv("SIMULA_ENVIRONMENT", "local"),
            release_sha=os.getenv("SIMULA_RELEASE_SHA", "dev"),
            service=service,
        )
