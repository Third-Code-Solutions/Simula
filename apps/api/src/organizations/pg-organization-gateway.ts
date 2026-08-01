import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { isUUID } from "class-validator";
import { createHash } from "node:crypto";
import {
  Pool,
  type PoolClient,
  type PoolConfig,
  type QueryResultRow,
} from "pg";

import type { VerifiedIdentity } from "../auth/identity";
import type {
  AudienceCommandResponseDto,
  AudienceCreateDto,
  AudienceRecordDto,
} from "../audiences/audience.dto";
import type { StimulusAssetReserveDto } from "../assets/stimulus-asset.dto";
import { parseVisualStimulusProfile } from "../assets/visual-profile-engine";
import {
  DOMAIN_DATABASE_POOL,
  DOMAIN_RUNTIME_CONFIG,
} from "../domain/domain.constants";
import type { EnabledDomainRuntime } from "../domain/domain-runtime";
import { AppProblem, dependencyUnavailable } from "../domain/problem";
import type {
  BehavioralActionKind,
  BehavioralComparisonResponseDto,
  BehavioralEvidenceResponseDto,
  BehavioralResultResponseDto,
  ProvenanceAudienceCellDto,
  ProvenanceProviderReceiptDto,
  RunAuditEventDto,
  RunAuditHistoryResponseDto,
  SimulationProvenanceResponseDto,
  SimulationResultResponseDto,
  SimulationRunFailureDto,
  SimulationRunResponseDto,
} from "../runs/run.dto";
import { validatedBehavioralReport } from "../runs/behavioral-report-validator";
import { validatedBehavioralComparison } from "../runs/behavioral-comparison-validator";
import { validatedContextGraph } from "../runs/context-graph-validator";
import { validatedResultArtifact } from "../runs/result-validator";
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
import type { CursorPosition } from "./cursor-codec";
import type {
  AudienceDisclosureRecord,
  CommandResult,
  OrganizationGateway,
  OrganizationDashboardRecord,
  OrganizationDeletionRecord,
  OrganizationRecord,
  OrganizationRole,
  OrganizationStatus,
  MethodologyPreviewCommand,
  ProjectDetailRecord,
  ProjectInput,
  ProjectRecord,
  StimulusRecord,
  StimulusAssetRecord,
  StimulusVersionRecord,
  ReportArtifactCommand,
  ReportArtifactRecord,
  ReportExportCommand,
  ReportExportDownload,
  ReportExportRendered,
  StoredReportArtifact,
  VariantComparisonCommand,
  VariantGroupRecord,
  VariantMemberRecord,
  VisualStimulusProfile,
  VisualStimulusProfileRecord,
} from "./organization-gateway.port";

interface PgFailure {
  readonly code?: string;
  readonly message?: string;
}

function notFound(): AppProblem {
  return new AppProblem(
    404,
    "not_found",
    "Resource not found",
    "The requested resource was not found.",
  );
}

function databaseProblem(error: unknown): AppProblem {
  const failure = error as PgFailure;
  if (
    typeof failure.code === "string" &&
    failure.message !== "version_conflict" &&
    (failure.code.startsWith("08") ||
      failure.code === "53300" ||
      failure.code === "57P01" ||
      failure.code === "40P01" ||
      failure.code === "55P03" ||
      failure.code === "57014" ||
      failure.code === "40001")
  ) {
    return dependencyUnavailable(
      "The request could not reach its durable store. Retry shortly.",
    );
  }
  if (failure.message === "unauthorized") {
    return new AppProblem(
      401,
      "unauthenticated",
      "Authentication required",
      "Sign in again and retry the request.",
    );
  }
  if (failure.message === "forbidden") {
    return new AppProblem(
      403,
      "forbidden",
      "Action forbidden",
      "Your current organization role cannot perform this action.",
    );
  }
  if (failure.message === "not_found") {
    return notFound();
  }
  if (failure.message === "idempotency_key_reused") {
    return new AppProblem(
      409,
      "idempotency_key_reused",
      "Idempotency key reused",
      "Use a new idempotency key for a different request.",
    );
  }
  if (failure.message === "organization_deletion_confirmation_mismatch") {
    return new AppProblem(
      422,
      "validation_error",
      "Workspace confirmation did not match",
      "Enter the exact workspace name to authorize permanent deletion.",
      [{ field: "confirmation", code: "confirmation_mismatch" }],
    );
  }
  if (failure.message === "organization_deletion_active_runs") {
    return new AppProblem(
      409,
      "version_conflict",
      "Workspace has active runs",
      "Cancel active runs and wait for every run to become terminal before deleting this workspace.",
    );
  }
  if (failure.message === "organization_deletion_unavailable") {
    return new AppProblem(
      409,
      "version_conflict",
      "Workspace deletion state conflict",
      "Reload the workspace and retry its pending deletion.",
    );
  }
  if (failure.message === "version_conflict") {
    return new AppProblem(
      409,
      "version_conflict",
      "Project version conflict",
      "Reload the project and apply the change again.",
    );
  }
  if (
    failure.message === "run_result_unavailable" ||
    failure.code === "23505"
  ) {
    return new AppProblem(
      409,
      "version_conflict",
      "Resource version conflict",
      "A conflicting durable artifact already exists or its prerequisite is unavailable.",
    );
  }
  if (
    failure.message === "stimulus_asset_mismatch" ||
    failure.message === "stimulus_asset_unavailable" ||
    failure.message === "visual_profile_mismatch" ||
    failure.message === "visual_profile_unavailable"
  ) {
    return new AppProblem(
      409,
      "version_conflict",
      "Campaign asset state conflict",
      "Reload the asset and retry with the originally reserved bytes.",
    );
  }
  if (
    failure.message === "quota_exceeded" ||
    failure.message === "pending_run_quota_exceeded" ||
    failure.message === "run_retention_quota_exceeded"
  ) {
    return new AppProblem(
      429,
      "quota_exceeded",
      "Resource quota reached",
      "Remove or retire an existing resource before retrying.",
    );
  }
  if (failure.message === "queue_backpressure") {
    return new AppProblem(
      503,
      "queue_backpressure",
      "Run queue is recovering",
      "Run creation is temporarily paused while queued work recovers.",
      [],
      30,
    );
  }
  if (failure.message === "unsupported_scope") {
    return new AppProblem(
      422,
      "unsupported_scope",
      "Unsupported project scope",
      "Phase 2 supports English campaign messages for the Philippines only.",
    );
  }
  if (failure.message?.startsWith("invalid_") === true) {
    return new AppProblem(
      422,
      "validation_error",
      "Request validation failed",
      "One or more fields are invalid.",
      [{ field: "request", code: failure.message }],
    );
  }
  return new AppProblem(
    500,
    "internal_error",
    "Internal server error",
    "The request could not be completed. Use the correlation ID for support.",
  );
}

export function createDomainPool(config: EnabledDomainRuntime): Pool {
  const url = new URL(config.databaseUrl);
  url.searchParams.delete("sslmode");
  const poolConfig: PoolConfig = {
    connectionString: url.toString(),
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 10_000,
    max: 10,
    maxLifetimeSeconds: 300,
    ...(config.databaseCaPem === null
      ? {}
      : {
          ssl: {
            ca: config.databaseCaPem,
            rejectUnauthorized: true,
          },
        }),
  };
  return new Pool(poolConfig);
}

function databaseClaims(identity: VerifiedIdentity): string {
  return JSON.stringify({
    sub: identity.userId,
    role: "authenticated",
    iss: identity.issuer,
    aud: "authenticated",
    exp: identity.expiresAt,
  });
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error("database returned an invalid enum");
  }
  return value as T;
}

function exactString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`database returned an invalid ${name}`);
  }
  return value;
}

function keyValue(value: unknown, name: string): string {
  const result = exactString(value, name);
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(result)) {
    throw new Error(`database returned an invalid ${name}`);
  }
  return result;
}

function nonnegativeIntegerString(value: unknown, name: string): string {
  if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  throw new Error(`database returned an invalid ${name}`);
}

function uuidValue(value: unknown, name: string): string {
  const result = exactString(value, name);
  if (!isUUID(result) || result !== result.toLowerCase()) {
    throw new Error(`database returned an invalid ${name}`);
  }
  return result;
}

function timestampValue(value: unknown, name: string): string {
  const result = exactString(value, name);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(result) ||
    Number.isNaN(Date.parse(result))
  ) {
    throw new Error(`database returned an invalid ${name}`);
  }
  return result;
}

function integerValue(
  value: unknown,
  name: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`database returned an invalid ${name}`);
  }
  return value;
}

function boundedNumber(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`database returned an invalid ${name}`);
  }
  return value;
}

function booleanValue(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`database returned an invalid ${name}`);
  }
  return value;
}

function jsonObject(
  value: unknown,
  name: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`database returned an invalid ${name}`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function jsonArray(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`database returned an invalid ${name}`);
  }
  return value;
}

function sha256Field(value: unknown, name: string): string {
  const result = exactString(value, name);
  if (!/^[0-9a-f]{64}$/.test(result)) {
    throw new Error(`database returned an invalid ${name}`);
  }
  return result;
}

function flexibleTimestamp(value: unknown, name: string): string {
  const result =
    value instanceof Date ? value.toISOString() : exactString(value, name);
  if (Number.isNaN(Date.parse(result))) {
    throw new Error(`database returned an invalid ${name}`);
  }
  return result;
}

function limitations(value: unknown, name: string): readonly string[] {
  if (typeof value === "string" && value.length > 0) {
    return Object.freeze([value]);
  }
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.length > 0)
  ) {
    return Object.freeze([...value] as string[]);
  }
  throw new Error(`database returned invalid ${name}`);
}

function commandPayload(
  value: unknown,
  name: string,
): Readonly<Record<string, unknown>> {
  return jsonObject(value, `${name} payload`);
}

function audienceCommand(
  payload: Readonly<Record<string, unknown>>,
): AudienceCommandResponseDto {
  return Object.freeze({
    audience_id: uuidValue(payload.audience_id, "audience id"),
    audience_version_id: uuidValue(
      payload.audience_version_id,
      "audience version id",
    ),
    version: integerValue(payload.version, "audience version", 1),
    name: exactString(payload.name, "audience name"),
    kind: enumValue(payload.kind, ["synthetic_cohort"] as const),
    admission_status: enumValue(payload.admission_status, [
      "approved_experimental",
    ] as const),
    checksum_sha256: sha256Field(payload.checksum_sha256, "audience checksum"),
    created_at: flexibleTimestamp(payload.created_at, "audience creation time"),
    replayed: booleanValue(payload.replayed, "audience replay state"),
  });
}

function audienceRecord(row: QueryResultRow): AudienceRecordDto {
  return Object.freeze({
    audience_id: uuidValue(row.audience_id, "audience id"),
    audience_version_id: uuidValue(
      row.audience_version_id,
      "audience version id",
    ),
    version: integerValue(row.version, "audience version", 1),
    name: exactString(row.name, "audience name"),
    kind: enumValue(row.kind, ["synthetic_cohort"] as const),
    admission_status: enumValue(row.admission_status, [
      "approved_experimental",
    ] as const),
    manifest: jsonObject(row.manifest, "audience manifest"),
    checksum_sha256: sha256Field(row.checksum_sha256, "audience checksum"),
    is_non_representative: booleanValue(
      row.is_non_representative,
      "audience representation flag",
    ),
    limitations: exactString(row.limitations, "audience limitations"),
    created_at: flexibleTimestamp(row.created_at, "audience creation time"),
  });
}

function simulationConfiguration(
  payload: Readonly<Record<string, unknown>>,
): SimulationConfigurationResponseDto {
  return Object.freeze({
    configuration_id: uuidValue(payload.configuration_id, "configuration id"),
    configuration_version_id: uuidValue(
      payload.configuration_version_id,
      "configuration version id",
    ),
    version: integerValue(payload.version, "configuration version", 1),
    name: exactString(payload.name, "configuration name"),
    project_id: uuidValue(payload.project_id, "configuration project id"),
    audience_version_id: uuidValue(
      payload.audience_version_id,
      "configuration audience version id",
    ),
    population_frame_version_id: uuidValue(
      payload.population_frame_version_id,
      "configuration population version id",
    ),
    methodology_version_id: uuidValue(
      payload.methodology_version_id,
      "configuration methodology version id",
    ),
    provider_configuration_version_id: uuidValue(
      payload.provider_configuration_version_id,
      "configuration provider version id",
    ),
    sampling_configuration: jsonObject(
      payload.sampling_configuration,
      "sampling configuration",
    ),
    cost_ceiling_microusd: integerValue(
      payload.cost_ceiling_microusd,
      "configuration cost ceiling",
      0,
      100_000_000,
    ),
    checksum_sha256: sha256Field(
      payload.checksum_sha256,
      "configuration checksum",
    ),
    created_at: flexibleTimestamp(
      payload.created_at,
      "configuration creation time",
    ),
    replayed: booleanValue(payload.replayed, "configuration replay state"),
  });
}

function simulationConfigurationRecord(
  row: QueryResultRow,
): SimulationConfigurationRecordDto {
  const parsed = simulationConfiguration({ ...row, replayed: false });
  const { replayed: _replayed, ...record } = parsed;
  return Object.freeze(record);
}

function variantMember(value: unknown): VariantMemberRecord {
  const member = jsonObject(value, "variant member");
  const variantKey = exactString(member.variant_key, "variant key");
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(variantKey)) {
    throw new Error("database returned an invalid variant key");
  }
  const label = exactString(member.label, "variant label");
  if (label.trim() !== label || label.length < 1 || label.length > 80) {
    throw new Error("database returned an invalid variant label");
  }
  return Object.freeze({
    id: uuidValue(member.id, "variant member id"),
    stimulus_version_id: uuidValue(
      member.stimulus_version_id,
      "variant stimulus version id",
    ),
    variant_key: variantKey,
    label,
    sort_order: integerValue(member.sort_order, "variant sort order", 1, 10),
  });
}

function variantGroup(
  value: Readonly<Record<string, unknown>>,
): VariantGroupRecord {
  const name = exactString(value.name, "variant group name");
  if (name.trim() !== name || name.length < 2 || name.length > 120) {
    throw new Error("database returned an invalid variant group name");
  }
  const members = Object.freeze(
    jsonArray(value.members, "variant group members").map(variantMember),
  );
  if (members.length < 2 || members.length > 10) {
    throw new Error("database returned invalid variant group members");
  }
  const replayed =
    value.replayed === undefined
      ? undefined
      : booleanValue(value.replayed, "variant group replay state");
  return Object.freeze({
    variant_group_id: uuidValue(value.variant_group_id, "variant group id"),
    project_id: uuidValue(value.project_id, "variant group project id"),
    name,
    members,
    created_at: flexibleTimestamp(
      value.created_at,
      "variant group creation time",
    ),
    ...(replayed === undefined ? {} : { replayed }),
  });
}

function reportArtifactRecord(row: QueryResultRow): ReportArtifactRecord {
  const reportId = uuidValue(row.report_id, "report id");
  const runId = uuidValue(row.run_id, "report run id");
  const artifact = jsonObject(row.artifact, "report artifact");
  const identity = jsonObject(artifact.identity, "report identity");
  if (
    artifact.schema_version !== "2.0.0" ||
    identity.report_id !== reportId ||
    identity.run_id !== runId
  ) {
    throw new Error("database returned an unbound report artifact");
  }
  return Object.freeze({
    report_id: reportId,
    run_id: runId,
    schema_version: "2.0.0",
    artifact,
    content_sha256: sha256Field(row.content_sha256, "report checksum"),
    created_at: flexibleTimestamp(row.created_at, "report creation time"),
  });
}

function reportArtifactCommand(
  payload: Readonly<Record<string, unknown>>,
): ReportArtifactCommand {
  if (payload.schema_version !== "2.0.0") {
    throw new Error("database returned an invalid report schema");
  }
  return Object.freeze({
    report_id: uuidValue(payload.report_id, "report id"),
    run_id: uuidValue(payload.run_id, "report run id"),
    schema_version: "2.0.0",
    content_sha256: sha256Field(payload.content_sha256, "report checksum"),
    created_at: flexibleTimestamp(payload.created_at, "report creation time"),
    replayed: booleanValue(payload.replayed, "report replay state"),
  });
}

