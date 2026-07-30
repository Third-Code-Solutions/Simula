import { Injectable } from "@nestjs/common";

import type { VerifiedIdentity } from "../auth/identity";
import type {
  AudienceCommandResponseDto,
  AudienceCreateDto,
  AudienceRecordDto,
} from "../audiences/audience.dto";
import type { StimulusAssetReserveDto } from "../assets/stimulus-asset.dto";
import { dependencyUnavailable } from "../domain/problem";
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
  AudienceDisclosureRecord,
  CommandResult,
  OrganizationGateway,
  OrganizationDashboardRecord,
  OrganizationDeletionRecord,
  OrganizationRecord,
  ProjectDetailRecord,
  ProjectInput,
  ProjectRecord,
  MethodologyPreviewCommand,
  ReportArtifactCommand,
  ReportArtifactRecord,
  ReportExportCommand,
  ReportExportDownload,
  ReportExportRendered,
  StoredReportArtifact,
  VariantComparisonCommand,
  VariantGroupRecord,
  StimulusRecord,
  StimulusAssetRecord,
  StimulusVersionRecord,
  VisualStimulusProfile,
  VisualStimulusProfileRecord,
} from "./organization-gateway.port";

@Injectable()
export class UnavailableOrganizationGateway implements OrganizationGateway {
  async isReady(): Promise<boolean> {
    return true;
  }

  async recordSignInSuccess(
    _identity: VerifiedIdentity,
    _correlationId: string,
  ): Promise<boolean> {
    throw dependencyUnavailable(
      "The authenticated NestJS migration surface is disabled.",
    );
  }

  async listOrganizations(
    _identity: VerifiedIdentity,
    _after: CursorPosition | null,
    _limit: number,
  ): Promise<readonly OrganizationRecord[]> {
    return this.unavailable();
  }

  async getOrganizationDashboard(
    _identity: VerifiedIdentity,
    _organizationId: string,
  ): Promise<OrganizationDashboardRecord> {
    return this.unavailable();
  }

  async createOrganization(
    _identity: VerifiedIdentity,
    _name: string,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
  ): Promise<CommandResult<OrganizationRecord>> {
    return this.unavailable();
  }

  async requestOrganizationDeletion(
    _identity: VerifiedIdentity,
    _organizationId: string,
    _confirmation: string,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
  ): Promise<OrganizationDeletionRecord> {
    return this.unavailable();
  }

  async confirmOrganizationDeletion(
    _identity: VerifiedIdentity,
    _requestId: string,
    _organizationId: string,
  ): Promise<OrganizationDeletionRecord> {
    return this.unavailable();
  }

  async visibleOrganization(
    _identity: VerifiedIdentity,
    _organizationId: string,
  ): Promise<string> {
    return this.unavailable();
  }

  async organizationForProject(
    _identity: VerifiedIdentity,
    _projectId: string,
  ): Promise<string> {
    return this.unavailable();
  }

  async organizationForStimulus(
    _identity: VerifiedIdentity,
    _stimulusId: string,
  ): Promise<string> {
    return this.unavailable();
  }

  async recordPrivilegedDenial(
    _identity: VerifiedIdentity,
    _organizationId: string,
    _action: string,
    _objectType: string,
    _objectId: string | null,
    _correlationId: string,
  ): Promise<void> {
    return this.unavailable();
  }

  async createProject(
    _identity: VerifiedIdentity,
    _organizationId: string,
    _input: ProjectInput,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
  ): Promise<CommandResult<ProjectRecord>> {
    return this.unavailable();
  }

  async listProjects(
    _identity: VerifiedIdentity,
    _organizationId: string,
    _after: CursorPosition | null,
    _limit: number,
  ): Promise<readonly ProjectRecord[]> {
    return this.unavailable();
  }

  async getProject(
    _identity: VerifiedIdentity,
    _projectId: string,
  ): Promise<ProjectDetailRecord> {
    return this.unavailable();
  }

