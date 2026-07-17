"""Strict Phase 2 HTTP models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)
from simula_core.simulation import SimulationResultV1

Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]
Objective = Annotated[str, StringConstraints(min_length=1, max_length=1000)]
StimulusContent = Annotated[str, StringConstraints(min_length=1, max_length=5000)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProblemDocument(StrictModel):
    type: str
    title: str
    status: int
    code: str
    detail: str
    instance: str
    correlation_id: UUID
    errors: list[dict[str, str]] | None = None


class OrganizationRole(StrEnum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class OrganizationStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    DELETED = "deleted"


class ProjectStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class StimulusStatus(StrEnum):
    ACTIVE = "active"
    RETIRED = "retired"
    DELETED = "deleted"


class SimulationRunState(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    RETRYING = "retrying"
    CANCEL_REQUESTED = "cancel_requested"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"


class OrganizationCreate(StrictModel):
    name: Label


class OrganizationResponse(StrictModel):
    id: UUID
    name: str
    role: OrganizationRole
    status: OrganizationStatus
    created_at: datetime


class OrganizationPage(StrictModel):
    items: list[OrganizationResponse]
    next_cursor: str | None


class ProjectFields(StrictModel):
    name: Label
    objective: Objective
    market: Literal["philippines"]
    language: Literal["en"]
    category: Literal["campaign_message"]

    @field_validator("objective")
    @classmethod
    def objective_contains_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("objective must contain text")
        return value


class ProjectCreate(ProjectFields):
    pass


class ProjectPatch(StrictModel):
    name: Label | None = None
    objective: Objective | None = None
    market: Literal["philippines"] | None = None
    language: Literal["en"] | None = None
    category: Literal["campaign_message"] | None = None

    @model_validator(mode="after")
    def contains_non_null_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one project field is required")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("project fields cannot be null")
        if self.objective is not None and not self.objective.strip():
            raise ValueError("objective must contain text")
        return self


class ProjectResponse(StrictModel):
    id: UUID
    organization_id: UUID
    name: str
    objective: str
    market: Literal["philippines"]
    language: Literal["en"]
    category: Literal["campaign_message"]
    status: ProjectStatus
    version: int = Field(ge=1)
    created_at: datetime
    updated_at: datetime


class ProjectPage(StrictModel):
    items: list[ProjectResponse]
    next_cursor: str | None


class StimulusCreate(StrictModel):
    name: Label
    content: StimulusContent

    @field_validator("content")
    @classmethod
    def content_fits_utf8_budget(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 16_384:
            raise ValueError("content exceeds the UTF-8 byte limit")
        return value


class StimulusVersionAppend(StrictModel):
    content: StimulusContent

    @field_validator("content")
    @classmethod
    def content_fits_utf8_budget(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 16_384:
            raise ValueError("content exceeds the UTF-8 byte limit")
        return value


class SimulationRunCreate(StrictModel):
    stimulus_version_id: UUID


class SimulationRunResponse(StrictModel):
    id: UUID
    organization_id: UUID
    project_id: UUID
    stimulus_version_id: UUID
    audience_version_id: UUID
    state: SimulationRunState
    schema_version: Literal[1]
    dispatch_generation: int = Field(ge=1, le=3)
    job_id: str = Field(
        pattern=r"^run:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:dispatch:[1-3]$"
    )
    version: int = Field(ge=1)
    created_at: datetime


class SimulationResultResponse(StrictModel):
    run_id: UUID
    schema_version: Literal[1]
    result: SimulationResultV1
    artifact_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    created_at: datetime


class StimulusVersionResponse(StrictModel):
    id: UUID
    organization_id: UUID
    stimulus_id: UUID
    version: int = Field(ge=1, le=20)
    content: str
    content_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    created_at: datetime


class StimulusResponse(StrictModel):
    id: UUID
    organization_id: UUID
    project_id: UUID
    name: str
    status: StimulusStatus
    created_at: datetime
    versions: list[StimulusVersionResponse]


class ProjectDetail(ProjectResponse):
    stimuli: list[StimulusResponse]


class MeResponse(StrictModel):
    user_id: UUID