function reportExportCommand(
  payload: Readonly<Record<string, unknown>>,
): ReportExportCommand {
  const filename = exactString(payload.filename, "export filename");
  if (!/^[a-z0-9][a-z0-9_.-]{0,119}$/.test(filename)) {
    throw new Error("database returned an invalid export filename");
  }
  return Object.freeze({
    export_id: uuidValue(payload.export_id, "export id"),
    report_id: uuidValue(payload.report_id, "export report id"),
    format: enumValue(payload.format, ["json", "csv"] as const),
    filename,
    content_sha256: sha256Field(payload.content_sha256, "export checksum"),
    expires_at: flexibleTimestamp(payload.expires_at, "export expiry"),
    created_at: flexibleTimestamp(payload.created_at, "export creation time"),
    replayed: booleanValue(payload.replayed, "export replay state"),
  });
}

function stimulusAssetRecord(
  value: Readonly<Record<string, unknown>>,
): StimulusAssetRecord {
  const assetId = uuidValue(value.asset_id, "stimulus asset id");
  const organizationId = uuidValue(
    value.organization_id,
    "stimulus asset organization id",
  );
  const stimulusId = uuidValue(value.stimulus_id, "stimulus asset stimulus id");
  const expectedByteSize = integerValue(
    value.expected_byte_size,
    "stimulus asset expected byte size",
    1,
    16_777_216,
  );
  const expectedContentSha256 = sha256Field(
    value.expected_content_sha256,
    "stimulus asset expected checksum",
  );
  const filename = exactString(value.filename, "stimulus asset filename");
  if (!/^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9_. -]{0,119}$/.test(filename)) {
    throw new Error("database returned an invalid stimulus asset filename");
  }
  const status = enumValue(value.status, [
    "pending_upload",
    "available",
    "deletion_requested",
    "deleted",
  ] as const);
  const byteSize =
    value.byte_size === null
      ? null
      : integerValue(
          value.byte_size,
          "stimulus asset byte size",
          1,
          16_777_216,
        );
  const contentSha256 =
    value.content_sha256 === null
      ? null
      : sha256Field(value.content_sha256, "stimulus asset checksum");
  if (
    (byteSize === null) !== (contentSha256 === null) ||
    (status === "available" &&
      (byteSize !== expectedByteSize ||
        contentSha256 !== expectedContentSha256))
  ) {
    throw new Error("database returned an unbound stimulus asset");
  }
  const storageObjectName = exactString(
    value.storage_object_name,
    "stimulus asset object name",
  );
  if (
    storageObjectName !==
    `${organizationId}/${stimulusId}/${assetId}/${expectedContentSha256}`
  ) {
    throw new Error("database returned an invalid stimulus asset object");
  }
  return Object.freeze({
    asset_id: assetId,
    organization_id: organizationId,
    stimulus_id: stimulusId,
    storage_bucket_id: enumValue(value.storage_bucket_id, [
      "simula-private-assets",
    ] as const),
    storage_object_name: storageObjectName,
    filename,
    media_type: enumValue(value.media_type, [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
    ] as const),
    expected_byte_size: expectedByteSize,
    expected_content_sha256: expectedContentSha256,
    byte_size: byteSize,
    content_sha256: contentSha256,
    status,
    retention_until: flexibleTimestamp(
      value.retention_until,
      "stimulus asset retention",
    ),
    created_at: flexibleTimestamp(
      value.created_at,
      "stimulus asset creation time",
    ),
    replayed:
      value.replayed === undefined
        ? false
        : booleanValue(value.replayed, "stimulus asset replay state"),
  });
}

function visualStimulusProfileRecord(
  value: Readonly<Record<string, unknown>>,
): VisualStimulusProfileRecord {
  const analysisId = uuidValue(value.analysis_id, "visual analysis id");
  const assetId = uuidValue(value.asset_id, "visual profile asset id");
  const organizationId = uuidValue(
    value.organization_id,
    "visual profile organization id",
  );
  const stimulusId = uuidValue(value.stimulus_id, "visual profile stimulus id");
  const assetContentSha256 = sha256Field(
    value.asset_content_sha256,
    "visual profile asset checksum",
  );
  const profileChecksumSha256 = sha256Field(
    value.profile_checksum_sha256,
    "visual profile checksum",
  );
  const profile = parseVisualStimulusProfile(value.profile, analysisId, {
    asset_id: assetId,
    organization_id: organizationId,
    stimulus_id: stimulusId,
    media_type: enumValue(value.asset_media_type, [
      "image/jpeg",
      "image/png",
      "image/webp",
    ] as const),
    byte_size: integerValue(
      value.asset_byte_size,
      "visual profile asset byte size",
      1,
      16_777_216,
    ),
    content_sha256: assetContentSha256,
  });
  if (profile.checksum_sha256 !== profileChecksumSha256) {
    throw new Error("database returned an unbound visual profile");
  }
  return Object.freeze({
    analysis_id: analysisId,
    asset_id: assetId,
    organization_id: organizationId,
    stimulus_id: stimulusId,
    asset_content_sha256: assetContentSha256,
    profile_checksum_sha256: profileChecksumSha256,
    profile,
    created_at: flexibleTimestamp(
      value.created_at,
      "visual profile creation time",
    ),
    replayed:
      value.replayed === undefined
        ? false
        : booleanValue(value.replayed, "visual profile replay state"),
  });
}

function populationRegistryRecord(
  row: QueryResultRow,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: uuidValue(row.id, "population version id"),
    population_frame_id: uuidValue(
      row.population_frame_id,
      "population frame id",
    ),
    version: integerValue(row.version, "population version", 1),
    validation_status: enumValue(row.validation_status, [
      "experimental",
      "benchmarked",
      "calibrated",
      "retired",
    ] as const),
    manifest: jsonObject(row.manifest, "population manifest"),
    checksum_sha256: sha256Field(row.checksum_sha256, "population checksum"),
    created_at: timestampValue(row.created_at, "population creation time"),
  });
}

function methodologyRegistryRecord(
  row: QueryResultRow,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: uuidValue(row.id, "methodology version id"),
    methodology_key: keyValue(row.methodology_key, "methodology key"),
    version: integerValue(row.version, "methodology version", 1),
    validation_status: enumValue(row.validation_status, [
      "experimental",
      "benchmarked",
      "calibrated",
      "retired",
    ] as const),
    manifest: jsonObject(row.manifest, "methodology manifest"),
    checksum_sha256: sha256Field(row.checksum_sha256, "methodology checksum"),
    created_at: timestampValue(row.created_at, "methodology creation time"),
  });
}

function providerRegistryRecord(
  row: QueryResultRow,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: uuidValue(row.id, "provider configuration id"),
    provider_id: keyValue(row.provider_id, "provider id"),
    version: integerValue(row.version, "provider version", 1),
    admission_status: enumValue(row.admission_status, [
      "approved_demo",
      "approved_external",
      "disabled",
      "retired",
    ] as const),
    external_provider: booleanValue(
      row.external_provider,
      "external provider flag",
    ),
    model_id: exactString(row.model_id, "provider model id"),
    template_id: keyValue(row.template_id, "provider template id"),
    limits: jsonObject(row.limits, "provider limits"),
    checksum_sha256: sha256Field(row.checksum_sha256, "provider checksum"),
    created_at: timestampValue(row.created_at, "provider creation time"),
  });
}

function stringArray(value: unknown, name: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string")
  ) {
    throw new Error(`database returned an invalid ${name}`);
  }
  return value as readonly string[];
}

const BEHAVIORAL_ACTION_KINDS = Object.freeze([
  "attend",
  "resonate",
  "question",
  "reject",
  "share",
  "discuss",
  "reconsider",
  "ignore",
] as const satisfies readonly BehavioralActionKind[]);

function behavioralActionShares(
  value: unknown,
  name: string,
): readonly (readonly [BehavioralActionKind, number])[] {
  if (
    !Array.isArray(value) ||
    value.length !== BEHAVIORAL_ACTION_KINDS.length
  ) {
    throw new Error(`database returned invalid ${name}`);
  }
  const shares = value.map((item, index) => {
    if (!Array.isArray(item) || item.length !== 2) {
      throw new Error(`database returned invalid ${name}`);
    }
    const action = enumValue(item[0], BEHAVIORAL_ACTION_KINDS);
    const share = boundedNumber(item[1], `${name} share`, 0, 1);
    if (action !== BEHAVIORAL_ACTION_KINDS[index]) {
      throw new Error(`database returned noncanonical ${name}`);
    }
    return Object.freeze([action, share] as const);
  });
  const total = shares.reduce((sum, item) => sum + item[1], 0);
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`database returned invalid ${name} total`);
  }
  return Object.freeze(shares);
}

function organization(row: QueryResultRow): OrganizationRecord {
  if (
    typeof row.id !== "string" ||
    !isUUID(row.id) ||
    row.id !== row.id.toLowerCase() ||
    typeof row.name !== "string" ||
    typeof row.created_at !== "string"
  ) {
    throw new Error("database returned an invalid organization");
  }
  return Object.freeze({
    id: row.id,
    name: row.name,
    role: enumValue<OrganizationRole>(row.role, ["owner", "editor", "viewer"]),
    status: enumValue<OrganizationStatus>(row.status, [
      "active",
      "disabled",
      "deleted",
    ]),
    created_at: row.created_at,
  });
}

function organizationDeletion(value: unknown): OrganizationDeletionRecord {
  const payload = commandPayload(value, "organization deletion");
  const organizationId = uuidValue(
    payload.organization_id,
    "organization deletion organization id",
  );
  const manifest = jsonObject(
    payload.resource_manifest,
    "organization deletion manifest",
  );
  const storageObjects = jsonArray(
    manifest.storage_objects,
    "organization deletion storage objects",
  ).map((item) => {
    const objectName = exactString(
      item,
      "organization deletion storage object",
    );
    if (
      objectName.length > 512 ||
      !objectName.startsWith(`${organizationId}/`) ||
      !/^[0-9a-f/-]+$/.test(objectName)
    ) {
      throw new Error(
        "database returned an invalid organization deletion storage object",
      );
    }
    return objectName;
  });
  const runIds = jsonArray(
    manifest.run_ids,
    "organization deletion run ids",
  ).map((item) => uuidValue(item, "organization deletion run id"));
  if (
    new Set(storageObjects).size !== storageObjects.length ||
    new Set(runIds).size !== runIds.length
  ) {
    throw new Error(
      "database returned a duplicate organization deletion resource",
    );
  }
  const status = enumValue(payload.status, ["pending", "completed"] as const);
  const completedAt =
    payload.completed_at === null
      ? null
      : flexibleTimestamp(
          payload.completed_at,
          "organization deletion completion time",
        );
  if (
    (status === "pending" && completedAt !== null) ||
    (status === "completed" &&
      (completedAt === null ||
        storageObjects.length !== 0 ||
        runIds.length !== 0))
  ) {
    throw new Error(
      "database returned an invalid organization deletion completion state",
    );
  }
  return Object.freeze({
    request_id: uuidValue(
      payload.request_id,
      "organization deletion request id",
    ),
    organization_id: organizationId,
    status,
    storage_objects: Object.freeze(storageObjects),
    run_ids: Object.freeze(runIds),
    requested_at: flexibleTimestamp(
      payload.requested_at,
      "organization deletion request time",
    ),
    completed_at: completedAt,
    replayed: booleanValue(payload.replayed, "organization deletion replay"),
  });
}

function organizationDashboard(value: unknown): OrganizationDashboardRecord {
  const payload = jsonObject(value, "organization dashboard");
  const permissions = jsonObject(
    payload.permissions,
    "organization dashboard permissions",
  );
  const metrics = jsonObject(payload.metrics, "organization dashboard metrics");
  const recentProjects = jsonArray(
    payload.recent_projects,
    "organization dashboard projects",
  ).map((item) => {
    const project = jsonObject(item, "organization dashboard project");
    return Object.freeze({
      id: uuidValue(project.id, "dashboard project id"),
      name: exactString(project.name, "dashboard project name"),
      objective: exactString(project.objective, "dashboard project objective"),
      status: enumValue(project.status, [
        "active",
        "archived",
        "deleted",
      ] as const),
      version: integerValue(project.version, "dashboard project version", 1),
      updated_at: flexibleTimestamp(
        project.updated_at,
        "dashboard project update time",
      ),
    });
  });
  const recentRuns = jsonArray(
    payload.recent_runs,
    "organization dashboard runs",
  ).map((item) => {
    const run = jsonObject(item, "organization dashboard run");
    return Object.freeze({
      id: uuidValue(run.id, "dashboard run id"),
      project_id: uuidValue(run.project_id, "dashboard run project id"),
      project_name: exactString(run.project_name, "dashboard run project name"),
      state: enumValue(run.state, [
        "queued",
        "running",
        "retrying",
        "cancel_requested",
        "canceled",
        "succeeded",
        "failed",
      ] as const),
      created_at: flexibleTimestamp(
        run.created_at,
        "dashboard run creation time",
      ),
    });
  });
  const recentReports = jsonArray(
    payload.recent_reports,
    "organization dashboard reports",
  ).map((item) => {
    const report = jsonObject(item, "organization dashboard report");
    return Object.freeze({
      id: uuidValue(report.id, "dashboard report id"),
      run_id: uuidValue(report.run_id, "dashboard report run id"),
      project_id: uuidValue(report.project_id, "dashboard report project id"),
      project_name: exactString(
        report.project_name,
        "dashboard report project name",
      ),
      created_at: flexibleTimestamp(
        report.created_at,
        "dashboard report creation time",
      ),
    });
  });
  return Object.freeze({
    organization_id: uuidValue(
      payload.organization_id,
      "dashboard organization id",
    ),
    organization_name: exactString(
      payload.organization_name,
      "dashboard organization name",
    ),
    organization_status: enumValue(payload.organization_status, [
      "active",
      "disabled",
      "deleted",
    ] as const),
    role: enumValue(payload.role, ["owner", "editor", "viewer"] as const),
    platform_role:
      payload.platform_role === null
        ? null
        : enumValue(payload.platform_role, ["superadmin"] as const),
    permissions: Object.freeze({
      can_create_projects: booleanValue(
        permissions.can_create_projects,
        "dashboard project permission",
      ),
      can_create_runs: booleanValue(
        permissions.can_create_runs,
        "dashboard run permission",
      ),
      can_manage_team: booleanValue(
        permissions.can_manage_team,
        "dashboard team permission",
      ),
      can_manage_settings: booleanValue(
        permissions.can_manage_settings,
        "dashboard settings permission",
      ),
      can_view_audit: booleanValue(
        permissions.can_view_audit,
        "dashboard audit permission",
      ),
    }),
    metrics: Object.freeze({
      projects: integerValue(metrics.projects, "dashboard project count", 0),
      audiences: integerValue(metrics.audiences, "dashboard audience count", 0),
      runs: integerValue(metrics.runs, "dashboard run count", 0),
      active_runs: integerValue(
        metrics.active_runs,
        "dashboard active run count",
        0,
      ),
      succeeded_runs: integerValue(
        metrics.succeeded_runs,
        "dashboard succeeded run count",
        0,
      ),
      failed_runs: integerValue(
        metrics.failed_runs,
        "dashboard failed run count",
        0,
      ),
      reports: integerValue(metrics.reports, "dashboard report count", 0),
      feedback_records: integerValue(
        metrics.feedback_records,
        "dashboard feedback count",
        0,
      ),
    }),
    recent_projects: Object.freeze(recentProjects),
    recent_runs: Object.freeze(recentRuns),
    recent_reports: Object.freeze(recentReports),
    generated_at: flexibleTimestamp(
      payload.generated_at,
      "dashboard generation time",
    ),
  });
}

