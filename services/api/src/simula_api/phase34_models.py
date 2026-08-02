"""Strict Phase 3 methodology and Phase 4 product HTTP contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue, StringConstraints, field_validator

Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
Sha256 = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
IdKey = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_.]{0,63}$")]


class ProductModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AudienceCriterionInput(ProductModel):
    attribute: Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,63}$")]
    operator: Literal["equals", "in", "not_equals"]
    value: str | list[str]


class AudienceManifestInput(ProductModel):
    schema_version: Literal[1] = 1
    criteria: list[AudienceCriterionInput] = Field(max_length=20)
    provenance_status: Literal["demo", "verified"]
    non_representative: bool
    target_population: Annotated[str, StringConstraints(min_length=1, max_length=500)]


class AudienceCreate(ProductModel):
    name: Label
    manifest: AudienceManifestInput
    limitations: Annotated[str, StringConstraints(min_length=1, max_length=1000)]


class AudienceCommandResponse(ProductModel):
    audience_id: UUID
    audience_version_id: UUID
    version: int = Field(ge=1)
    name: str
    kind: Literal["synthetic_cohort"]
    admission_status: Literal["approved_experimental"]
    checksum_sha256: Sha256
    created_at: datetime
    replayed: bool


class SamplingConfigurationInput(ProductModel):
    sample_size: int = Field(ge=10, le=5000)
    minimum_per_cell: int = Field(ge=1, le=100)
    maximum_cells: int = Field(ge=1, le=500)
    seed: int
    sparse_cell_threshold: int = Field(ge=1, le=100)


class SimulationConfigurationCreate(ProductModel):
    name: Label
    audience_version_id: UUID
    population_frame_version_id: UUID
    methodology_version_id: UUID
    provider_configuration_version_id: UUID
    sampling_configuration: SamplingConfigurationInput
    cost_ceiling_microusd: int = Field(ge=0, le=100_000_000)


class SimulationConfigurationCommandResponse(ProductModel):
    configuration_id: UUID
    configuration_version_id: UUID
    version: int = Field(ge=1)
    name: str
    project_id: UUID
    audience_version_id: UUID
    population_frame_version_id: UUID
    methodology_version_id: UUID
    provider_configuration_version_id: UUID
    sampling_configuration: dict[str, JsonValue]
    cost_ceiling_microusd: int
    checksum_sha256: Sha256
    created_at: datetime
    replayed: bool


class RepeatedSimulationConfigurationInput(ProductModel):
    repetition_count: int = Field(ge=3, le=10)
    base_seed: int = Field(ge=-(2**63), le=2**63 - 1)
    stability_tolerance: int = Field(ge=1, le=100)


class MethodologyPreviewCreate(ProductModel):
    configuration_version_id: UUID
    stimulus_version_id: UUID
    variant_key: IdKey
    variant_label: Label
    run_id: UUID | None = None
    repetition_configuration: RepeatedSimulationConfigurationInput | None = None


class RunMethodologyReportCreate(ProductModel):
    configuration_version_id: UUID
    variant_key: IdKey
    variant_label: Label
    repetition_configuration: RepeatedSimulationConfigurationInput | None = None


class VariantMemberInput(ProductModel):
    stimulus_version_id: UUID
    variant_key: Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,31}$")]
    label: Label


class VariantGroupCreate(ProductModel):
    name: Label
    members: list[VariantMemberInput] = Field(min_length=2, max_length=8)


class FeedbackCreate(ProductModel):
    run_id: UUID | None = None
    kind: Literal[
        "human_panel",
        "survey",
        "focus_group",
        "campaign_outcome",
        "user_correction",
        "post_launch_sentiment",
    ]
    observed_at: datetime
    payload: dict[str, JsonValue]
    provenance: dict[str, JsonValue]
    rights_basis: Annotated[str, StringConstraints(min_length=1, max_length=500)]

    @field_validator("observed_at")
    @classmethod
    def observed_at_is_aware(cls, value: datetime) -> datetime:
        if value.utcoffset() is None:
            raise ValueError("observed_at must be timezone-aware")
        return value


class ReportCreate(ProductModel):
    artifact: dict[str, JsonValue]


class ExportCreate(ProductModel):
    format: Literal["json", "csv"]
    expires_at: datetime

    @field_validator("expires_at")
    @classmethod
    def expires_at_is_aware(cls, value: datetime) -> datetime:
        if value.utcoffset() is None:
            raise ValueError("expires_at must be timezone-aware")
        return value


class InvitationCreate(ProductModel):
    email: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            to_lower=True,
            min_length=3,
            max_length=254,
            pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$",
        ),
    ]
    role: Literal["editor", "viewer"]
    expires_at: datetime

    @field_validator("expires_at")
    @classmethod
    def invitation_expiry_is_aware(cls, value: datetime) -> datetime:
        if value.utcoffset() is None:
            raise ValueError("expires_at must be timezone-aware")
        return value


class InvitationAccept(ProductModel):
    token: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{43}$")]


class ReportShareCreate(ProductModel):
    recipient_user_id: UUID
    permission: Literal["view", "download"]
    expires_at: datetime

    @field_validator("expires_at")
    @classmethod
    def share_expiry_is_aware(cls, value: datetime) -> datetime:
        if value.utcoffset() is None:
            raise ValueError("expires_at must be timezone-aware")
        return value


class FeatureFlagSet(ProductModel):
    enabled: bool
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class ProductCommandResponse(ProductModel):
    data: dict[str, JsonValue]


class ProductCollectionResponse(ProductModel):
    items: list[dict[str, JsonValue]]


class OrganizationDashboardPermissions(ProductModel):
    can_create_projects: bool
    can_create_runs: bool
    can_manage_team: bool
    can_manage_settings: bool
    can_view_audit: bool


class OrganizationDashboardMetrics(ProductModel):
    projects: int = Field(ge=0)
    audiences: int = Field(ge=0)
    runs: int = Field(ge=0)
    active_runs: int = Field(ge=0)
    succeeded_runs: int = Field(ge=0)
    failed_runs: int = Field(ge=0)
    reports: int = Field(ge=0)
    feedback_records: int = Field(ge=0)


class OrganizationDashboardProject(ProductModel):
    id: UUID
    name: str
    objective: str
    status: Literal["active", "archived", "deleted"]
    version: int = Field(ge=1)
    updated_at: datetime


class OrganizationDashboardRun(ProductModel):
    id: UUID
    project_id: UUID
    project_name: str
    state: Literal[
        "queued",
        "running",
        "retrying",
        "cancel_requested",
        "canceled",
        "succeeded",
        "failed",
    ]
    created_at: datetime


class OrganizationDashboardReport(ProductModel):
    id: UUID
    run_id: UUID
    project_id: UUID
    project_name: str
    created_at: datetime


class OrganizationDashboardResponse(ProductModel):
    organization_id: UUID
    organization_name: str
    organization_status: Literal["active", "disabled", "deleted"]
    role: Literal["owner", "editor", "viewer"]
    platform_role: Literal["superadmin"] | None = None
    permissions: OrganizationDashboardPermissions
    metrics: OrganizationDashboardMetrics
    recent_projects: list[OrganizationDashboardProject]
    recent_runs: list[OrganizationDashboardRun]
    recent_reports: list[OrganizationDashboardReport]
    generated_at: datetime


class PlatformAdminMetrics(ProductModel):
    users: int = Field(ge=0)
    organizations: int = Field(ge=0)
    projects: int = Field(ge=0)
    runs: int = Field(ge=0)
    active_runs: int = Field(ge=0)
    reports: int = Field(ge=0)
    feedback_records: int = Field(ge=0)


class PlatformAdminOrganization(ProductModel):
    id: UUID
    name: str
    status: Literal["active", "disabled", "deleted"]
    members: int = Field(ge=0)
    projects: int = Field(ge=0)
    runs: int = Field(ge=0)
    reports: int = Field(ge=0)
    created_at: datetime
    updated_at: datetime


class PlatformAdminDashboardResponse(ProductModel):
    user_id: UUID
    role: Literal["superadmin"]
    metrics: PlatformAdminMetrics
    organizations: list[PlatformAdminOrganization]
    generated_at: datetime


class MethodologyRegistryResponse(ProductModel):
    population_frames: list[dict[str, JsonValue]]
    methodologies: list[dict[str, JsonValue]]
    providers: list[dict[str, JsonValue]]
