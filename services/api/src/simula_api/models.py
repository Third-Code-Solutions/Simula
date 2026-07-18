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


class SimulationRunCancel(StrictModel):
    pass


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


class ProvenanceStimulus(StrictModel):
    version_id: UUID
    content: StimulusContent
    content_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class ProvenanceAudienceCell(StrictModel):
    key: Literal["authored_demo"]
    weight: float = Field(gt=0.0, le=1.0)


class ProvenanceAudience(StrictModel):
    version_id: UUID
    kind: Literal["authored_demo"]
    checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    cells: list[ProvenanceAudienceCell] = Field(min_length=1)
    non_representative: Literal[True]
    limitations: list[Literal["Estimates nobody and is not representative of any population."]]


class ProvenanceExecution(StrictModel):
    method_version: Literal["phase2_demo_v1"]
    disclosure_version: Literal["phase2_demo_v1"]
    language: Literal["en"]
    output_schema_version: Literal[1]
    provider_id: Literal["deterministic_mock"]
    provider_version: Literal[1]
    pipeline_release_id: Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9._-]{2,63}$")]


class ProvenanceExecutionLimits(StrictModel):
    version: Literal["phase2_2026_07_17"]
    arq_job_timeout_seconds: Literal[30]
    provider_cost_ceiling: Literal[0]
    max_database_attempts: Literal[3]
    max_dispatch_generations: Literal[3]
    max_result_bytes: Literal[131072]


class SimulationProvenanceResponse(StrictModel):
    """Whitelisted immutable run provenance; generic manifests never cross the API boundary."""

    availability: Literal["available", "legacy_unavailable"]
    unavailable_reason: Literal["frozen_provenance_not_captured"] | None = None
    run_id: UUID
    created_at: datetime
    terminal_at: datetime | None
    result_created_at: datetime | None
    frozen_manifest_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    deterministic_seed: str = Field(pattern=r"^-?[0-9]{1,19}$")
    stimulus: ProvenanceStimulus | None = None
    audience: ProvenanceAudience | None = None
    execution: ProvenanceExecution | None = None
    limits: ProvenanceExecutionLimits | None = None

    @model_validator(mode="after")
    def has_complete_or_explicitly_unavailable_provenance(self) -> Self:
        details = (self.stimulus, self.audience, self.execution, self.limits)
        if self.availability == "available":
            if self.unavailable_reason is not None or any(detail is None for detail in details):
                raise ValueError("available provenance must include every frozen detail")
            return self
        if self.unavailable_reason is None or any(detail is not None for detail in details):
            raise ValueError("legacy provenance must disclose why details are unavailable")
        return self


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