function project(row: QueryResultRow): ProjectRecord {
  return Object.freeze({
    id: uuidValue(row.id, "project id"),
    organization_id: uuidValue(row.organization_id, "project organization id"),
    name: exactString(row.name, "project name"),
    objective: exactString(row.objective, "project objective"),
    market: enumValue(row.market, ["philippines"] as const),
    language: enumValue(row.language, ["en"] as const),
    category: enumValue(row.category, ["campaign_message"] as const),
    status: enumValue(row.status, ["active", "archived", "deleted"] as const),
    version: integerValue(row.version, "project version", 1),
    created_at: timestampValue(row.created_at, "project creation time"),
    updated_at: timestampValue(row.updated_at, "project update time"),
  });
}

function stimulusVersion(row: QueryResultRow): StimulusVersionRecord {
  const contentSha256 = exactString(
    row.content_sha256,
    "stimulus content checksum",
  );
  if (!/^[0-9a-f]{64}$/.test(contentSha256)) {
    throw new Error("database returned an invalid stimulus checksum");
  }
  return Object.freeze({
    id: uuidValue(row.version_id ?? row.id, "stimulus version id"),
    organization_id: uuidValue(
      row.organization_id,
      "stimulus version organization id",
    ),
    stimulus_id: uuidValue(row.stimulus_id, "stimulus id"),
    version: integerValue(
      row.stimulus_version ?? row.version,
      "stimulus version",
      1,
      20,
    ),
    content: exactString(row.content, "stimulus content"),
    content_sha256: contentSha256,
    created_at: timestampValue(
      row.version_created_at ?? row.created_at,
      "stimulus version creation time",
    ),
  });
}

function stimulus(row: QueryResultRow): StimulusRecord {
  return Object.freeze({
    id: uuidValue(row.stimulus_id ?? row.id, "stimulus id"),
    organization_id: uuidValue(row.organization_id, "stimulus organization id"),
    project_id: uuidValue(row.project_id, "stimulus project id"),
    name: exactString(row.stimulus_name ?? row.name, "stimulus name"),
    status: enumValue(row.stimulus_status ?? row.status, [
      "active",
      "retired",
      "deleted",
    ] as const),
    created_at: timestampValue(
      row.stimulus_created_at ?? row.created_at,
      "stimulus creation time",
    ),
    versions: Object.freeze([stimulusVersion(row)]),
  });
}

function sha256Content(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function nullableTimestamp(value: unknown, name: string): string | null {
  return value === null ? null : timestampValue(value, name);
}

function sha256Value(value: unknown, name: string): string {
  const result = exactString(value, name);
  if (!/^[0-9a-f]{64}$/.test(result)) {
    throw new Error(`database returned an invalid ${name}`);
  }
  return result;
}

function exactZero(value: unknown, name: string): 0 {
  if (value !== 0 && value !== "0") {
    throw new Error(`database returned an invalid ${name}`);
  }
  return 0;
}

function runFailure(
  row: QueryResultRow,
  state: SimulationRunResponseDto["state"],
): SimulationRunFailureDto | null {
  if (state !== "failed") {
    if (
      row.terminal_error_code !== undefined &&
      row.terminal_error_code !== null
    ) {
      throw new Error("database returned failure context for a live run");
    }
    return null;
  }
  const code = exactString(row.terminal_error_code, "run terminal error code");
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(code)) {
    throw new Error("database returned an invalid run failure code");
  }
  return Object.freeze({
    code,
    correlation_id: uuidValue(row.correlation_id, "run failure correlation id"),
    guidance:
      "No substitute result was generated. Retry or use the correlation ID for support.",
  });
}

function simulationRun(row: QueryResultRow): SimulationRunResponseDto {
  const id = uuidValue(row.run_id ?? row.id, "simulation run id");
  const state = enumValue(row.run_state ?? row.state, [
    "queued",
    "running",
    "retrying",
    "cancel_requested",
    "succeeded",
    "failed",
    "canceled",
  ] as const);
  const dispatchGeneration = integerValue(
    row.dispatch_generation,
    "run dispatch generation",
    1,
    3,
  );
  const schemaVersion = integerValue(
    row.schema_version,
    "run schema version",
    1,
    2,
  ) as 1 | 2;
  const expectedJobId =
    schemaVersion === 1
      ? `run:${id}:dispatch:${dispatchGeneration}`
      : `run-${id}-generation-${dispatchGeneration}`;
  const jobId =
    row.job_id === undefined
      ? expectedJobId
      : exactString(row.job_id, "run job id");
  if (jobId !== expectedJobId) {
    throw new Error("database returned an invalid simulation run contract");
  }
  return Object.freeze({
    id,
    organization_id: uuidValue(row.organization_id, "run organization id"),
    project_id: uuidValue(row.project_id, "run project id"),
    stimulus_version_id: uuidValue(
      row.stimulus_version_id,
      "run stimulus version id",
    ),
    audience_version_id: uuidValue(
      row.audience_version_id,
      "run audience version id",
    ),
    state,
    schema_version: schemaVersion,
    dispatch_generation: dispatchGeneration,
    job_id: jobId,
    version: integerValue(row.run_version ?? row.version, "run version", 1),
    created_at: timestampValue(row.created_at, "run creation time"),
    failure: runFailure(row, state),
  });
}

const RUN_STATES = Object.freeze([
  "queued",
  "running",
  "retrying",
  "cancel_requested",
  "succeeded",
  "failed",
  "canceled",
] as const);

function runAuditEvent(row: QueryResultRow): RunAuditEventDto {
  const previousState =
    row.previous_state === null
      ? null
      : enumValue(row.previous_state, RUN_STATES);
  const attemptNumber =
    row.attempt_number === null
      ? null
      : integerValue(row.attempt_number, "run audit attempt number", 1, 3);
  const safeReason =
    row.safe_reason === null
      ? null
      : keyValue(row.safe_reason, "run audit safe reason");
  return Object.freeze({
    event_id: uuidValue(row.event_id, "run audit event id"),
    previous_state: previousState,
    new_state: enumValue(row.new_state, RUN_STATES),
    attempt_number: attemptNumber,
    safe_reason: safeReason,
    actor_type: enumValue(row.actor_type, [
      "user",
      "worker",
      "system",
    ] as const),
    correlation_id: uuidValue(row.correlation_id, "run audit correlation id"),
    created_at: timestampValue(row.created_at, "run audit creation time"),
  });
}

function provenanceCells(value: unknown): readonly ProvenanceAudienceCellDto[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("database returned invalid provenance audience cells");
  }
  return Object.freeze(
    value.map((cell) => {
      const record = jsonObject(cell, "provenance audience cell");
      if (record.key !== "authored_demo") {
        throw new Error("database returned invalid provenance audience cell");
      }
      const weight = record.weight;
      if (
        typeof weight !== "number" ||
        !Number.isFinite(weight) ||
        weight <= 0 ||
        weight > 1
      ) {
        throw new Error("database returned invalid provenance audience weight");
      }
      return Object.freeze({ key: "authored_demo" as const, weight });
    }),
  );
}