  async updateProject(
    _identity: VerifiedIdentity,
    _projectId: string,
    _expectedVersion: number,
    _patch: Partial<ProjectInput>,
    _correlationId: string,
  ): Promise<ProjectRecord> {
    return this.unavailable();
  }

  async createStimulus(
    _identity: VerifiedIdentity,
    _projectId: string,
    _name: string,
    _content: string,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
  ): Promise<CommandResult<StimulusRecord>> {
    return this.unavailable();
  }

  async appendStimulusVersion(
    _identity: VerifiedIdentity,
    _stimulusId: string,
    _content: string,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
  ): Promise<CommandResult<StimulusVersionRecord>> {
    return this.unavailable();
  }

  async createStimulusAsset(
    _identity: VerifiedIdentity,
    _stimulusId: string,
    _input: StimulusAssetReserveDto,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
  ): Promise<CommandResult<StimulusAssetRecord>> {
    return this.unavailable();
  }

  async listStimulusAssets(
    _identity: VerifiedIdentity,
    _stimulusId: string,
  ): Promise<readonly StimulusAssetRecord[]> {
    return this.unavailable();
  }

  async getStimulusAsset(
    _identity: VerifiedIdentity,
    _assetId: string,
  ): Promise<StimulusAssetRecord> {
    return this.unavailable();
  }

  async confirmStimulusAssetUpload(
    _identity: VerifiedIdentity,
    _assetId: string,
    _byteSize: number,
    _contentSha256: string,
    _correlationId: string,
  ): Promise<StimulusAssetRecord> {
    return this.unavailable();
  }

  async requestStimulusAssetDeletion(
    _identity: VerifiedIdentity,
    _assetId: string,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
  ): Promise<CommandResult<StimulusAssetRecord>> {
    return this.unavailable();
  }

  async confirmStimulusAssetDeletion(
    _identity: VerifiedIdentity,
    _assetId: string,
    _correlationId: string,
  ): Promise<StimulusAssetRecord> {
    return this.unavailable();
  }

  async createVisualStimulusProfile(
    _identity: VerifiedIdentity,
    _assetId: string,
    _analysisId: string,
    _profile: VisualStimulusProfile,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
  ): Promise<CommandResult<VisualStimulusProfileRecord>> {
    return this.unavailable();
  }

  async getVisualStimulusProfile(
    _identity: VerifiedIdentity,
    _assetId: string,
  ): Promise<VisualStimulusProfileRecord | null> {
    return this.unavailable();
  }

  async getDemoAudience(
    _identity: VerifiedIdentity,
  ): Promise<AudienceDisclosureRecord> {
    return this.unavailable();
  }

  async getMethodologyRegistry(
    _identity: VerifiedIdentity,
  ): Promise<MethodologyRegistryResponseDto> {
    return this.unavailable();
  }

  async createAudienceDefinition(
    _identity: VerifiedIdentity,
    _organizationId: string,
    _input: AudienceCreateDto,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
  ): Promise<CommandResult<AudienceCommandResponseDto>> {
    return this.unavailable();
  }

  async listAudienceDefinitions(
    _identity: VerifiedIdentity,
    _organizationId: string,
  ): Promise<readonly AudienceRecordDto[]> {
    return this.unavailable();
  }

  async createSimulationConfiguration(
    _identity: VerifiedIdentity,
    _projectId: string,
    _input: SimulationConfigurationCreateDto,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
  ): Promise<CommandResult<SimulationConfigurationResponseDto>> {
    return this.unavailable();
  }

  async listSimulationConfigurations(
    _identity: VerifiedIdentity,
    _projectId: string,
  ): Promise<readonly SimulationConfigurationRecordDto[]> {
    return this.unavailable();
  }

  async getMethodologyPreviewCommand(
    _identity: VerifiedIdentity,
    _projectId: string,
    _input: MethodologyPreviewCreateDto,
    _runId: string,
    _reportId: string,
  ): Promise<MethodologyPreviewCommand> {
    return this.unavailable();
  }

  async createReportArtifact(
    _identity: VerifiedIdentity,
    _runId: string,
    _artifact: Readonly<Record<string, unknown>>,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
  ): Promise<CommandResult<ReportArtifactCommand>> {
    return this.unavailable();
  }

