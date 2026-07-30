import type { VerifiedIdentity } from "../auth/identity";
import type {
  BehavioralComparisonResponseDto,
  BehavioralEvidenceResponseDto,
  BehavioralResultResponseDto,
  RunAuditHistoryResponseDto,
  SimulationProvenanceResponseDto,
  SimulationResultResponseDto,
  SimulationRunResponseDto,
} from "../runs/run.dto";
import type { CursorPosition } from "./cursor-codec";
import type {
  AudienceCommandResponseDto,
  AudienceCreateDto,
  AudienceRecordDto,
} from "../audiences/audience.dto";
import type {
  MethodologyPreviewCreateDto,
  MethodologyRegistryResponseDto,
  SimulationConfigurationCreateDto,
  SimulationConfigurationRecordDto,
  SimulationConfigurationResponseDto,
} from "../methodology/methodology.dto";
import type {
  ReportExportCreateDto,
  VariantGroupCreateDto,
} from "../methodology/optimization.dto";
import type { StimulusAssetReserveDto } from "../assets/stimulus-asset.dto";

export type OrganizationRole = "owner" | "editor" | "viewer";
export type OrganizationStatus = "active" | "disabled" | "deleted";

export interface OrganizationRecord {
  readonly id: string;
  readonly name: string;
  readonly role: OrganizationRole;
  readonly status: OrganizationStatus;
  readonly created_at: string;
}

export interface OrganizationDeletionRecord {
  readonly request_id: string;
  readonly organization_id: string;
  readonly status: "pending" | "completed";
  readonly storage_objects: readonly string[];
  readonly run_ids: readonly string[];
  readonly requested_at: string;
  readonly completed_at: string | null;
  readonly replayed: boolean;
}

export interface OrganizationDashboardRecord {
  readonly organization_id: string;
  readonly organization_name: string;
  readonly organization_status: OrganizationStatus;
  readonly role: OrganizationRole;
  readonly platform_role: "superadmin" | null;
  readonly permissions: {
    readonly can_create_projects: boolean;
    readonly can_create_runs: boolean;
    readonly can_manage_team: boolean;
    readonly can_manage_settings: boolean;
    readonly can_view_audit: boolean;
  };
  readonly metrics: {
    readonly projects: number;
    readonly audiences: number;
    readonly runs: number;
    readonly active_runs: number;
    readonly succeeded_runs: number;
    readonly failed_runs: number;
    readonly reports: number;
    readonly feedback_records: number;
  };
  readonly recent_projects: readonly {
    readonly id: string;
    readonly name: string;
    readonly objective: string;
    readonly status: "active" | "archived" | "deleted";
    readonly version: number;
    readonly updated_at: string;
  }[];
  readonly recent_runs: readonly {
    readonly id: string;
    readonly project_id: string;
    readonly project_name: string;
    readonly state:
      | "queued"
      | "running"
      | "retrying"
      | "cancel_requested"
      | "canceled"
      | "succeeded"
      | "failed";
    readonly created_at: string;
  }[];
  readonly recent_reports: readonly {
    readonly id: string;
    readonly run_id: string;
    readonly project_id: string;
    readonly project_name: string;
    readonly created_at: string;
  }[];
  readonly generated_at: string;
}

export interface CommandResult<T> {
  readonly value: T;
  readonly replayed: boolean;
}