@Injectable()
export class PgOrganizationGateway
  implements OrganizationGateway, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor(
    @Inject(DOMAIN_RUNTIME_CONFIG)
    private readonly config: EnabledDomainRuntime,
    @Inject(DOMAIN_DATABASE_POOL)
    pool: Pool,
  ) {
    this.pool = pool;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async isReady(): Promise<boolean> {
    try {
      const result = await this.pool.query<{
        migration_version: string;
        rls_force_enabled: boolean;
      }>(
        `
        select
          readiness.migration_version::text as migration_version,
          readiness.rls_force_enabled
        from private.runtime_schema_readiness() as readiness
        `,
      );
      return (
        result.rows.length === 1 &&
        result.rows[0]?.migration_version === this.config.migrationHead &&
        result.rows[0]?.rls_force_enabled === true
      );
    } catch {
      return false;
    }
  }

  async recordSignInSuccess(
    identity: VerifiedIdentity,
    correlationId: string,
  ): Promise<boolean> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<{ recorded: boolean }>(
          `
          select api.record_sign_in_success(
            $1::uuid,
            $2::uuid
          ) as recorded
          `,
          [identity.sessionId, correlationId],
        );
        const recorded = result.rows[0]?.recorded;
        if (typeof recorded !== "boolean") {
          throw new Error("sign-in audit command returned an invalid result");
        }
        return recorded;
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async listOrganizations(
    identity: VerifiedIdentity,
    after: CursorPosition | null,
    limit: number,
  ): Promise<readonly OrganizationRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 101) {
      throw new Error("organization query limit is outside its contract");
    }
    try {
      return await this.transaction(identity, async (client) => {
        const predicate =
          after === null
            ? ""
            : "and (organizations.created_at, organizations.id) > ($1::timestamptz, $2::uuid)";
        const parameters =
          after === null ? [limit] : [after.createdAt, after.resourceId, limit];
        const limitParameter = after === null ? "$1" : "$3";
        const result = await client.query(
          `
          select
            organizations.id::text as id,
            organizations.name,
            case
              when private.is_platform_superadmin(private.verified_subject())
                then 'owner'::api.organization_role
              else memberships.role
            end::text as role,
            organizations.status::text as status,
            pg_catalog.to_char(
              organizations.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.organizations as organizations
          left join api.organization_memberships as memberships
            on memberships.organization_id = organizations.id
           and memberships.user_id = private.verified_subject()
          where (
            memberships.user_id is not null
            or private.is_platform_superadmin(private.verified_subject())
          )
            ${predicate}
          order by organizations.created_at, organizations.id
          limit ${limitParameter}
          `,
          parameters,
        );
        return result.rows.map(organization);
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getOrganizationDashboard(
    identity: VerifiedIdentity,
    organizationId: string,
  ): Promise<OrganizationDashboardRecord> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          `
          select pg_catalog.jsonb_build_object(
            'organization_id', organizations.id,
            'organization_name', organizations.name,
            'organization_status', organizations.status,
            'role', case
              when private.is_platform_superadmin(private.verified_subject())
                then 'owner'
              else memberships.role::text
            end,
            'platform_role', case
              when private.is_platform_superadmin(private.verified_subject())
                then 'superadmin'
              else null
            end,
            'permissions', pg_catalog.jsonb_build_object(
              'can_create_projects',
                private.is_platform_superadmin(private.verified_subject())
                or memberships.role in ('owner', 'editor'),
              'can_create_runs',
                private.is_platform_superadmin(private.verified_subject())
                or memberships.role in ('owner', 'editor'),
              'can_manage_team',
                private.is_platform_superadmin(private.verified_subject())
                or memberships.role = 'owner',
              'can_manage_settings',
                private.is_platform_superadmin(private.verified_subject())
                or memberships.role = 'owner',
              'can_view_audit',
                private.is_platform_superadmin(private.verified_subject())
                or memberships.role = 'owner'
            ),
            'metrics', pg_catalog.jsonb_build_object(
              'projects', (
                select pg_catalog.count(*) from api.projects
                where organization_id = organizations.id
                  and status <> 'deleted'
              ),
              'audiences', (
                select pg_catalog.count(*) from api.audiences
                where organization_id = organizations.id
              ),
              'runs', (
                select pg_catalog.count(*) from api.simulation_runs
                where organization_id = organizations.id
              ),
              'active_runs', (
                select pg_catalog.count(*) from api.simulation_runs
                where organization_id = organizations.id
                  and state in (
                    'queued',
                    'running',
                    'retrying',
                    'cancel_requested'
                  )
              ),
              'succeeded_runs', (
                select pg_catalog.count(*) from api.simulation_runs
                where organization_id = organizations.id
                  and state = 'succeeded'
              ),
              'failed_runs', (
                select pg_catalog.count(*) from api.simulation_runs
                where organization_id = organizations.id
                  and state = 'failed'
              ),
              'reports', (
                select pg_catalog.count(*) from api.report_artifacts
                where organization_id = organizations.id
              ),
              'feedback_records', (
                select pg_catalog.count(*) from api.feedback_records
                where organization_id = organizations.id
              )
            ),
            'recent_projects', coalesce((
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'id', recent.id,
                  'name', recent.name,
                  'objective', recent.objective,
                  'status', recent.status,
                  'version', recent.version,
                  'updated_at', recent.updated_at
                )
                order by recent.updated_at desc, recent.id desc
              )
              from (
                select id, name, objective, status, version, updated_at
                from api.projects
                where organization_id = organizations.id
                  and status <> 'deleted'
                order by updated_at desc, id desc
                limit 6
              ) as recent
            ), '[]'::jsonb),
            'recent_runs', coalesce((
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'id', recent.id,
                  'project_id', recent.project_id,
                  'project_name', recent.project_name,
                  'state', recent.state,
                  'created_at', recent.created_at
                )
                order by recent.created_at desc, recent.id desc
              )
              from (
                select
                  runs.id,
                  runs.project_id,
                  projects.name as project_name,
                  runs.state,
                  runs.created_at
                from api.simulation_runs as runs
                join api.projects as projects
                  on projects.id = runs.project_id
                 and projects.organization_id = runs.organization_id
                where runs.organization_id = organizations.id
                order by runs.created_at desc, runs.id desc
                limit 8
              ) as recent
            ), '[]'::jsonb),
            'recent_reports', coalesce((
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'id', recent.id,
                  'run_id', recent.run_id,
                  'project_id', recent.project_id,
                  'project_name', recent.project_name,
                  'created_at', recent.created_at
                )
                order by recent.created_at desc, recent.id desc
              )
              from (
                select
                  reports.id,
                  reports.run_id,
                  runs.project_id,
                  projects.name as project_name,
                  reports.created_at
                from api.report_artifacts as reports
                join api.simulation_runs as runs
                  on runs.id = reports.run_id
                 and runs.organization_id = reports.organization_id
                join api.projects as projects
                  on projects.id = runs.project_id
                 and projects.organization_id = runs.organization_id
                where reports.organization_id = organizations.id
                order by reports.created_at desc, reports.id desc
                limit 6
              ) as recent
            ), '[]'::jsonb),
            'generated_at', pg_catalog.statement_timestamp()
          ) as payload
          from api.organizations as organizations
          left join api.organization_memberships as memberships
            on memberships.organization_id = organizations.id
           and memberships.user_id = private.verified_subject()
          where organizations.id = $1::uuid
            and organizations.status <> 'deleted'
            and (
              memberships.user_id is not null
              or private.is_platform_superadmin(private.verified_subject())
            )
          `,
          [organizationId],
        );
        const payload = result.rows[0]?.payload;
        if (payload === undefined) {
          throw notFound();
        }
        return organizationDashboard(payload);
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async createOrganization(
    identity: VerifiedIdentity,
    name: string,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<OrganizationRecord>> {
    try {
      return await this.transaction(identity, async (client) => {
        const command = await client.query(
          `
          select
            created.organization_id::text as organization_id,
            created.organization_name,
            created.membership_role::text as membership_role,
            created.replayed
          from api.create_organization($1, $2, $3, $4::uuid) as created
          `,
          [name, idempotencyKey, requestSha256, correlationId],
        );
        const row = command.rows[0];
        if (row === undefined) {
          throw new Error("organization command returned no row");
        }
        const stored = await client.query(
          `
          select
            organizations.id::text as id,
            organizations.name,
            $2::text as role,
            organizations.status::text as status,
            pg_catalog.to_char(
              organizations.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.organizations as organizations
          where organizations.id = $1::uuid
          `,
          [
            uuidValue(row.organization_id, "organization command id"),
            exactString(row.membership_role, "organization membership role"),
          ],
        );
        const visible = stored.rows[0];
        if (visible === undefined) {
          throw new Error("organization command response is unreadable");
        }
        return Object.freeze({
          value: organization(visible),
          replayed: booleanValue(row.replayed, "organization replay state"),
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async requestOrganizationDeletion(
    identity: VerifiedIdentity,
    organizationId: string,
    confirmation: string,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<OrganizationDeletionRecord> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          `
          select api.request_organization_deletion(
            $1::uuid, $2, $3, $4, $5::uuid
          ) as payload
          `,
          [
            organizationId,
            confirmation,
            idempotencyKey,
            requestSha256,
            correlationId,
          ],
        );
        return organizationDeletion(result.rows[0]?.payload);
      });
    } catch (error) {
      if (error instanceof AppProblem) throw error;
      throw databaseProblem(error);
    }
  }

  async confirmOrganizationDeletion(
    identity: VerifiedIdentity,
    requestId: string,
    organizationId: string,
  ): Promise<OrganizationDeletionRecord> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          `
          select api.confirm_organization_deletion(
            $1::uuid, $2::uuid
          ) as payload
          `,
          [requestId, organizationId],
        );
        return organizationDeletion(result.rows[0]?.payload);
      });
    } catch (error) {
      if (error instanceof AppProblem) throw error;
      throw databaseProblem(error);
    }
  }

  async visibleOrganization(
    identity: VerifiedIdentity,
    organizationId: string,
  ): Promise<string> {
    return this.visibleResource(
      identity,
      "select id::text as id from api.organizations where id = $1::uuid",
      organizationId,
    );
  }

  async organizationForProject(
    identity: VerifiedIdentity,
    projectId: string,
  ): Promise<string> {
    return this.visibleResource(
      identity,
      `
      select organization_id::text as id
      from api.projects
      where id = $1::uuid
      `,
      projectId,
    );
  }

  async organizationForStimulus(
    identity: VerifiedIdentity,
    stimulusId: string,
  ): Promise<string> {
    return this.visibleResource(
      identity,
      `
      select organization_id::text as id
      from api.stimuli
      where id = $1::uuid
      `,
      stimulusId,
    );
  }

  async recordPrivilegedDenial(
    identity: VerifiedIdentity,
    organizationId: string,
    action: string,
    objectType: string,
    objectId: string | null,
    correlationId: string,
  ): Promise<void> {
    try {
      await this.transaction(identity, async (client) => {
        await client.query(
          `
          select api.record_privileged_denial(
            $1::uuid,
            $2,
            $3,
            $4::uuid,
            $5::uuid
          )
          `,
          [organizationId, action, objectType, objectId, correlationId],
        );
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async createProject(
    identity: VerifiedIdentity,
    organizationId: string,
    input: ProjectInput,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<ProjectRecord>> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select
            command.project_id::text as id,
            command.organization_id::text as organization_id,
            command.project_name as name,
            command.objective,
            command.market,
            command.language,
            command.category,
            command.project_status::text as status,
            command.project_version as version,
            pg_catalog.to_char(
              command.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at,
            pg_catalog.to_char(
              command.updated_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as updated_at,
            command.replayed
          from api.create_project(
            $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::uuid
          ) as command
          `,
          [
            organizationId,
            input.name,
            input.objective,
            input.market,
            input.language,
            input.category,
            idempotencyKey,
            requestSha256,
            correlationId,
          ],
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw new Error("project command returned no row");
        }
        return Object.freeze({
          value: project(row),
          replayed: booleanValue(row.replayed, "project replay state"),
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async listProjects(
    identity: VerifiedIdentity,
    organizationId: string,
    after: CursorPosition | null,
    limit: number,
  ): Promise<readonly ProjectRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 101) {
      throw new Error("project query limit is outside its contract");
    }
    try {
      return await this.transaction(identity, async (client) => {
        const visible = await client.query(
          `
          select 1 as visible
          from api.organizations
          where id = $1::uuid
          `,
          [organizationId],
        );
        if (visible.rows[0] === undefined) {
          throw notFound();
        }
        const predicate =
          after === null
            ? ""
            : "and (projects.created_at, projects.id) > ($2::timestamptz, $3::uuid)";
        const parameters =
          after === null
            ? [organizationId, limit]
            : [organizationId, after.createdAt, after.resourceId, limit];
        const limitParameter = after === null ? "$2" : "$4";
        const result = await client.query(
          `
          select
            projects.id::text as id,
            projects.organization_id::text as organization_id,
            projects.name,
            projects.objective,
            projects.market,
            projects.language,
            projects.category,
            projects.status::text as status,
            projects.version,
            pg_catalog.to_char(
              projects.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at,
            pg_catalog.to_char(
              projects.updated_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as updated_at
          from api.projects as projects
          where projects.organization_id = $1::uuid
            ${predicate}
          order by projects.created_at, projects.id
          limit ${limitParameter}
          `,
          parameters,
        );
        return result.rows.map(project);
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getProject(
    identity: VerifiedIdentity,
    projectId: string,
  ): Promise<ProjectDetailRecord> {
    try {
      return await this.transaction(identity, async (client) =>
        this.projectDetail(client, projectId),
      );
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async updateProject(
    identity: VerifiedIdentity,
    projectId: string,
    expectedVersion: number,
    patch: Partial<ProjectInput>,
    correlationId: string,
  ): Promise<ProjectRecord> {
    try {
      return await this.transaction(identity, async (client) => {
        const current = await client.query<{
          name: string;
          objective: string;
          market: "philippines";
          language: "en";
          category: "campaign_message";
        }>(
          `
          select name, objective, market, language, category
          from api.projects
          where id = $1::uuid
          `,
          [projectId],
        );
        const stored = current.rows[0];
        if (stored === undefined) {
          throw notFound();
        }
        const merged = { ...stored, ...patch };
        const result = await client.query(
          `
          select
            command.project_id::text as id,
            command.organization_id::text as organization_id,
            command.project_name as name,
            command.objective,
            command.market,
            command.language,
            command.category,
            command.project_status::text as status,
            command.project_version as version,
            pg_catalog.to_char(
              command.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at,
            pg_catalog.to_char(
              command.updated_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as updated_at
          from api.update_project(
            $1::uuid, $2, $3, $4, $5, $6, $7, $8::uuid
          ) as command
          `,
          [
            projectId,
            expectedVersion,
            merged.name,
            merged.objective,
            merged.market,
            merged.language,
            merged.category,
            correlationId,
          ],
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw new Error("project update returned no row");
        }
        return project(row);
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async createStimulus(
    identity: VerifiedIdentity,
    projectId: string,
    name: string,
    content: string,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<StimulusRecord>> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select
            command.stimulus_id::text as stimulus_id,
            command.organization_id::text as organization_id,
            command.project_id::text as project_id,
            command.stimulus_name,
            command.stimulus_status::text as stimulus_status,
            pg_catalog.to_char(
              command.stimulus_created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as stimulus_created_at,
            command.stimulus_version_id::text as version_id,
            command.stimulus_version,
            command.content,
            command.content_sha256,
            pg_catalog.to_char(
              command.version_created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as version_created_at,
            command.replayed
          from api.create_stimulus(
            $1::uuid, $2, $3, $4, $5, $6, $7::uuid
          ) as command
          `,
          [
            projectId,
            name,
            content,
            sha256Content(content),
            idempotencyKey,
            requestSha256,
            correlationId,
          ],
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw new Error("stimulus command returned no row");
        }
        return Object.freeze({
          value: stimulus(row),
          replayed: booleanValue(row.replayed, "stimulus replay state"),
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async appendStimulusVersion(
    identity: VerifiedIdentity,
    stimulusId: string,
    content: string,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<StimulusVersionRecord>> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select
            command.version_id::text as version_id,
            command.organization_id::text as organization_id,
            command.stimulus_id::text as stimulus_id,
            command.stimulus_version,
            command.content,
            command.content_sha256,
            pg_catalog.to_char(
              command.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at,
            command.replayed
          from api.append_stimulus_version(
            $1::uuid, $2, $3, $4, $5, $6::uuid
          ) as command
          `,
          [
            stimulusId,
            content,
            sha256Content(content),
            idempotencyKey,
            requestSha256,
            correlationId,
          ],
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw new Error("stimulus-version command returned no row");
        }
        return Object.freeze({
          value: stimulusVersion(row),
          replayed: booleanValue(row.replayed, "stimulus-version replay state"),
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async createStimulusAsset(
    identity: VerifiedIdentity,
    stimulusId: string,
    input: StimulusAssetReserveDto,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<StimulusAssetRecord>> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          `
          select api.create_stimulus_asset(
            $1::uuid, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9::uuid
          ) as payload
          `,
          [
            stimulusId,
            input.filename,
            input.media_type,
            input.byte_size,
            input.content_sha256,
            input.retention_until,
            idempotencyKey,
            requestSha256,
            correlationId,
          ],
        );
        const value = stimulusAssetRecord(
          commandPayload(result.rows[0]?.payload, "stimulus asset reservation"),
        );
        return Object.freeze({ value, replayed: value.replayed });
      });
    } catch (error) {
      if (error instanceof AppProblem) throw error;
      throw databaseProblem(error);
    }
  }

  async listStimulusAssets(
    identity: VerifiedIdentity,
    stimulusId: string,
  ): Promise<readonly StimulusAssetRecord[]> {
    try {
      return await this.transaction(identity, async (client) => {
        const stimulus = await client.query(
          "select id from api.stimuli where id = $1::uuid",
          [stimulusId],
        );
        if (stimulus.rows[0] === undefined) throw notFound();
        const result = await client.query(
          `
          select id::text as asset_id, organization_id::text,
            stimulus_id::text, storage_bucket_id, storage_object_name,
            filename, media_type, expected_byte_size,
            expected_content_sha256, byte_size, content_sha256, status,
            pg_catalog.to_char(
              retention_until at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as retention_until,
            pg_catalog.to_char(
              created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.stimulus_assets
          where stimulus_id = $1::uuid
          order by created_at desc, id desc
          limit 100
          `,
          [stimulusId],
        );
        return Object.freeze(
          result.rows.map((row) =>
            stimulusAssetRecord(row as Readonly<Record<string, unknown>>),
          ),
        );
      });
    } catch (error) {
      if (error instanceof AppProblem) throw error;
      throw databaseProblem(error);
    }
  }

  async getStimulusAsset(
    identity: VerifiedIdentity,
    assetId: string,
  ): Promise<StimulusAssetRecord> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select id::text as asset_id, organization_id::text,
            stimulus_id::text, storage_bucket_id, storage_object_name,
            filename, media_type, expected_byte_size,
            expected_content_sha256, byte_size, content_sha256, status,
            pg_catalog.to_char(
              retention_until at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as retention_until,
            pg_catalog.to_char(
              created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.stimulus_assets
          where id = $1::uuid
          limit 1
          `,
          [assetId],
        );
        const row = result.rows[0];
        if (row === undefined) throw notFound();
        return stimulusAssetRecord(row as Readonly<Record<string, unknown>>);
      });
    } catch (error) {
      if (error instanceof AppProblem) throw error;
      throw databaseProblem(error);
    }
  }

  async confirmStimulusAssetUpload(
    identity: VerifiedIdentity,
    assetId: string,
    byteSize: number,
    contentSha256: string,
    correlationId: string,
  ): Promise<StimulusAssetRecord> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          `
          select api.confirm_stimulus_asset_upload(
            $1::uuid, $2, $3, $4::uuid
          ) as payload
          `,
          [assetId, byteSize, contentSha256, correlationId],
        );
        return stimulusAssetRecord(
          commandPayload(
            result.rows[0]?.payload,
            "stimulus asset upload confirmation",
          ),
        );
      });
    } catch (error) {
      if (error instanceof AppProblem) throw error;
      throw databaseProblem(error);
    }
  }

  async requestStimulusAssetDeletion(
    identity: VerifiedIdentity,
    assetId: string,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<StimulusAssetRecord>> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          `
          select api.request_stimulus_asset_deletion(
            $1::uuid, $2, $3, $4::uuid
          ) as payload
          `,
          [assetId, idempotencyKey, requestSha256, correlationId],
        );
        const value = stimulusAssetRecord(
          commandPayload(
            result.rows[0]?.payload,
            "stimulus asset deletion request",
          ),
        );
        return Object.freeze({ value, replayed: value.replayed });
      });
    } catch (error) {
      if (error instanceof AppProblem) throw error;
      throw databaseProblem(error);
    }
  }

  async confirmStimulusAssetDeletion(
    identity: VerifiedIdentity,
    assetId: string,
    correlationId: string,
  ): Promise<StimulusAssetRecord> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          `
          select api.confirm_stimulus_asset_deletion(
            $1::uuid, $2::uuid
          ) as payload
          `,
          [assetId, correlationId],
        );
        return stimulusAssetRecord(
          commandPayload(
            result.rows[0]?.payload,
            "stimulus asset deletion confirmation",
          ),
        );
      });
    } catch (error) {
      if (error instanceof AppProblem) throw error;
      throw databaseProblem(error);
    }
  }

  async createVisualStimulusProfile(
    identity: VerifiedIdentity,
    assetId: string,
    analysisId: string,
    profile: VisualStimulusProfile,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<VisualStimulusProfileRecord>> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          `
          select api.create_stimulus_visual_profile(
            $1::uuid, $2::uuid, $3::jsonb, $4, $5, $6::uuid
          ) as payload
          `,
          [
            assetId,
            analysisId,
            profile,
            idempotencyKey,
            requestSha256,
            correlationId,
          ],
        );
        const value = visualStimulusProfileRecord(
          commandPayload(
            result.rows[0]?.payload,
            "stimulus visual profile creation",
          ),
        );
        return Object.freeze({ value, replayed: value.replayed });
      });
    } catch (error) {
      if (error instanceof AppProblem) throw error;
      throw databaseProblem(error);
    }
  }

  async getVisualStimulusProfile(
    identity: VerifiedIdentity,
    assetId: string,
  ): Promise<VisualStimulusProfileRecord | null> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select profiles.id::text as analysis_id,
            profiles.asset_id::text,
            profiles.organization_id::text,
            profiles.stimulus_id::text,
            profiles.asset_content_sha256,
            profiles.profile_checksum_sha256,
            profiles.profile,
            assets.media_type as asset_media_type,
            assets.byte_size as asset_byte_size,
            pg_catalog.to_char(
              profiles.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.stimulus_visual_profiles as profiles
          join api.stimulus_assets as assets
            on assets.id = profiles.asset_id
          where profiles.asset_id = $1::uuid
            and assets.status = 'available'
            and assets.retention_until > pg_catalog.statement_timestamp()
          order by profiles.created_at desc, profiles.id desc
          limit 1
          `,
          [assetId],
        );
        const row = result.rows[0];
        return row === undefined
          ? null
          : visualStimulusProfileRecord(
              row as Readonly<Record<string, unknown>>,
            );
      });
    } catch (error) {
      if (error instanceof AppProblem) throw error;
      throw databaseProblem(error);
    }
  }

  async getDemoAudience(
    identity: VerifiedIdentity,
  ): Promise<AudienceDisclosureRecord> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select
            versions.id::text as id,
            audiences.name,
            versions.version,
            versions.kind::text as kind,
            versions.checksum_sha256,
            versions.is_non_representative,
            versions.limitations,
            versions.manifest
          from api.audience_versions as versions
          join api.audiences as audiences
            on audiences.id = versions.audience_id
          where versions.audience_id =
              '00000000-0000-4000-8000-0000000000d0'::uuid
            and versions.organization_id is null
            and versions.kind = 'authored_demo'
            and versions.admission_status = 'approved_demo'
            and versions.is_non_representative
            and audiences.is_public_demo
            and audiences.organization_id is null
          `,
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw notFound();
        }
        const manifest = jsonObject(row.manifest, "audience manifest");
        const limitation = exactString(row.limitations, "audience limitation");
        if (
          limitation !==
          "Estimates nobody and is not representative of any population."
        ) {
          throw new Error("database returned an invalid audience limitation");
        }
        const checksum = exactString(row.checksum_sha256, "audience checksum");
        if (!/^[0-9a-f]{64}$/.test(checksum)) {
          throw new Error("database returned an invalid audience checksum");
        }
        if (
          exactString(manifest.disclosure_version, "disclosure version") !==
          "phase2_demo_v1"
        ) {
          throw new Error(
            "database returned an invalid audience disclosure version",
          );
        }
        if (
          booleanValue(
            row.is_non_representative,
            "audience representation flag",
          ) !== true
        ) {
          throw new Error(
            "database returned an invalid audience representation flag",
          );
        }
        return Object.freeze({
          id: uuidValue(row.id, "audience version id"),
          name: exactString(row.name, "audience name"),
          version: integerValue(row.version, "audience version", 1),
          kind: enumValue(row.kind, ["authored_demo"] as const),
          checksum_sha256: checksum,
          non_representative: true,
          limitations: Object.freeze([limitation] as const),
          disclosure_version: "phase2_demo_v1",
          purpose: exactString(manifest.purpose, "audience purpose"),
          prohibited_uses: Object.freeze([
            ...stringArray(
              manifest.prohibited_uses,
              "audience prohibited uses",
            ),
          ]),
          owner: exactString(manifest.owner, "audience owner"),
          source: exactString(manifest.source, "audience source"),
          dependencies: Object.freeze([
            ...stringArray(manifest.dependencies, "audience dependencies"),
          ]),
          transformation: exactString(
            manifest.transformation,
            "audience transformation",
          ),
          scope: exactString(manifest.scope, "audience scope"),
          lifecycle: exactString(manifest.lifecycle, "audience lifecycle"),
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getMethodologyRegistry(
    identity: VerifiedIdentity,
  ): Promise<MethodologyRegistryResponseDto> {
    try {
      return await this.transaction(identity, async (client) => {
        const [populationFrames, methodologies, providers] = await Promise.all([
          client.query(`
              select id::text, population_frame_id::text, version,
                validation_status::text, manifest, checksum_sha256,
                pg_catalog.to_char(
                  created_at at time zone 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                ) as created_at
              from api.population_frame_versions
              order by created_at, id
              limit 100
            `),
          client.query(`
              select id::text, methodology_key, version,
                validation_status::text, manifest, checksum_sha256,
                pg_catalog.to_char(
                  created_at at time zone 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                ) as created_at
              from api.methodology_versions
              where validation_status <> 'retired'
              order by methodology_key, version
              limit 100
            `),
          client.query(`
              select id::text, provider_id, version, admission_status::text,
                external_provider, model_id, template_id, limits,
                checksum_sha256,
                pg_catalog.to_char(
                  created_at at time zone 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                ) as created_at
              from api.provider_configuration_versions
              where admission_status <> 'retired'
              order by provider_id, version
              limit 100
            `),
        ]);
        return Object.freeze({
          population_frames: Object.freeze(
            populationFrames.rows.map(populationRegistryRecord),
          ),
          methodologies: Object.freeze(
            methodologies.rows.map(methodologyRegistryRecord),
          ),
          providers: Object.freeze(providers.rows.map(providerRegistryRecord)),
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async createAudienceDefinition(
    identity: VerifiedIdentity,
    organizationId: string,
    input: AudienceCreateDto,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<AudienceCommandResponseDto>> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          `
          select api.create_audience_definition(
            $1::uuid, $2, $3::jsonb, $4, $5, $6, $7::uuid
          ) as payload
          `,
          [
            organizationId,
            input.name,
            JSON.stringify(input.manifest),
            input.limitations,
            idempotencyKey,
            requestSha256,
            correlationId,
          ],
        );
        const payload = commandPayload(
          result.rows[0]?.payload,
          "audience command",
        );
        const value = audienceCommand(payload);
        return Object.freeze({ value, replayed: value.replayed });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async listAudienceDefinitions(
    identity: VerifiedIdentity,
    organizationId: string,
  ): Promise<readonly AudienceRecordDto[]> {
    try {
      return await this.transaction(identity, async (client) => {
        const visible = await client.query(
          "select id from api.organizations where id = $1::uuid",
          [organizationId],
        );
        if (visible.rows[0] === undefined) {
          throw notFound();
        }
        const result = await client.query(
          `
          select audiences.id::text as audience_id, audiences.name,
            versions.id::text as audience_version_id, versions.version,
            versions.kind::text, versions.admission_status::text,
            versions.manifest, versions.checksum_sha256,
            versions.is_non_representative, versions.limitations,
            pg_catalog.to_char(
              versions.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.audiences as audiences
          join api.audience_versions as versions
            on versions.audience_id = audiences.id
          where audiences.organization_id = $1::uuid
          order by versions.created_at desc, versions.id desc
          limit 100
          `,
          [organizationId],
        );
        return Object.freeze(result.rows.map(audienceRecord));
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async createSimulationConfiguration(
    identity: VerifiedIdentity,
    projectId: string,
    input: SimulationConfigurationCreateDto,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<SimulationConfigurationResponseDto>> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          `
          select api.create_simulation_configuration(
            $1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
            $7::jsonb, $8::bigint, $9, $10, $11::uuid
          ) as payload
          `,
          [
            projectId,
            input.name,
            input.audience_version_id,
            input.population_frame_version_id,
            input.methodology_version_id,
            input.provider_configuration_version_id,
            JSON.stringify(input.sampling_configuration),
            input.cost_ceiling_microusd,
            idempotencyKey,
            requestSha256,
            correlationId,
          ],
        );
        const payload = commandPayload(
          result.rows[0]?.payload,
          "simulation configuration command",
        );
        const value = simulationConfiguration(payload);
        return Object.freeze({ value, replayed: value.replayed });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async listSimulationConfigurations(
    identity: VerifiedIdentity,
    projectId: string,
  ): Promise<readonly SimulationConfigurationRecordDto[]> {
    try {
      return await this.transaction(identity, async (client) => {
        const project = await client.query(
          "select id from api.projects where id = $1::uuid",
          [projectId],
        );
        if (project.rows[0] === undefined) {
          throw notFound();
        }
        const result = await client.query(
          `
          select configurations.id::text as configuration_id,
            configurations.name, configurations.project_id::text,
            versions.id::text as configuration_version_id, versions.version,
            versions.audience_version_id::text,
            versions.population_frame_version_id::text,
            versions.methodology_version_id::text,
            versions.provider_configuration_version_id::text,
            versions.sampling_configuration,
            versions.cost_ceiling_microusd::integer,
            versions.checksum_sha256,
            pg_catalog.to_char(
              versions.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.simulation_configurations as configurations
          join api.simulation_configuration_versions as versions
            on versions.simulation_configuration_id = configurations.id
          where configurations.project_id = $1::uuid
          order by versions.created_at desc, versions.id desc
          limit 100
          `,
          [projectId],
        );
        return Object.freeze(result.rows.map(simulationConfigurationRecord));
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getMethodologyPreviewCommand(
    identity: VerifiedIdentity,
    projectId: string,
    input: MethodologyPreviewCreateDto,
    runId: string,
    reportId: string,
  ): Promise<MethodologyPreviewCommand> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select versions.created_at,
            versions.sampling_configuration,
            versions.cost_ceiling_microusd::integer,
            configurations.project_id::text,
            audiences.id::text as audience_id,
            audiences.name as audience_name,
            audience_versions.id::text as audience_version_id,
            audience_versions.version as audience_version,
            audience_versions.manifest as audience_manifest,
            audience_versions.limitations as audience_limitations,
            population_versions.id::text as population_frame_version_id,
            population_versions.population_frame_id::text,
            population_versions.version as population_version,
            population_versions.manifest as population_manifest,
            population_versions.validation_status::text
              as population_validation_status,
            population_versions.limitations as population_limitations,
            population_frames.name as population_name,
            methodologies.methodology_key,
            providers.provider_id, providers.external_provider,
            stimulus_versions.content
          from api.simulation_configuration_versions as versions
          join api.simulation_configurations as configurations
            on configurations.id = versions.simulation_configuration_id
          join api.audience_versions
            on audience_versions.id = versions.audience_version_id
          join api.audiences as audiences
            on audiences.id = audience_versions.audience_id
          join api.population_frame_versions as population_versions
            on population_versions.id = versions.population_frame_version_id
          join api.population_frames as population_frames
            on population_frames.id = population_versions.population_frame_id
          join api.methodology_versions as methodologies
            on methodologies.id = versions.methodology_version_id
          join api.provider_configuration_versions as providers
            on providers.id = versions.provider_configuration_version_id
          join api.stimulus_versions
            on stimulus_versions.id = $3::uuid
          join api.stimuli
            on stimuli.id = stimulus_versions.stimulus_id
           and stimuli.project_id = configurations.project_id
           and stimuli.status = 'active'
          where versions.id = $1::uuid
            and configurations.project_id = $2::uuid
          limit 1
          `,
          [
            input.configuration_version_id,
            projectId,
            input.stimulus_version_id,
          ],
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw notFound();
        }
        if (
          booleanValue(row.external_provider, "external provider flag") ||
          exactString(row.provider_id, "provider id") !== "deterministic_cohort"
        ) {
          throw new AppProblem(
            422,
            "validation_error",
            "Provider unavailable for preview",
            "Synchronous preview supports only the zero-cost deterministic provider.",
          );
        }
        if (input.run_id !== undefined) {
          const run = await client.query(
            `
            select id
            from api.simulation_runs
            where id = $1::uuid and project_id = $2::uuid
              and stimulus_version_id = $3::uuid and state = 'succeeded'
            limit 1
            `,
            [input.run_id, projectId, input.stimulus_version_id],
          );
          if (run.rows[0] === undefined) {
            throw new AppProblem(
              409,
              "version_conflict",
              "Completed run unavailable",
              "A matching succeeded run is required for a durable methodology report.",
            );
          }
        }
        const populationManifest = jsonObject(
          row.population_manifest,
          "population manifest",
        );
        const populationProvenance = jsonArray(
          populationManifest.provenance,
          "population provenance",
        ).map((item) => {
          const source = jsonObject(item, "population provenance source");
          const transformations =
            source.transformations ??
            (typeof source.transformation === "string"
              ? [source.transformation]
              : []);
          return {
            source_id: source.source_id,
            source_version: source.source_version,
            owner: source.owner,
            license: source.license,
            allowed_uses: source.allowed_uses,
            collection_period: source.collection_period,
            sampling_frame: source.sampling_frame,
            transformations,
            known_biases: source.known_biases,
            coverage_limitations: source.coverage_limitations,
            validation_status:
              row.population_validation_status === "benchmarked"
                ? "benchmarked"
                : "experimental",
          };
        });
        const cells = jsonArray(populationManifest.cells, "population cells")
          .map((item) => {
            const cell = jsonObject(item, "population cell");
            const dimensions = jsonObject(
              cell.dimensions,
              "population cell dimensions",
            );
            return {
              key: cell.key,
              weight: cell.weight,
              dimensions: Object.entries(dimensions)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([dimension, value]) => ({ dimension, value })),
            };
          })
          .sort((left, right) =>
            String(left.key).localeCompare(String(right.key)),
          );
        const audienceManifest = jsonObject(
          row.audience_manifest,
          "audience manifest",
        );
        const criteria = jsonArray(
          audienceManifest.criteria,
          "audience criteria",
        )
          .map((item) => {
            const criterion = jsonObject(item, "audience criterion");
            if (criterion.operator === "not_equals") {
              throw new AppProblem(
                422,
                "validation_error",
                "Methodology preview rejected",
                "not_equals criteria require an explicit population complement",
              );
            }
            const values = Array.isArray(criterion.value)
              ? criterion.value
              : [criterion.value];
            return {
              dimension: criterion.attribute,
              allowed_values: [...new Set(values)].sort(),
            };
          })
          .sort((left, right) =>
            String(left.dimension).localeCompare(String(right.dimension)),
          );
        return Object.freeze({
          run_id: runId,
          stimulus: exactString(row.content, "stimulus content"),
          population: Object.freeze({
            id: uuidValue(
              row.population_frame_version_id,
              "population version id",
            ),
            frame_id: uuidValue(row.population_frame_id, "population frame id"),
            version: integerValue(
              row.population_version,
              "population version",
              1,
            ),
            name: exactString(row.population_name, "population name"),
            geography: populationManifest.geography,
            target_population: populationManifest.target_population,
            inclusion: populationManifest.inclusion,
            exclusion: populationManifest.exclusion,
            provenance: populationProvenance,
            cells,
            validation_status:
              row.population_validation_status === "benchmarked"
                ? "benchmarked"
                : "experimental",
            limitations: limitations(
              row.population_limitations,
              "population limitations",
            ),
          }),
          audience: Object.freeze({
            id: uuidValue(row.audience_version_id, "audience version id"),
            audience_id: uuidValue(row.audience_id, "audience id"),
            version: integerValue(row.audience_version, "audience version", 1),
            name: exactString(row.audience_name, "audience name"),
            criteria,
            provenance_status: audienceManifest.provenance_status,
            limitations: limitations(
              row.audience_limitations,
              "audience limitations",
            ),
          }),
          configuration: jsonObject(
            row.sampling_configuration,
            "sampling configuration",
          ),
          methodology_version: keyValue(row.methodology_key, "methodology key"),
          cost_ceiling_microusd: integerValue(
            row.cost_ceiling_microusd,
            "cost ceiling",
            0,
            100_000_000,
          ),
          repetition_configuration: input.repetition_configuration ?? null,
          report: Object.freeze({
            report_id: reportId,
            project_id: projectId,
            stimulus_version_id: input.stimulus_version_id,
            variant_key: input.variant_key,
            variant_label: input.variant_label,
            created_at: flexibleTimestamp(
              row.created_at,
              "configuration creation time",
            ),
          }),
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async createReportArtifact(
    identity: VerifiedIdentity,
    runId: string,
    artifact: Readonly<Record<string, unknown>>,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<ReportArtifactCommand>> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          `
          select api.create_report_artifact(
            $1::uuid, $2::jsonb, $3, $4, $5::uuid
          ) as payload
          `,
          [
            runId,
            JSON.stringify(artifact),
            idempotencyKey,
            requestSha256,
            correlationId,
          ],
        );
        const value = reportArtifactCommand(
          commandPayload(result.rows[0]?.payload, "report command"),
        );
        return Object.freeze({ value, replayed: value.replayed });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getRunReport(
    identity: VerifiedIdentity,
    runId: string,
  ): Promise<ReportArtifactRecord> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select id::text as report_id, run_id::text, schema_version,
            artifact, content_sha256,
            pg_catalog.to_char(
              created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.report_artifacts
          where run_id = $1::uuid
          order by created_at desc, id desc
          limit 1
          `,
          [runId],
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw notFound();
        }
        return reportArtifactRecord(row);
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getStoredReportArtifact(
    identity: VerifiedIdentity,
    reportId: string,
  ): Promise<StoredReportArtifact> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select id::text as report_id, organization_id::text, run_id::text,
            schema_version, artifact, content_sha256,
            pg_catalog.to_char(
              created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.report_artifacts
          where id = $1::uuid
          limit 1
          `,
          [reportId],
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw notFound();
        }
        return Object.freeze({
          ...reportArtifactRecord(row),
          organization_id: uuidValue(
            row.organization_id,
            "report organization id",
          ),
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async createVariantGroup(
    identity: VerifiedIdentity,
    projectId: string,
    input: VariantGroupCreateDto,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<VariantGroupRecord>> {
    const members = input.members.map((member, index) => ({
      ...member,
      sort_order: index + 1,
    }));
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          `
          select api.create_variant_group(
            $1::uuid, $2, $3::jsonb, $4, $5, $6::uuid
          ) as payload
          `,
          [
            projectId,
            input.name,
            JSON.stringify(members),
            idempotencyKey,
            requestSha256,
            correlationId,
          ],
        );
        const value = variantGroup(
          commandPayload(result.rows[0]?.payload, "variant group command"),
        );
        return Object.freeze({
          value,
          replayed: value.replayed ?? false,
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async listVariantGroups(
    identity: VerifiedIdentity,
    projectId: string,
  ): Promise<readonly VariantGroupRecord[]> {
    try {
      return await this.transaction(identity, async (client) => {
        const project = await client.query(
          "select id from api.projects where id = $1::uuid",
          [projectId],
        );
        if (project.rows[0] === undefined) {
          throw notFound();
        }
        const result = await client.query(
          `
          select groups.id::text as variant_group_id,
            groups.project_id::text, groups.name,
            pg_catalog.to_char(
              groups.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at,
            coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'id', members.id,
                  'stimulus_version_id', members.stimulus_version_id,
                  'variant_key', members.variant_key,
                  'label', members.label,
                  'sort_order', members.sort_order
                ) order by members.sort_order
              ) filter (where members.id is not null),
              '[]'::jsonb
            ) as members
          from api.variant_groups as groups
          left join api.variant_members as members
            on members.variant_group_id = groups.id
          where groups.project_id = $1::uuid
          group by groups.id
          order by groups.created_at desc, groups.id desc
          limit 100
          `,
          [projectId],
        );
        return Object.freeze(
          result.rows.map((row) =>
            variantGroup(row as Readonly<Record<string, unknown>>),
          ),
        );
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getVariantComparisonCommand(
    identity: VerifiedIdentity,
    variantGroupId: string,
  ): Promise<VariantComparisonCommand> {
    try {
      return await this.transaction(identity, async (client) => {
        const group = await client.query(
          "select id from api.variant_groups where id = $1::uuid",
          [variantGroupId],
        );
        if (group.rows[0] === undefined) {
          throw notFound();
        }
        const result = await client.query(
          `
          select members.variant_key, reports.artifact
          from api.variant_members as members
          join lateral (
            select artifacts.artifact
            from api.simulation_runs as runs
            join api.report_artifacts as artifacts
              on artifacts.run_id = runs.id
            where runs.organization_id = members.organization_id
              and runs.stimulus_version_id = members.stimulus_version_id
            order by artifacts.created_at desc, artifacts.id desc
            limit 1
          ) as reports on true
          where members.variant_group_id = $1::uuid
          order by members.sort_order
          limit 8
          `,
          [variantGroupId],
        );
        if (result.rows.length < 2) {
          throw new AppProblem(
            409,
            "version_conflict",
            "Comparable reports unavailable",
            "At least two variants need complete reports under one frozen configuration.",
          );
        }
        return Object.freeze({
          reports: Object.freeze(
            result.rows.map((row) => ({
              variant_key: keyValue(row.variant_key, "variant key"),
              artifact: jsonObject(row.artifact, "variant report"),
            })),
          ),
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async createReportExport(
    identity: VerifiedIdentity,
    reportId: string,
    input: ReportExportCreateDto,
    rendered: ReportExportRendered,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
  ): Promise<CommandResult<ReportExportCommand>> {
    if (rendered.format !== input.format) {
      throw new Error("rendered export format does not match the command");
    }
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query<{ payload: unknown }>(
          `
          select api.create_report_export(
            $1::uuid, $2::api.export_format, $3, $4::bytea,
            $5::timestamptz, $6, $7, $8::uuid
          ) as payload
          `,
          [
            reportId,
            input.format,
            rendered.filename,
            rendered.content,
            input.expires_at,
            idempotencyKey,
            requestSha256,
            correlationId,
          ],
        );
        const value = reportExportCommand(
          commandPayload(result.rows[0]?.payload, "report export command"),
        );
        if (
          value.report_id !== reportId ||
          value.format !== input.format ||
          value.filename !== rendered.filename ||
          value.content_sha256 !== rendered.content_sha256
        ) {
          throw new Error("database returned an unbound report export");
        }
        return Object.freeze({ value, replayed: value.replayed });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getReportExport(
    identity: VerifiedIdentity,
    exportId: string,
  ): Promise<ReportExportDownload> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select format::text, filename, content, content_sha256
          from api.report_exports
          where id = $1::uuid and deleted_at is null
            and expires_at > pg_catalog.statement_timestamp()
          limit 1
          `,
          [exportId],
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw notFound();
        }
        if (!Buffer.isBuffer(row.content)) {
          throw new Error("database returned invalid export content");
        }
        const content = Buffer.from(row.content);
        const contentSha256 = sha256Field(
          row.content_sha256,
          "export checksum",
        );
        if (
          content.length < 1 ||
          content.length > 2_097_152 ||
          createHash("sha256").update(content).digest("hex") !== contentSha256
        ) {
          throw new Error("database returned unbound export content");
        }
        const filename = exactString(row.filename, "export filename");
        if (!/^[a-z0-9][a-z0-9_.-]{0,119}$/.test(filename)) {
          throw new Error("database returned an invalid export filename");
        }
        return Object.freeze({
          format: enumValue(row.format, ["json", "csv"] as const),
          filename,
          content,
          content_sha256: contentSha256,
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async createSimulationRun(
    identity: VerifiedIdentity,
    projectId: string,
    stimulusVersionId: string,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
    traceparent: string,
  ): Promise<CommandResult<SimulationRunResponseDto>> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select
            command.run_id::text as run_id,
            command.organization_id::text as organization_id,
            command.project_id::text as project_id,
            command.stimulus_version_id::text as stimulus_version_id,
            command.audience_version_id::text as audience_version_id,
            command.run_state::text as run_state,
            command.schema_version,
            command.dispatch_generation,
            command.job_id,
            command.run_version,
            pg_catalog.to_char(
              command.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at,
            command.replayed
          from api.create_simulation_run(
            $1::uuid, $2::uuid, $3, $4, $5::uuid, $6
          ) as command
          `,
          [
            projectId,
            stimulusVersionId,
            idempotencyKey,
            requestSha256,
            correlationId,
            traceparent,
          ],
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw new Error("simulation run command returned no row");
        }
        await this.addFailureContext(client, row, "run_id", "run_state");
        return Object.freeze({
          value: simulationRun(row),
          replayed: booleanValue(row.replayed, "run replay state"),
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async createBehavioralDemoRun(
    identity: VerifiedIdentity,
    projectId: string,
    stimulusVersionId: string,
    variantKey: string,
    idempotencyKey: string,
    requestSha256: string,
    correlationId: string,
    traceparent: string,
  ): Promise<CommandResult<SimulationRunResponseDto>> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select
            command.run_id::text as run_id,
            command.organization_id::text as organization_id,
            command.project_id::text as project_id,
            command.stimulus_version_id::text as stimulus_version_id,
            command.audience_version_id::text as audience_version_id,
            command.run_state::text as run_state,
            command.schema_version,
            command.dispatch_generation,
            command.job_id,
            command.run_version,
            pg_catalog.to_char(
              command.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at,
            command.replayed
          from api.create_behavioral_demo_run(
            $1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7
          ) as command
          `,
          [
            projectId,
            stimulusVersionId,
            variantKey,
            idempotencyKey,
            requestSha256,
            correlationId,
            traceparent,
          ],
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw new Error("behavioral demo run command returned no row");
        }
        await this.addFailureContext(client, row, "run_id", "run_state");
        return Object.freeze({
          value: simulationRun(row),
          replayed: booleanValue(row.replayed, "run replay state"),
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getSimulationRunReplay(
    identity: VerifiedIdentity,
    projectId: string,
    idempotencyKey: string,
    requestSha256: string,
  ): Promise<SimulationRunResponseDto | null> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select
            replay.run_id::text as run_id,
            replay.organization_id::text as organization_id,
            replay.project_id::text as project_id,
            replay.stimulus_version_id::text as stimulus_version_id,
            replay.audience_version_id::text as audience_version_id,
            replay.run_state::text as run_state,
            replay.schema_version,
            replay.dispatch_generation,
            replay.job_id,
            replay.run_version,
            pg_catalog.to_char(
              replay.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.get_simulation_run_replay(
            $1::uuid, $2, $3
          ) as replay
          `,
          [projectId, idempotencyKey, requestSha256],
        );
        const row = result.rows[0];
        if (row === undefined) {
          return null;
        }
        await this.addFailureContext(client, row, "run_id", "run_state");
        return simulationRun(row);
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getSimulationRun(
    identity: VerifiedIdentity,
    runId: string,
  ): Promise<SimulationRunResponseDto> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select
            runs.id::text as id,
            runs.organization_id::text as organization_id,
            runs.project_id::text as project_id,
            runs.stimulus_version_id::text as stimulus_version_id,
            runs.audience_version_id::text as audience_version_id,
            runs.state::text as state,
            runs.schema_version,
            runs.dispatch_generation,
            runs.version,
            pg_catalog.to_char(
              runs.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at,
            runs.correlation_id::text as correlation_id
          from api.simulation_runs as runs
          where runs.id = $1::uuid
          `,
          [runId],
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw notFound();
        }
        await this.addFailureContext(client, row, "id", "state");
        return simulationRun(row);
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async requestSimulationRunCancel(
    identity: VerifiedIdentity,
    runId: string,
    correlationId: string,
  ): Promise<SimulationRunResponseDto> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select
            command.run_id::text as run_id,
            command.organization_id::text as organization_id,
            command.project_id::text as project_id,
            command.stimulus_version_id::text as stimulus_version_id,
            command.audience_version_id::text as audience_version_id,
            command.run_state::text as run_state,
            command.schema_version,
            command.dispatch_generation,
            case
              when command.schema_version = 2 then
                'run-' || command.run_id::text
                  || '-generation-' || command.dispatch_generation::text
              else command.job_id
            end as job_id,
            command.run_version,
            pg_catalog.to_char(
              command.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.request_run_cancel($1::uuid, $2::uuid) as command
          `,
          [runId, correlationId],
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw new Error("simulation run cancellation returned no row");
        }
        await this.addFailureContext(client, row, "run_id", "run_state");
        return simulationRun(row);
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getSimulationResult(
    identity: VerifiedIdentity,
    runId: string,
  ): Promise<SimulationResultResponseDto | null> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select
            results.run_id::text as run_id,
            results.schema_version,
            results.artifact,
            results.artifact_sha256,
            pg_catalog.to_char(
              results.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.simulation_results as results
          where results.run_id = $1::uuid
          `,
          [runId],
        );
        const row = result.rows[0];
        if (row === undefined) {
          return null;
        }
        const resultRunId = uuidValue(row.run_id, "result run id");
        if (row.schema_version !== 1) {
          throw new Error("database returned an invalid result version");
        }
        const artifact = validatedResultArtifact(row.artifact);
        if (artifact.run_id !== resultRunId) {
          throw new Error("database returned a mismatched result artifact");
        }
        return Object.freeze({
          run_id: resultRunId,
          schema_version: 1 as const,
          result: artifact,
          artifact_sha256: sha256Value(
            row.artifact_sha256,
            "result artifact checksum",
          ),
          created_at: timestampValue(row.created_at, "result creation time"),
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getBehavioralResult(
    identity: VerifiedIdentity,
    runId: string,
  ): Promise<BehavioralResultResponseDto | null> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select
            results.run_id::text as run_id,
            results.study_id::text as study_id,
            results.variant_key,
            results.schema_version,
            results.methodology_version,
            results.validation_label,
            results.provider_id,
            results.provider_version,
            results.model_id,
            results.template_id,
            results.provider_calls,
            results.input_tokens::text as input_tokens,
            results.output_tokens::text as output_tokens,
            results.cost_microusd::text as cost_microusd,
            results.context_graph_sha256,
            results.agent_fleet_sha256,
            results.input_sha256,
            results.stimulus_sha256,
            results.output_sha256,
            results.artifact_sha256,
            results.artifact_size_bytes,
            results.report,
            pg_catalog.to_char(
              results.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.behavioral_run_results as results
          where results.run_id = $1::uuid
          `,
          [runId],
        );
        const row = result.rows[0];
        if (row === undefined) {
          return null;
        }
        const report = validatedBehavioralReport(row.report);
        const validationLabel = enumValue(row.validation_label, [
          "experimental",
        ] as const);
        if (report.validation_label !== validationLabel) {
          throw new Error(
            "database returned a mismatched behavioral validation label",
          );
        }
        return Object.freeze({
          run_id: uuidValue(row.run_id, "behavioral result run id"),
          study_id: uuidValue(row.study_id, "behavioral result study id"),
          variant_key: keyValue(
            row.variant_key,
            "behavioral result variant key",
          ),
          schema_version: integerValue(
            row.schema_version,
            "behavioral result schema version",
            1,
            1,
          ) as 1,
          methodology_version: keyValue(
            row.methodology_version,
            "behavioral result methodology version",
          ),
          validation_label: validationLabel,
          provider_id: enumValue(row.provider_id, [
            "deterministic_tiered",
          ] as const),
          provider_version: enumValue(row.provider_version, ["1"] as const),
          model_id: enumValue(row.model_id, [
            "deterministic_behavior_fixture_v1",
          ] as const),
          template_id: enumValue(row.template_id, [
            "behavioral_action_v1",
          ] as const),
          provider_calls: integerValue(
            row.provider_calls,
            "behavioral result provider calls",
            1,
            10_000,
          ),
          input_tokens: nonnegativeIntegerString(
            row.input_tokens,
            "behavioral result input tokens",
          ),
          output_tokens: nonnegativeIntegerString(
            row.output_tokens,
            "behavioral result output tokens",
          ),
          cost_microusd: nonnegativeIntegerString(
            row.cost_microusd,
            "behavioral result cost",
          ),
          context_graph_sha256: sha256Value(
            row.context_graph_sha256,
            "behavioral result context graph checksum",
          ),
          agent_fleet_sha256: sha256Value(
            row.agent_fleet_sha256,
            "behavioral result agent fleet checksum",
          ),
          input_sha256: sha256Value(
            row.input_sha256,
            "behavioral result input checksum",
          ),
          stimulus_sha256: sha256Value(
            row.stimulus_sha256,
            "behavioral result stimulus checksum",
          ),
          output_sha256: sha256Value(
            row.output_sha256,
            "behavioral result output checksum",
          ),
          artifact_sha256: sha256Value(
            row.artifact_sha256,
            "behavioral result artifact checksum",
          ),
          artifact_size_bytes: integerValue(
            row.artifact_size_bytes,
            "behavioral result artifact size",
            1,
            16_000_000,
          ),
          report,
          created_at: timestampValue(
            row.created_at,
            "behavioral result creation time",
          ),
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getBehavioralEvidence(
    identity: VerifiedIdentity,
    runId: string,
  ): Promise<BehavioralEvidenceResponseDto | null> {
    try {
      return await this.transaction(identity, async (client) => {
        const graphResult = await client.query(
          `
          select
            graph.run_id::text as run_id,
            graph.organization_id::text as organization_id,
            graph.graph_id::text as graph_id,
            graph.graph_version,
            graph.checksum_sha256,
            graph.node_count,
            graph.edge_count,
            graph.manifest,
            graph.limitations,
            results.context_graph_sha256 as result_context_graph_sha256,
            results.provider_calls as result_provider_calls,
            results.report as result_report,
            pg_catalog.to_char(
              graph.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.context_graph_versions as graph
          inner join api.behavioral_run_results as results
            on results.organization_id = graph.organization_id
           and results.run_id = graph.run_id
          where graph.run_id = $1::uuid
          `,
          [runId],
        );
        const graphRow = graphResult.rows[0];
        if (graphRow === undefined) {
          return null;
        }

        const contextGraph = validatedContextGraph(graphRow.manifest);
        const rowRunId = uuidValue(graphRow.run_id, "context graph run id");
        const rowOrganizationId = uuidValue(
          graphRow.organization_id,
          "context graph organization id",
        );
        const rowGraphId = uuidValue(graphRow.graph_id, "context graph id");
        const rowGraphVersion = integerValue(
          graphRow.graph_version,
          "context graph version",
          1,
          1_000_000,
        );
        const rowChecksum = sha256Value(
          graphRow.checksum_sha256,
          "context graph checksum",
        );
        const resultChecksum = sha256Value(
          graphRow.result_context_graph_sha256,
          "behavioral result context graph checksum",
        );
        const rowLimitations = stringArray(
          graphRow.limitations,
          "context graph limitations",
        );
        const report = validatedBehavioralReport(graphRow.result_report);
        if (
          rowRunId !== runId ||
          contextGraph.organization_id !== rowOrganizationId ||
          contextGraph.graph_id !== rowGraphId ||
          contextGraph.version !== rowGraphVersion ||
          contextGraph.checksum_sha256 !== rowChecksum ||
          rowChecksum !== resultChecksum ||
          contextGraph.nodes.length !==
            integerValue(
              graphRow.node_count,
              "context graph node count",
              1,
              500,
            ) ||
          contextGraph.edges.length !==
            integerValue(
              graphRow.edge_count,
              "context graph edge count",
              0,
              2000,
            ) ||
          contextGraph.limitations.length !== rowLimitations.length ||
          !contextGraph.limitations.every(
            (limitation, index) => limitation === rowLimitations[index],
          )
        ) {
          throw new Error(
            "database returned mismatched context graph metadata",
          );
        }

        const evidenceResult = await client.query(
          `
          select
            evidence.evidence_kind,
            evidence.evidence_key,
            evidence.output_type,
            pg_catalog.count(*)::integer as event_count,
            (
              pg_catalog.array_agg(
                evidence.action_event_id::text
                order by evidence.action_event_id
              )
            )[1:10] as sample_event_ids
          from api.behavioral_report_evidence as evidence
          where evidence.run_id = $1::uuid
          group by
            evidence.evidence_kind,
            evidence.evidence_key,
            evidence.output_type
          order by
            evidence.evidence_kind,
            evidence.evidence_key,
            evidence.output_type
          limit 101
          `,
          [runId],
        );
        if (evidenceResult.rows.length > 100) {
          throw new Error(
            "database returned too many behavioral evidence groups",
          );
        }
        let previousEvidenceKey: string | null = null;
        const evidenceSummary = evidenceResult.rows.map((row) => {
          const evidenceKind = enumValue(row.evidence_kind, [
            "finding",
            "score",
          ] as const);
          const evidenceKey = keyValue(
            row.evidence_key,
            "behavioral evidence key",
          );
          const outputType = enumValue(row.output_type, [
            "heuristic",
            "qualitative",
            "recommendation",
          ] as const);
          if (evidenceKind === "score" && outputType !== "heuristic") {
            throw new Error(
              "database returned an invalid behavioral score evidence type",
            );
          }
          const canonicalKey = `${evidenceKind}\u0000${evidenceKey}\u0000${outputType}`;
          if (
            previousEvidenceKey !== null &&
            previousEvidenceKey >= canonicalKey
          ) {
            throw new Error(
              "database returned noncanonical behavioral evidence groups",
            );
          }
          previousEvidenceKey = canonicalKey;
          const sampleEventIds = stringArray(
            row.sample_event_ids,
            "behavioral evidence samples",
          ).map((eventId) =>
            uuidValue(eventId, "behavioral evidence sample event id"),
          );
          if (
            sampleEventIds.length > 10 ||
            sampleEventIds.some(
              (eventId, index) =>
                index > 0 && sampleEventIds[index - 1]! >= eventId,
            )
          ) {
            throw new Error(
              "database returned invalid behavioral evidence samples",
            );
          }
          return Object.freeze({
            evidence_kind: evidenceKind,
            evidence_key: evidenceKey,
            output_type: outputType,
            event_count: integerValue(
              row.event_count,
              "behavioral evidence event count",
              1,
              10_000,
            ),
            sample_event_ids: Object.freeze(sampleEventIds),
          });
        });

        const fleetResult = await client.query(
          `
          select
            fleet.agent_count,
            fleet.llm_agent_count,
            fleet.rule_agent_count,
            fleet.cohort_count,
            fleet.relationship_count,
            fleet.synthetic_identity
          from api.behavioral_fleet_summaries as fleet
          where fleet.run_id = $1::uuid
          `,
          [runId],
        );
        if (fleetResult.rows.length !== 1) {
          throw new Error(
            "database returned an incomplete behavioral fleet summary",
          );
        }
        const fleetRow = fleetResult.rows[0]!;
        const agentCount = integerValue(
          fleetRow.agent_count,
          "behavioral fleet agent count",
          10,
          2000,
        );
        const llmAgentCount = integerValue(
          fleetRow.llm_agent_count,
          "behavioral fleet LLM agent count",
          0,
          100,
        );
        const ruleAgentCount = integerValue(
          fleetRow.rule_agent_count,
          "behavioral fleet rule agent count",
          0,
          2000,
        );
        const cohortCount = integerValue(
          fleetRow.cohort_count,
          "behavioral fleet cohort count",
          1,
          agentCount,
        );
        const relationshipCount = integerValue(
          fleetRow.relationship_count,
          "behavioral fleet relationship count",
          0,
          agentCount * agentCount,
        );
        if (
          llmAgentCount + ruleAgentCount !== agentCount ||
          booleanValue(
            fleetRow.synthetic_identity,
            "behavioral fleet identity disclosure",
          ) !== true
        ) {
          throw new Error(
            "database returned an invalid behavioral fleet summary",
          );
        }
        const fleetSummary = Object.freeze({
          agent_count: agentCount,
          llm_agent_count: llmAgentCount,
          rule_agent_count: ruleAgentCount,
          cohort_count: cohortCount,
          relationship_count: relationshipCount,
          synthetic_identity: true as const,
        });

        const roundsResult = await client.query(
          `
          select
            rounds.round_index,
            rounds.event_count,
            rounds.action_shares,
            rounds.mean_valence,
            rounds.mean_attention,
            rounds.mean_resonance,
            rounds.mean_trust,
            rounds.evidence_node_ids,
            rounds.checksum_sha256
          from api.behavioral_round_summaries as rounds
          where rounds.run_id = $1::uuid
          order by rounds.round_index
          limit 6
          `,
          [runId],
        );
        if (roundsResult.rows.length === 0 || roundsResult.rows.length > 5) {
          throw new Error(
            "database returned an invalid behavioral round count",
          );
        }
        const graphNodeIds = new Set(
          contextGraph.nodes.map((node) => node.node_id),
        );
        const rounds = roundsResult.rows.map((roundRow, index) => {
          const roundIndex = integerValue(
            roundRow.round_index,
            "behavioral round index",
            1,
            5,
          );
          const eventCount = integerValue(
            roundRow.event_count,
            "behavioral round event count",
            10,
            2000,
          );
          const evidenceNodeIds = stringArray(
            roundRow.evidence_node_ids,
            "behavioral round evidence nodes",
          ).map((nodeId) => keyValue(nodeId, "behavioral round evidence node"));
          if (
            roundIndex !== index + 1 ||
            eventCount !== agentCount ||
            evidenceNodeIds.length > 500 ||
            evidenceNodeIds.some(
              (nodeId, nodeIndex) =>
                !graphNodeIds.has(nodeId) ||
                (nodeIndex > 0 && evidenceNodeIds[nodeIndex - 1]! >= nodeId),
            )
          ) {
            throw new Error(
              "database returned a mismatched behavioral round summary",
            );
          }
          const checksum = sha256Value(
            roundRow.checksum_sha256,
            "behavioral round checksum",
          );
          if (checksum === "0".repeat(64)) {
            throw new Error(
              "database returned an unset behavioral round checksum",
            );
          }
          return Object.freeze({
            round_index: roundIndex,
            event_count: eventCount,
            action_shares: behavioralActionShares(
              roundRow.action_shares,
              "behavioral round action shares",
            ),
            mean_valence: boundedNumber(
              roundRow.mean_valence,
              "behavioral round mean valence",
              -1,
              1,
            ),
            mean_attention: boundedNumber(
              roundRow.mean_attention,
              "behavioral round mean attention",
              0,
              100,
            ),
            mean_resonance: boundedNumber(
              roundRow.mean_resonance,
              "behavioral round mean resonance",
              0,
              100,
            ),
            mean_trust: boundedNumber(
              roundRow.mean_trust,
              "behavioral round mean trust",
              0,
              100,
            ),
            evidence_node_ids: Object.freeze(evidenceNodeIds),
            checksum_sha256: checksum,
          });
        });
        const providerCalls = integerValue(
          graphRow.result_provider_calls,
          "behavioral result provider calls",
          1,
          10_000,
        );
        const finalRound = rounds.at(-1)!;
        if (
          providerCalls !== agentCount * rounds.length ||
          Math.abs(finalRound.mean_attention - report.mean_attention) > 1e-9 ||
          Math.abs(finalRound.mean_resonance - report.mean_resonance) > 1e-9 ||
          Math.abs(finalRound.mean_trust - report.mean_trust) > 1e-9 ||
          finalRound.action_shares.some(
            ([action, share], index) =>
              action !== report.action_shares[index]![0] ||
              Math.abs(share - report.action_shares[index]![1]) > 1e-9,
          )
        ) {
          throw new Error(
            "database returned public summaries that do not bind to the result",
          );
        }

        const agentsResult = await client.query(
          `
          select
            agents.agent_id::text as agent_id,
            agents.tier,
            agents.round_count,
            agents.latest_action,
            array(
              select event_id::text
              from pg_catalog.unnest(agents.evidence_event_ids)
                with ordinality as events(event_id, position)
              order by events.position
            ) as evidence_event_ids
          from api.behavioral_agent_public_summaries as agents
          where agents.run_id = $1::uuid
          order by agents.agent_id
          limit 10
          `,
          [runId],
        );
        if (agentsResult.rows.length !== 10) {
          throw new Error(
            "database returned an incomplete behavioral interview sample",
          );
        }
        let previousAgentId: string | null = null;
        const syntheticInterviews = agentsResult.rows.map((agentRow) => {
          const agentId = uuidValue(
            agentRow.agent_id,
            "behavioral synthetic agent id",
          );
          const tier = enumValue(agentRow.tier, ["llm", "rule"] as const);
          const roundCount = integerValue(
            agentRow.round_count,
            "behavioral synthetic agent round count",
            1,
            5,
          );
          const latestAction = enumValue(
            agentRow.latest_action,
            BEHAVIORAL_ACTION_KINDS,
          );
          const eventIds = stringArray(
            agentRow.evidence_event_ids,
            "behavioral synthetic agent evidence",
          ).map((eventId) =>
            uuidValue(eventId, "behavioral synthetic agent event id"),
          );
          if (previousAgentId !== null && previousAgentId >= agentId) {
            throw new Error(
              "database returned noncanonical behavioral agent summaries",
            );
          }
          previousAgentId = agentId;
          if (
            roundCount !== rounds.length ||
            eventIds.length !== roundCount ||
            new Set(eventIds).size !== eventIds.length
          ) {
            throw new Error(
              "database returned an invalid behavioral agent summary",
            );
          }
          return Object.freeze({
            interview_kind: "fixed_replay_summary" as const,
            synthetic_agent_id: agentId,
            tier,
            round_count: roundCount,
            latest_action: latestAction,
            evidence_event_ids: Object.freeze(eventIds),
            prompt:
              "What did this synthetic agent do in its final simulated round?" as const,
            response_summary:
              `Across ${roundCount} simulated rounds, the final recorded ` +
              `action was "${latestAction}".`,
            disclosure:
              "Generated from recorded synthetic actions; not a human statement or testimony." as const,
          });
        });

        return Object.freeze({
          run_id: rowRunId,
          context_graph: contextGraph,
          context_graph_created_at: timestampValue(
            graphRow.created_at,
            "context graph creation time",
          ),
          evidence_summary: Object.freeze(evidenceSummary),
          fleet_summary: fleetSummary,
          rounds: Object.freeze(rounds),
          synthetic_interviews: Object.freeze(syntheticInterviews),
          public_summary_limitations: Object.freeze([
            "Fleet, round, and interview views describe synthetic agents only.",
            "Synthetic interview responses are fixed replay summaries, not generated testimony.",
            "No observed human behavior or campaign lift is represented.",
          ] as const),
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getBehavioralComparison(
    identity: VerifiedIdentity,
    baselineRunId: string,
    candidateRunId: string,
  ): Promise<BehavioralComparisonResponseDto | null> {
    try {
      return await this.transaction(identity, async (client) => {
        if (baselineRunId === candidateRunId) {
          throw new Error("invalid_matched_behavioral_comparison");
        }
        const runIds = [baselineRunId, candidateRunId];
        const results = await client.query(
          `
          select
            results.organization_id::text as organization_id,
            results.run_id::text as run_id,
            results.study_id::text as study_id,
            results.variant_key,
            results.methodology_version,
            results.provider_id,
            results.provider_version,
            results.model_id,
            results.template_id,
            results.provider_calls,
            results.context_graph_sha256,
            results.agent_fleet_sha256,
            results.report
          from api.behavioral_run_results as results
          where results.run_id = any($1::uuid[])
          order by results.run_id
          `,
          [runIds],
        );
        if (results.rows.length !== 2) {
          return null;
        }
        const parsed = results.rows.map((row) =>
          Object.freeze({
            organizationId: uuidValue(
              row.organization_id,
              "behavioral comparison organization id",
            ),
            runId: uuidValue(row.run_id, "behavioral comparison run id"),
            studyId: uuidValue(row.study_id, "behavioral comparison study id"),
            variantKey: keyValue(
              row.variant_key,
              "behavioral comparison variant key",
            ),
            methodologyVersion: keyValue(
              row.methodology_version,
              "behavioral comparison methodology version",
            ),
            providerId: enumValue(row.provider_id, [
              "deterministic_tiered",
            ] as const),
            providerVersion: enumValue(row.provider_version, ["1"] as const),
            modelId: enumValue(row.model_id, [
              "deterministic_behavior_fixture_v1",
            ] as const),
            templateId: enumValue(row.template_id, [
              "behavioral_action_v1",
            ] as const),
            providerCalls: integerValue(
              row.provider_calls,
              "behavioral comparison provider calls",
              1,
              10_000,
            ),
            contextGraphSha256: sha256Value(
              row.context_graph_sha256,
              "behavioral comparison context checksum",
            ),
            agentFleetSha256: sha256Value(
              row.agent_fleet_sha256,
              "behavioral comparison fleet checksum",
            ),
            report: validatedBehavioralReport(row.report),
          }),
        );
        const byRunId = new Map(parsed.map((result) => [result.runId, result]));
        const baseline = byRunId.get(baselineRunId);
        const candidate = byRunId.get(candidateRunId);
        if (baseline === undefined || candidate === undefined) {
          throw new Error(
            "database returned mismatched behavioral comparison runs",
          );
        }
        if (
          baseline.organizationId !== candidate.organizationId ||
          baseline.studyId !== candidate.studyId ||
          baseline.variantKey === candidate.variantKey ||
          baseline.methodologyVersion !== candidate.methodologyVersion ||
          baseline.providerId !== candidate.providerId ||
          baseline.providerVersion !== candidate.providerVersion ||
          baseline.modelId !== candidate.modelId ||
          baseline.templateId !== candidate.templateId ||
          baseline.providerCalls !== candidate.providerCalls ||
          baseline.contextGraphSha256 !== candidate.contextGraphSha256 ||
          baseline.agentFleetSha256 !== candidate.agentFleetSha256
        ) {
          throw new Error("invalid_matched_behavioral_comparison");
        }

        const agentResults = await client.query(
          `
          select
            agents.run_id::text as run_id,
            pg_catalog.array_agg(
              agents.agent_id::text
              order by agents.agent_id
            ) as agent_ids
          from api.behavioral_agent_public_summaries as agents
          where agents.run_id = any($1::uuid[])
          group by agents.run_id
          order by agents.run_id
          `,
          [runIds],
        );
        if (agentResults.rows.length !== 2) {
          throw new Error(
            "database returned incomplete behavioral comparison agents",
          );
        }
        const agentsByRun = new Map(
          agentResults.rows.map((row) => {
            const runId = uuidValue(
              row.run_id,
              "behavioral comparison agent run id",
            );
            const agentIds = stringArray(
              row.agent_ids,
              "behavioral comparison agents",
            ).map((agentId) =>
              uuidValue(agentId, "behavioral comparison agent id"),
            );
            if (
              agentIds.length < 10 ||
              agentIds.length > 2000 ||
              agentIds.some(
                (agentId, index) =>
                  index > 0 && agentIds[index - 1]! >= agentId,
              )
            ) {
              throw new Error(
                "database returned invalid behavioral comparison agents",
              );
            }
            return [runId, Object.freeze(agentIds)] as const;
          }),
        );
        const baselineAgents = agentsByRun.get(baselineRunId);
        const candidateAgents = agentsByRun.get(candidateRunId);
        if (
          baselineAgents === undefined ||
          candidateAgents === undefined ||
          baselineAgents.length !== candidateAgents.length ||
          !baselineAgents.every(
            (agentId, index) => agentId === candidateAgents[index],
          )
        ) {
          throw new Error("invalid_matched_behavioral_comparison");
        }

        const metricDeltas = (
          [
            ["attention", "mean_attention"],
            ["resonance", "mean_resonance"],
            ["trust", "mean_trust"],
          ] as const
        ).map(([key, field]) =>
          Object.freeze({
            key,
            candidate_minus_baseline:
              candidate.report[field] - baseline.report[field],
          }),
        );
        const actionShareDeltas = baseline.report.action_shares.map(
          ([key, baselineShare], index) =>
            Object.freeze({
              key,
              candidate_minus_baseline:
                candidate.report.action_shares[index]![1] - baselineShare,
            }),
        );
        return validatedBehavioralComparison({
          study_id: baseline.studyId,
          baseline_run_id: baselineRunId,
          candidate_run_id: candidateRunId,
          paired_agents: baselineAgents.length,
          metric_deltas: metricDeltas,
          action_share_deltas: actionShareDeltas,
          interpretation: "experimental_matched_synthetic_difference",
          winner: null,
          limitations: [
            "No variant winner, lift, causal effect, or human preference is established.",
            "Synthetic-agent diagnostic only. It is not observed human evidence or a population estimate.",
          ],
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getRunAuditHistory(
    identity: VerifiedIdentity,
    runId: string,
  ): Promise<RunAuditHistoryResponseDto> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select
            history.event_id::text as event_id,
            history.previous_state::text as previous_state,
            history.new_state::text as new_state,
            history.attempt_number::integer as attempt_number,
            history.safe_reason,
            history.actor_type::text as actor_type,
            history.correlation_id::text as correlation_id,
            pg_catalog.to_char(
              history.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at
          from api.get_run_audit_history($1::uuid, $2::integer) as history
          `,
          [runId, 50],
        );
        if (result.rows.length < 1 || result.rows.length > 50) {
          throw new Error("database returned an invalid run audit history");
        }
        return Object.freeze({
          run_id: runId,
          events: Object.freeze(result.rows.map(runAuditEvent)),
          disclosure:
            "Run state evidence only. Actor identities, payloads, prompts, agent memory, rationale, and free-form metadata are excluded.",
        });
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  async getSimulationProvenance(
    identity: VerifiedIdentity,
    runId: string,
  ): Promise<SimulationProvenanceResponseDto> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(
          `
          select
            runs.id::text as id,
            pg_catalog.to_char(
              runs.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at,
            case
              when runs.terminal_at is null then null
              else pg_catalog.to_char(
                runs.terminal_at at time zone 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
              )
            end as terminal_at,
            runs.frozen_manifest,
            runs.frozen_manifest_sha256,
            runs.deterministic_seed::text as deterministic_seed,
            case
              when results.created_at is null then null
              else pg_catalog.to_char(
                results.created_at at time zone 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
              )
            end as result_created_at,
            receipts.receipt_version,
            receipts.receipt_kind,
            receipts.provider_id,
            receipts.provider_version,
            receipts.model_id,
            receipts.template_id,
            receipts.response_schema_version,
            receipts.finish_status,
            receipts.input_tokens,
            receipts.output_tokens,
            receipts.cost_microusd,
            case
              when receipts.started_at is null then null
              else pg_catalog.to_char(
                receipts.started_at at time zone 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
              )
            end as provider_started_at,
            case
              when receipts.ended_at is null then null
              else pg_catalog.to_char(
                receipts.ended_at at time zone 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
              )
            end as provider_ended_at,
            receipts.safe_error_class
          from api.simulation_runs as runs
          left join api.simulation_results as results
            on results.run_id = runs.id
          left join lateral
            private.provider_success_receipt_for_run(runs.id) as receipts
            on true
          where runs.id = $1::uuid
          `,
          [runId],
        );
        const row = result.rows[0];
        if (row === undefined) {
          throw notFound();
        }
        return this.provenance(row);
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  private async visibleResource(
    identity: VerifiedIdentity,
    query: string,
    resourceId: string,
  ): Promise<string> {
    try {
      return await this.transaction(identity, async (client) => {
        const result = await client.query(query, [resourceId]);
        const row = result.rows[0];
        if (row === undefined) {
          throw notFound();
        }
        return uuidValue(row.id, "visible resource organization id");
      });
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw databaseProblem(error);
    }
  }

  private async projectDetail(
    client: PoolClient,
    projectId: string,
  ): Promise<ProjectDetailRecord> {
    const projectResult = await client.query(
      `
      select
        projects.id::text as id,
        projects.organization_id::text as organization_id,
        projects.name,
        projects.objective,
        projects.market,
        projects.language,
        projects.category,
        projects.status::text as status,
        projects.version,
        pg_catalog.to_char(
          projects.created_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ) as created_at,
        pg_catalog.to_char(
          projects.updated_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ) as updated_at
      from api.projects as projects
      where projects.id = $1::uuid
      `,
      [projectId],
    );
    const projectRow = projectResult.rows[0];
    if (projectRow === undefined) {
      throw notFound();
    }
    const rows = await client.query(
      `
      select
        stimuli.id::text as stimulus_id,
        stimuli.organization_id::text as organization_id,
        stimuli.project_id::text as project_id,
        stimuli.name as stimulus_name,
        stimuli.status::text as stimulus_status,
        pg_catalog.to_char(
          stimuli.created_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ) as stimulus_created_at,
        versions.id::text as version_id,
        versions.version as stimulus_version,
        versions.content,
        versions.content_sha256,
        pg_catalog.to_char(
          versions.created_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ) as version_created_at
      from api.stimuli as stimuli
      left join api.stimulus_versions as versions
        on versions.organization_id = stimuli.organization_id
       and versions.stimulus_id = stimuli.id
      where stimuli.project_id = $1::uuid
      order by stimuli.created_at, stimuli.id, versions.version
      `,
      [projectId],
    );
    const grouped = new Map<
      string,
      { row: QueryResultRow; versions: StimulusVersionRecord[] }
    >();
    for (const row of rows.rows) {
      const stimulusId = uuidValue(row.stimulus_id, "stimulus id");
      let current = grouped.get(stimulusId);
      if (current === undefined) {
        current = {
          row,
          versions: [],
        };
      }
      if (row.version_id !== null) {
        current.versions.push(stimulusVersion(row));
      }
      grouped.set(stimulusId, current);
    }
    const stimuli = [...grouped.entries()].map(([id, value]) =>
      Object.freeze({
        id,
        organization_id: uuidValue(
          value.row.organization_id,
          "stimulus organization id",
        ),
        project_id: uuidValue(value.row.project_id, "stimulus project id"),
        name: exactString(value.row.stimulus_name, "stimulus name"),
        status: enumValue(value.row.stimulus_status, [
          "active",
          "retired",
          "deleted",
        ] as const),
        created_at: timestampValue(
          value.row.stimulus_created_at,
          "stimulus creation time",
        ),
        versions: Object.freeze(value.versions),
      }),
    );
    return Object.freeze({
      ...project(projectRow),
      stimuli: Object.freeze(stimuli),
    });
  }

  private async addFailureContext(
    client: PoolClient,
    row: QueryResultRow,
    runIdKey: "id" | "run_id",
    stateKey: "state" | "run_state",
  ): Promise<void> {
    if (row[stateKey] !== "failed") {
      return;
    }
    const result = await client.query(
      `
      select
        context.correlation_id::text as correlation_id,
        context.terminal_error_code
      from api.get_run_failure_context($1::uuid) as context
      `,
      [row[runIdKey]],
    );
    const failure = result.rows[0];
    if (failure === undefined) {
      throw new Error("failed simulation run support context is missing");
    }
    row.correlation_id = failure.correlation_id;
    row.terminal_error_code = failure.terminal_error_code;
  }

  private provenance(row: QueryResultRow): SimulationProvenanceResponseDto {
    const runId = uuidValue(row.id, "provenance run id");
    const createdAt = timestampValue(
      row.created_at,
      "provenance creation time",
    );
    const terminalAt = nullableTimestamp(
      row.terminal_at,
      "provenance terminal time",
    );
    const resultCreatedAt = nullableTimestamp(
      row.result_created_at,
      "provenance result creation time",
    );
    const frozenManifestSha256 = sha256Value(
      row.frozen_manifest_sha256,
      "frozen manifest checksum",
    );
    const deterministicSeed = exactString(
      row.deterministic_seed,
      "deterministic seed",
    );
    if (!/^-?[0-9]{1,19}$/.test(deterministicSeed)) {
      throw new Error("database returned an invalid deterministic seed");
    }
    const manifest = jsonObject(row.frozen_manifest, "frozen manifest");
    if (
      !Object.hasOwn(manifest, "code") ||
      !Object.hasOwn(manifest, "configuration") ||
      !Object.hasOwn(manifest, "limits")
    ) {
      return Object.freeze({
        availability: "legacy_unavailable",
        unavailable_reason: "frozen_provenance_not_captured",
        run_id: runId,
        created_at: createdAt,
        terminal_at: terminalAt,
        result_created_at: resultCreatedAt,
        frozen_manifest_sha256: frozenManifestSha256,
        deterministic_seed: deterministicSeed,
        stimulus: null,
        audience: null,
        execution: null,
        limits: null,
        provider_receipt: null,
      });
    }
    const stimulus = jsonObject(manifest.stimulus, "frozen stimulus manifest");
    const audience = jsonObject(manifest.audience, "frozen audience manifest");
    const audienceManifest = jsonObject(
      audience.manifest,
      "frozen audience detail",
    );
    const execution = jsonObject(
      manifest.execution,
      "frozen execution manifest",
    );
    const code = jsonObject(manifest.code, "frozen code manifest");
    const configuration = jsonObject(
      manifest.configuration,
      "frozen configuration manifest",
    );
    const limits = jsonObject(manifest.limits, "frozen limits manifest");
    if (
      audience.kind !== "authored_demo" ||
      audience.non_representative !== true ||
      manifest.method_version !== "phase2_demo_v1" ||
      manifest.disclosure_version !== "phase2_demo_v1" ||
      execution.language !== "en" ||
      execution.output_schema_version !== 1 ||
      execution.provider_id !== "deterministic_mock" ||
      execution.provider_version !== 1 ||
      limits.version !== "phase2_2026_07_17" ||
      limits.arq_job_timeout_seconds !== 30 ||
      limits.provider_cost_ceiling !== 0 ||
      limits.max_database_attempts !== 3 ||
      limits.max_dispatch_generations !== 3 ||
      limits.max_result_bytes !== 131072
    ) {
      throw new Error("database returned malformed frozen provenance");
    }
    const codeReleaseSha = exactString(code.release_sha, "code release sha");
    if (!/^[0-9a-f]{40}$/.test(codeReleaseSha)) {
      throw new Error("database returned an invalid code release sha");
    }
    const providerReceipt = this.providerReceipt(row, resultCreatedAt);
    return Object.freeze({
      availability: "available",
      unavailable_reason: null,
      run_id: runId,
      created_at: createdAt,
      terminal_at: terminalAt,
      result_created_at: resultCreatedAt,
      frozen_manifest_sha256: frozenManifestSha256,
      deterministic_seed: deterministicSeed,
      stimulus: Object.freeze({
        version_id: uuidValue(
          stimulus.version_id,
          "provenance stimulus version id",
        ),
        content: exactString(stimulus.content, "provenance stimulus content"),
        content_sha256: sha256Value(
          stimulus.content_sha256,
          "provenance stimulus checksum",
        ),
      }),
      audience: Object.freeze({
        version_id: uuidValue(
          audience.version_id,
          "provenance audience version id",
        ),
        kind: "authored_demo",
        checksum_sha256: sha256Value(
          audience.checksum_sha256,
          "provenance audience checksum",
        ),
        cells: provenanceCells(audienceManifest.audience_cells),
        non_representative: true,
        limitations: Object.freeze([
          "Estimates nobody and is not representative of any population.",
        ]),
      }),
      execution: Object.freeze({
        method_version: "phase2_demo_v1",
        disclosure_version: "phase2_demo_v1",
        language: "en",
        output_schema_version: 1,
        provider_id: "deterministic_mock",
        provider_version: 1,
        pipeline_release_id: "phase2_deterministic_mock_v1",
        code_release_sha: codeReleaseSha,
        configuration_sha256: sha256Value(
          configuration.sha256,
          "configuration checksum",
        ),
      }),
      limits: Object.freeze({
        version: "phase2_2026_07_17",
        arq_job_timeout_seconds: 30,
        provider_cost_ceiling: 0,
        max_database_attempts: 3,
        max_dispatch_generations: 3,
        max_result_bytes: 131072,
      }),
      provider_receipt: providerReceipt,
    });
  }

  private providerReceipt(
    row: QueryResultRow,
    resultCreatedAt: string | null,
  ): ProvenanceProviderReceiptDto | null {
    if (resultCreatedAt === null) {
      if (row.receipt_version !== null) {
        throw new Error(
          "database returned a receipt without a simulation result",
        );
      }
      return null;
    }
    if (row.receipt_version === null) {
      return Object.freeze({
        availability: "legacy_unavailable",
        unavailable_reason: "successful_result_receipt_not_captured",
      });
    }
    const startedAt = timestampValue(
      row.provider_started_at,
      "provider start time",
    );
    const endedAt = timestampValue(row.provider_ended_at, "provider end time");
    const duration = Date.parse(endedAt) - Date.parse(startedAt);
    if (duration < 0 || duration > 30_000) {
      throw new Error("database returned an invalid provider duration");
    }
    if (
      row.receipt_version !== 1 ||
      row.receipt_kind !== "successful_result" ||
      row.provider_id !== "deterministic_mock" ||
      row.provider_version !== 1 ||
      row.model_id !== "deterministic_fixture_v1" ||
      row.template_id !== "phase2_deterministic_mock_v1" ||
      row.response_schema_version !== 1 ||
      row.finish_status !== "completed" ||
      row.safe_error_class !== null
    ) {
      throw new Error("database returned malformed provider provenance");
    }
    return Object.freeze({
      availability: "available",
      schema_version: 1,
      receipt_kind: "successful_result",
      provider_id: "deterministic_mock",
      provider_version: 1,
      model_id: "deterministic_fixture_v1",
      template_id: "phase2_deterministic_mock_v1",
      response_schema_version: 1,
      finish_status: "completed",
      usage: Object.freeze({
        input_tokens: exactZero(row.input_tokens, "provider input tokens"),
        output_tokens: exactZero(row.output_tokens, "provider output tokens"),
        cost_microusd: exactZero(row.cost_microusd, "provider cost"),
      }),
      started_at: startedAt,
      ended_at: endedAt,
      safe_error_class: null,
    });
  }

  private async transaction<T>(
    identity: VerifiedIdentity,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    let client: PoolClient;
    let destroyed = false;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw databaseProblem(error);
    }
    try {
      await client.query("begin");
      await client.query(
        `
        select
          pg_catalog.set_config('statement_timeout', '8000', true),
          pg_catalog.set_config('lock_timeout', '2000', true),
          pg_catalog.set_config(
            'idle_in_transaction_session_timeout',
            '10000',
            true
          ),
          pg_catalog.set_config('request.jwt.claims', $1, true),
          pg_catalog.set_config('simula.release_sha', $2, true)
        `,
        [databaseClaims(identity), this.config.releaseSha],
      );
      const value = await operation(client);
      await client.query("commit");
      return value;
    } catch (error) {
      try {
        await client.query("rollback");
      } catch {
        client.release(true);
        destroyed = true;
        throw error;
      }
      throw error;
    } finally {
      if (!destroyed) {
        client.release();
      }
    }
  }
}