  async getRunReport(
    _identity: VerifiedIdentity,
    _runId: string,
  ): Promise<ReportArtifactRecord> {
    return this.unavailable();
  }

  async getStoredReportArtifact(
    _identity: VerifiedIdentity,
    _reportId: string,
  ): Promise<StoredReportArtifact> {
    return this.unavailable();
  }

  async createVariantGroup(
    _identity: VerifiedIdentity,
    _projectId: string,
    _input: VariantGroupCreateDto,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
  ): Promise<CommandResult<VariantGroupRecord>> {
    return this.unavailable();
  }

  async listVariantGroups(
    _identity: VerifiedIdentity,
    _projectId: string,
  ): Promise<readonly VariantGroupRecord[]> {
    return this.unavailable();
  }

  async getVariantComparisonCommand(
    _identity: VerifiedIdentity,
    _variantGroupId: string,
  ): Promise<VariantComparisonCommand> {
    return this.unavailable();
  }

  async createReportExport(
    _identity: VerifiedIdentity,
    _reportId: string,
    _input: ReportExportCreateDto,
    _rendered: ReportExportRendered,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
  ): Promise<CommandResult<ReportExportCommand>> {
    return this.unavailable();
  }

  async getReportExport(
    _identity: VerifiedIdentity,
    _exportId: string,
  ): Promise<ReportExportDownload> {
    return this.unavailable();
  }

  async createSimulationRun(
    _identity: VerifiedIdentity,
    _projectId: string,
    _stimulusVersionId: string,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
    _traceparent: string,
  ): Promise<CommandResult<SimulationRunResponseDto>> {
    return this.unavailable();
  }

  async createBehavioralDemoRun(
    _identity: VerifiedIdentity,
    _projectId: string,
    _stimulusVersionId: string,
    _variantKey: string,
    _idempotencyKey: string,
    _requestSha256: string,
    _correlationId: string,
    _traceparent: string,
  ): Promise<CommandResult<SimulationRunResponseDto>> {
    return this.unavailable();
  }

  async getSimulationRunReplay(
    _identity: VerifiedIdentity,
    _projectId: string,
    _idempotencyKey: string,
    _requestSha256: string,
  ): Promise<SimulationRunResponseDto | null> {
    return this.unavailable();
  }

  async getSimulationRun(
    _identity: VerifiedIdentity,
    _runId: string,
  ): Promise<SimulationRunResponseDto> {
    return this.unavailable();
  }

  async requestSimulationRunCancel(
    _identity: VerifiedIdentity,
    _runId: string,
    _correlationId: string,
  ): Promise<SimulationRunResponseDto> {
    return this.unavailable();
  }

  async getSimulationResult(
    _identity: VerifiedIdentity,
    _runId: string,
  ): Promise<SimulationResultResponseDto | null> {
    return this.unavailable();
  }

  async getBehavioralResult(
    _identity: VerifiedIdentity,
    _runId: string,
  ): Promise<BehavioralResultResponseDto | null> {
    return this.unavailable();
  }

  async getBehavioralEvidence(
    _identity: VerifiedIdentity,
    _runId: string,
  ): Promise<BehavioralEvidenceResponseDto | null> {
    return this.unavailable();
  }

  async getBehavioralComparison(
    _identity: VerifiedIdentity,
    _baselineRunId: string,
    _candidateRunId: string,
  ): Promise<BehavioralComparisonResponseDto | null> {
    return this.unavailable();
  }

  async getRunAuditHistory(
    _identity: VerifiedIdentity,
    _runId: string,
  ): Promise<RunAuditHistoryResponseDto> {
    return this.unavailable();
  }

  async getSimulationProvenance(
    _identity: VerifiedIdentity,
    _runId: string,
  ): Promise<SimulationProvenanceResponseDto> {
    return this.unavailable();
  }

  private unavailable(): never {
    throw dependencyUnavailable(
      "The authenticated NestJS migration surface is disabled.",
    );
  }
}