export interface ProjectRecord {
  readonly id: string;
  readonly organization_id: string;
  readonly name: string;
  readonly objective: string;
  readonly market: "philippines";
  readonly language: "en";
  readonly category: "campaign_message";
  readonly status: "active" | "archived" | "deleted";
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface StimulusVersionRecord {
  readonly id: string;
  readonly organization_id: string;
  readonly stimulus_id: string;
  readonly version: number;
  readonly content: string;
  readonly content_sha256: string;
  readonly created_at: string;
}

export interface StimulusRecord {
  readonly id: string;
  readonly organization_id: string;
  readonly project_id: string;
  readonly name: string;
  readonly status: "active" | "retired" | "deleted";
  readonly created_at: string;
  readonly versions: readonly StimulusVersionRecord[];
}

export interface ProjectDetailRecord extends ProjectRecord {
  readonly stimuli: readonly StimulusRecord[];
}

export interface AudienceDisclosureRecord {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly kind: "authored_demo";
  readonly checksum_sha256: string;
  readonly non_representative: true;
  readonly limitations: readonly [
    "Estimates nobody and is not representative of any population.",
  ];
  readonly disclosure_version: "phase2_demo_v1";
  readonly purpose: string;
  readonly prohibited_uses: readonly string[];
  readonly owner: string;
  readonly source: string;
  readonly dependencies: readonly string[];
  readonly transformation: string;
  readonly scope: string;
  readonly lifecycle: string;
}

export interface ProjectInput {
  readonly name: string;
  readonly objective: string;
  readonly market: "philippines";
  readonly language: "en";
  readonly category: "campaign_message";
}

export interface MethodologyPreviewCommand {
  readonly run_id: string;
  readonly stimulus: string;
  readonly population: Readonly<Record<string, unknown>>;
  readonly audience: Readonly<Record<string, unknown>>;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly methodology_version: string;
  readonly cost_ceiling_microusd: number;
  readonly report: {
    readonly report_id: string;
    readonly project_id: string;
    readonly stimulus_version_id: string;
    readonly variant_key: string;
    readonly variant_label: string;
    readonly created_at: string;
  };
}

export interface ReportArtifactRecord {
  readonly report_id: string;
  readonly run_id: string;
  readonly schema_version: "2.0.0";
  readonly artifact: Readonly<Record<string, unknown>>;
  readonly content_sha256: string;
  readonly created_at: string;
}

export interface StoredReportArtifact extends ReportArtifactRecord {
  readonly organization_id: string;
}

export interface ReportArtifactCommand {
  readonly report_id: string;
  readonly run_id: string;
  readonly schema_version: "2.0.0";
  readonly content_sha256: string;
  readonly created_at: string;
  readonly replayed: boolean;
}

export interface VariantMemberRecord {
  readonly id: string;
  readonly stimulus_version_id: string;
  readonly variant_key: string;
  readonly label: string;
  readonly sort_order: number;
}

export interface VariantGroupRecord {
  readonly variant_group_id: string;
  readonly project_id: string;
  readonly name: string;
  readonly members: readonly VariantMemberRecord[];
  readonly created_at: string;
  readonly replayed?: boolean;
}

export interface VariantReportInput {
  readonly variant_key: string;
  readonly artifact: Readonly<Record<string, unknown>>;
}

export interface VariantComparisonCommand {
  readonly reports: readonly VariantReportInput[];
}

export interface ReportExportRenderCommand {
  readonly report: Readonly<Record<string, unknown>>;
  readonly format: "json" | "csv";
}

export interface ReportExportRendered {
  readonly format: "json" | "csv";
  readonly media_type: "application/json" | "text/csv; charset=utf-8";
  readonly filename: string;
  readonly content: Buffer;
  readonly content_sha256: string;
}

export interface ReportExportCommand {
  readonly export_id: string;
  readonly report_id: string;
  readonly format: "json" | "csv";
  readonly filename: string;
  readonly content_sha256: string;
  readonly expires_at: string;
  readonly created_at: string;
  readonly replayed: boolean;
}

export interface ReportExportDownload {
  readonly format: "json" | "csv";
  readonly filename: string;
  readonly content: Buffer;
  readonly content_sha256: string;
}

export interface StimulusAssetRecord {
  readonly asset_id: string;
  readonly organization_id: string;
  readonly stimulus_id: string;
  readonly storage_bucket_id: "simula-private-assets";
  readonly storage_object_name: string;
  readonly filename: string;
  readonly media_type:
    "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "video/mp4";
  readonly expected_byte_size: number;
  readonly expected_content_sha256: string;
  readonly byte_size: number | null;
  readonly content_sha256: string | null;
  readonly status:
    "pending_upload" | "available" | "deletion_requested" | "deleted";
  readonly retention_until: string;
  readonly created_at: string;
  readonly replayed: boolean;
}

export interface VisualStimulusProfile {
  readonly schema_version: "1.0.0";
  readonly analysis_id: string;
  readonly asset: {
    readonly asset_id: string;
    readonly organization_id: string;
    readonly stimulus_id: string;
    readonly media_type: "image/jpeg" | "image/png" | "image/webp";
    readonly byte_size: number;
    readonly content_sha256: string;
  };
  readonly provider: {
    readonly provider_id: "simula_technical_image_signals";
    readonly provider_version: "1.0.0";
    readonly model_id: "pillow-12.1.0" | "pillow-12.3.0";
    readonly template_id: "technical_image_signals_v1";
    readonly analysis_kind: "image_signal_profile";
  };
  readonly methodology_version: "technical_image_signals_v1";
  readonly analysis_scope: "technical_image_signals_only";
  readonly validation_label: "experimental";
  readonly dimensions: {
    readonly width_px: number;
    readonly height_px: number;
    readonly pixel_count: number;
    readonly aspect_ratio: number;
    readonly orientation: "landscape" | "portrait" | "square";
  };
  readonly sampling: {
    readonly algorithm: "exif_transpose_lanczos_rgba_v1";
    readonly sample_width_px: number;
    readonly sample_height_px: number;
    readonly sampled_pixel_count: number;
  };
  readonly signals: readonly {
    readonly key:
      | "alpha_coverage"
      | "blue_mean"
      | "edge_density"
      | "green_mean"
      | "luminance_contrast"
      | "luminance_entropy"
      | "luminance_mean"
      | "red_mean"
      | "saturation_mean";
    readonly value: number;
    readonly unit: "normalized_0_1";
    readonly kind: "measured_technical_signal" | "heuristic_technical_signal";
    readonly method: string;
  }[];
  readonly behavioral_interpretation: false;
  readonly population_inference: false;
  readonly retained_embedded_metadata: false;
  readonly limitations: readonly [
    "Measures technical image signals only; it does not identify objects, text, brand meaning, emotion, persuasion, or aesthetic quality.",
    "It is not observed human evidence or evidence of campaign performance.",
  ];
  readonly checksum_sha256: string;
}

export interface VisualStimulusProfileRecord {
  readonly analysis_id: string;
  readonly asset_id: string;
  readonly organization_id: string;
  readonly stimulus_id: string;
  readonly asset_content_sha256: string;
  readonly profile_checksum_sha256: string;
  readonly profile: VisualStimulusProfile;
  readonly created_at: string;
  readonly replayed: boolean;
}

export interface OrganizationGateway {
  isReady(): Promise<boolean>;
  recordSignInSuccess(
    identity: VerifiedIdentity,
    correlationId: string,
  ): Promise<boolean>;
  listOrganizations(
    identity: VerifiedIdentity,
    after: CursorPosition | null,
    limit: number,
  ): Promise<readonly OrganizationRecord[]>;
  getOrganizationDashboard(
    identity: VerifiedIdentity,
    organizationId: string,
  ): Promise<OrganizationDashboardRecord>;
  createOrganization(
    identity: VerifiedIdentity,
    name: string,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<OrganizationRecord>>;
  requestOrganizationDeletion(
    identity: VerifiedIdentity,
    organizationId: string,
    confirmation: string,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<OrganizationDeletionRecord>;
  confirmOrganizationDeletion(
    identity: VerifiedIdentity,
    requestId: string,
    organizationId: string,
  ): Promise<OrganizationDeletionRecord>;
  visibleOrganization(
    identity: VerifiedIdentity,
    organizationId: string,
  ): Promise<string>;
  organizationForProject(
    identity: VerifiedIdentity,
    projectId: string,
  ): Promise<string>;
  organizationForStimulus(
    identity: VerifiedIdentity,
    stimulusId: string,
  ): Promise<string>;
  recordPrivilegedDenial(
    identity: VerifiedIdentity,
    organizationId: string,
    action: string,
    objectType: string,
    objectId: string | null,
    correlationId: string,
  ): Promise<void>;
  createProject(
    identity: VerifiedIdentity,
    organizationId: string,
    input: ProjectInput,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<ProjectRecord>>;
  listProjects(
    identity: VerifiedIdentity,
    organizationId: string,
    after: CursorPosition | null,
    limit: number,
  ): Promise<readonly ProjectRecord[]>;
  getProject(
    identity: VerifiedIdentity,
    projectId: string,
  ): Promise<ProjectDetailRecord>;
  updateProject(
    identity: VerifiedIdentity,
    projectId: string,
    expectedVersion: number,
    patch: Partial<ProjectInput>,
    correlationId: string,
  ): Promise<ProjectRecord>;
  createStimulus(
    identity: VerifiedIdentity,
    projectId: string,
    name: string,
    content: string,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<StimulusRecord>>;
  appendStimulusVersion(
    identity: VerifiedIdentity,
    stimulusId: string,
    content: string,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<StimulusVersionRecord>>;
  createStimulusAsset(
    identity: VerifiedIdentity,
    stimulusId: string,
    input: StimulusAssetReserveDto,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<StimulusAssetRecord>>;
  listStimulusAssets(
    identity: VerifiedIdentity,
    stimulusId: string,
  ): Promise<readonly StimulusAssetRecord[]>;
  getStimulusAsset(
    identity: VerifiedIdentity,
    assetId: string,
  ): Promise<StimulusAssetRecord>;
  confirmStimulusAssetUpload(
    identity: VerifiedIdentity,
    assetId: string,
    byteSize: number,
    contentSha256: string,
    correlationId: string,
  ): Promise<StimulusAssetRecord>;
  requestStimulusAssetDeletion(
    identity: VerifiedIdentity,
    assetId: string,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<StimulusAssetRecord>>;
  confirmStimulusAssetDeletion(
    identity: VerifiedIdentity,
    assetId: string,
    correlationId: string,
  ): Promise<StimulusAssetRecord>;
  createVisualStimulusProfile(
    identity: VerifiedIdentity,
    assetId: string,
    analysisId: string,
    profile: VisualStimulusProfile,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<VisualStimulusProfileRecord>>;
  getVisualStimulusProfile(
    identity: VerifiedIdentity,
    assetId: string,
  ): Promise<VisualStimulusProfileRecord | null>;
  getDemoAudience(
    identity: VerifiedIdentity,
  ): Promise<AudienceDisclosureRecord>;
  getMethodologyRegistry(
    identity: VerifiedIdentity,
  ): Promise<MethodologyRegistryResponseDto>;
  createAudienceDefinition(
    identity: VerifiedIdentity,
    organizationId: string,
    input: AudienceCreateDto,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<AudienceCommandResponseDto>>;
  listAudienceDefinitions(
    identity: VerifiedIdentity,
    organizationId: string,
  ): Promise<readonly AudienceRecordDto[]>;
  createSimulationConfiguration(
    identity: VerifiedIdentity,
    projectId: string,
    input: SimulationConfigurationCreateDto,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<SimulationConfigurationResponseDto>>;
  listSimulationConfigurations(
    identity: VerifiedIdentity,
    projectId: string,
  ): Promise<readonly SimulationConfigurationRecordDto[]>;
  getMethodologyPreviewCommand(
    identity: VerifiedIdentity,
    projectId: string,
    input: MethodologyPreviewCreateDto,
    runId: string,
    reportId: string,
  ): Promise<MethodologyPreviewCommand>;
  createReportArtifact(
    identity: VerifiedIdentity,
    runId: string,
    artifact: Readonly<Record<string, unknown>>,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<ReportArtifactCommand>>;
  getRunReport(
    identity: VerifiedIdentity,
    runId: string,
  ): Promise<ReportArtifactRecord>;
  getStoredReportArtifact(
    identity: VerifiedIdentity,
    reportId: string,
  ): Promise<StoredReportArtifact>;
  createVariantGroup(
    identity: VerifiedIdentity,
    projectId: string,
    input: VariantGroupCreateDto,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<VariantGroupRecord>>;
  listVariantGroups(
    identity: VerifiedIdentity,
    projectId: string,
  ): Promise<readonly VariantGroupRecord[]>;
  getVariantComparisonCommand(
    identity: VerifiedIdentity,
    variantGroupId: string,
  ): Promise<VariantComparisonCommand>;
  createReportExport(
    identity: VerifiedIdentity,
    reportId: string,
    input: ReportExportCreateDto,
    rendered: ReportExportRendered,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<ReportExportCommand>>;
  getReportExport(
    identity: VerifiedIdentity,
    exportId: string,
  ): Promise<ReportExportDownload>;
  createSimulationRun(
    identity: VerifiedIdentity,
    projectId: string,
    stimulusVersionId: string,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
    traceparent: string,
  ): Promise<CommandResult<SimulationRunResponseDto>>;
  createBehavioralDemoRun(
    identity: VerifiedIdentity,
    projectId: string,
    stimulusVersionId: string,
    variantKey: string,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
    traceparent: string,
  ): Promise<CommandResult<SimulationRunResponseDto>>;
  getSimulationRunReplay(
    identity: VerifiedIdentity,
    projectId: string,
    idempotencyKey: string,
    requestSha256: string,
  ): Promise<SimulationRunResponseDto | null>;
  getSimulationRun(
    identity: VerifiedIdentity,
    runId: string,
  ): Promise<SimulationRunResponseDto>;
  requestSimulationRunCancel(
    identity: VerifiedIdentity,
    runId: string,
    correlationId: string,
  ): Promise<SimulationRunResponseDto>;
  getSimulationResult(
    identity: VerifiedIdentity,
    runId: string,
  ): Promise<SimulationResultResponseDto | null>;
  getBehavioralResult(
    identity: VerifiedIdentity,
    runId: string,
  ): Promise<BehavioralResultResponseDto | null>;
  getBehavioralEvidence(
    identity: VerifiedIdentity,
    runId: string,
  ): Promise<BehavioralEvidenceResponseDto | null>;
  getBehavioralComparison(
    identity: VerifiedIdentity,
    baselineRunId: string,
    candidateRunId: string,
  ): Promise<BehavioralComparisonResponseDto | null>;
  getRunAuditHistory(
    identity: VerifiedIdentity,
    runId: string,
  ): Promise<RunAuditHistoryResponseDto>;
  getSimulationProvenance(
    identity: VerifiedIdentity,
    runId: string,
  ): Promise<SimulationProvenanceResponseDto>;
}
