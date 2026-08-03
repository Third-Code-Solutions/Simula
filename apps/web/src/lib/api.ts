import type { components, ControlPlaneComponents } from "@simula/contracts";

import {
  STIMULUS_ASSET_MAX_BYTES,
  STIMULUS_ASSET_MEDIA_TYPES,
  type StimulusAsset,
  type StimulusAssetMediaType,
  type StimulusAssetReserveInput,
  parseStimulusAsset,
  parseStimulusAssetCollection,
  parseStimulusAssetCommand,
} from "@/features/assets/stimulus-asset-contract";
import {
  type VisualStimulusProfileRecord,
  parseVisualStimulusProfileResponse,
} from "@/features/assets/visual-profile-contract";
import {
  type BehavioralComparison,
  parseBehavioralComparison,
} from "@/features/runs/behavioral-comparison-contract";
import {
  type BehavioralEvidence,
  parseBehavioralEvidence,
} from "@/features/runs/behavioral-evidence-contract";
import {
  type BehavioralResult,
  parseBehavioralResult,
} from "@/features/runs/behavioral-result-contract";
import {
  type SimulationProvenance,
  type SimulationResult,
  type SimulationRun,
  parseSimulationProvenance,
  parseSimulationResult,
  parseSimulationRun,
} from "@/features/runs/result-contract";
import {
  type RunAuditHistory,
  parseRunAuditHistory,
} from "@/features/runs/run-audit-history-contract";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

type Schemas = components["schemas"];
type ControlPlaneSchemas = ControlPlaneComponents["schemas"];

export type Organization = Schemas["OrganizationResponse"];
export type OrganizationPage = Schemas["OrganizationPage"];
export type OrganizationDashboard = Schemas["OrganizationDashboardResponse"];
export type OrganizationDeletion =
  ControlPlaneSchemas["OrganizationDeletionResponseDto"];
export type Project = Schemas["ProjectResponse"];
export type ProjectDetail = Schemas["ProjectDetail"];
export type ProjectPage = Schemas["ProjectPage"];
export type CampaignLabCampaign = Readonly<{
  campaign_id?: string;
  id?: string;
  organization_id: string;
  project_id: string;
  name: string;
  objective: string;
  purpose: string;
  status: string;
  current_stage: string;
  compliance_status: string;
  version: number;
  created_at: string;
  updated_at: string;
}>;
export type CampaignLabCampaignPage = Readonly<{
  items: ReadonlyArray<CampaignLabCampaign>;
  pagination: Readonly<{ limit: number; offset: number }>;
}>;
export type CampaignLabCommand = Readonly<{
  campaign_id?: string;
  run_id?: string;
  artifact_id?: string;
  status: string;
  stage?: string;
  progress?: number;
  replayed?: boolean;
  created_at?: string;
}>;
export type CampaignLabAuditPage = Readonly<{
  items: ReadonlyArray<Readonly<Record<string, unknown>>>;
  pagination: Readonly<{ limit: number; offset: number }>;
}>;
export type CampaignLabRunStatus = Readonly<{
  id: string;
  campaign_id: string;
  run_type: string;
  status: string;
  stage: string;
  progress: number;
  attempt_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  last_error_code: string | null;
  retention_until: string | null;
}>;
export type CampaignLabDurableRun = CampaignLabRunStatus &
  Readonly<{
    result?: Readonly<Record<string, unknown>> | null;
  }>;
export type CampaignLabResearchRun = CampaignLabRunStatus &
  Readonly<{ result?: Readonly<Record<string, unknown>> }>;
export type CampaignLabRanking = Readonly<{
  metric_key: string;
  repetition_count: number;
  pairwise_rank_agreement: number;
  top_variant_key: string | null;
  stability_label: string;
  variants: ReadonlyArray<
    Readonly<{
      variant_key: string;
      mean_rank: number;
      top_rank_probability: number;
    }>
  >;
}>;
export type CampaignLabSimulationResult = Readonly<{
  run_id: string;
  evidence_status: "Synthetic-only";
  result: Readonly<{
    sample_size: number;
    repetitions: number;
    overall_component_rankings: Readonly<Record<string, CampaignLabRanking>>;
    cohort_findings: ReadonlyArray<
      Readonly<{
        cohort_key: string;
        dimensions: Readonly<Record<string, string>>;
        population_weight: number;
        repetition_count: number;
        evidence_status: "Synthetic-only";
        component_rankings: Readonly<Record<string, CampaignLabRanking>>;
      }>
    >;
    synthetic_observations: ReadonlyArray<Readonly<Record<string, unknown>>>;
    behavioral_diagnostics?: Readonly<{
      variants: ReadonlyArray<
        Readonly<{
          variant_key: string;
          interviewable_agents: ReadonlyArray<Readonly<{ agent_id: string }>>;
        }>
      >;
    }>;
  }>;
}>;
export type Stimulus = Schemas["StimulusResponse"];
export type StimulusVersion = Schemas["StimulusVersionResponse"];
export type AudienceDisclosure = Schemas["AudienceDisclosureResponse"];
export type AuthEvent = Schemas["AuthEventResponse"];
export type {
  BehavioralComparison,
  BehavioralEvidence,
  BehavioralResult,
  SimulationProvenance,
  SimulationResult,
  SimulationRun,
  RunAuditHistory,
  VisualStimulusProfileRecord,
};

export type ApiProblemDocument = Readonly<{
  code: string;
  correlation_id: string;
  detail: string;
  errors?: ReadonlyArray<Record<string, string>> | null;
  instance: string;
  status: number;
  title: string;
  type: string;
}>;

export type ReportExportDownload = Readonly<{
  blob: Blob;
  filename: string;
}>;

export type StimulusAssetDownload = Readonly<{
  blob: Blob;
  filename: string;
}>;

export type {
  StimulusAsset,
  StimulusAssetMediaType,
  StimulusAssetReserveInput,
};
export { STIMULUS_ASSET_MAX_BYTES, STIMULUS_ASSET_MEDIA_TYPES };

export class ApiProblem extends Error {
  public readonly correlationId: string | undefined;
  public readonly retryAfterSeconds: number | undefined;

  public constructor(
    public readonly status: number,
    public readonly code: string,
    detail: string,
    correlationId?: string,
    retryAfterSeconds?: number,
  ) {
    super(
      retryAfterSeconds === undefined
        ? detail
        : `${detail} Retry after ${retryAfterSeconds} seconds.`,
    );
    this.correlationId = correlationId;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value || !/^\d{1,4}$/.test(value)) {
    return undefined;
  }
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 3600
    ? seconds
    : undefined;
}

function apiOrigin(): string {
  const value = process.env.NEXT_PUBLIC_SIMULA_API_URL;
  if (!value) {
    throw new ApiProblem(
      503,
      "api_unconfigured",
      "SIMULA API is not configured.",
    );
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    return url.origin;
  } catch {
    throw new ApiProblem(
      503,
      "api_unconfigured",
      "SIMULA API is not configured.",
    );
  }
}

function domainPath(path: string): string {
  const version = process.env.NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION ?? "v1";
  if (version !== "v1" && version !== "v2") {
    throw new ApiProblem(
      503,
      "api_unconfigured",
      "SIMULA domain API migration is not configured safely.",
    );
  }
  if (!path.startsWith("/")) {
    throw new Error("domain API paths must be absolute");
  }
  return `/api/${version}${path}`;
}

function domainV2Path(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error("domain API paths must be absolute");
  }
  return `/api/v2${path}`;
}

function asProblem(value: unknown): ApiProblemDocument | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const document = value as Record<string, unknown>;
  if (
    typeof document.code !== "string" ||
    typeof document.detail !== "string" ||
    typeof document.status !== "number" ||
    typeof document.title !== "string"
  ) {
    return undefined;
  }
  return {
    code: document.code,
    correlation_id:
      typeof document.correlation_id === "string"
        ? document.correlation_id
        : "",
    detail: document.detail,
    errors: Array.isArray(document.errors)
      ? document.errors.filter(
          (item): item is Record<string, string> =>
            !!item &&
            typeof item === "object" &&
            Object.values(item).every((entry) => typeof entry === "string"),
        )
      : undefined,
    instance: typeof document.instance === "string" ? document.instance : "",
    status: document.status,
    title: document.title,
    type: typeof document.type === "string" ? document.type : "about:blank",
  };
}

async function accessToken(): Promise<string> {
  const { data, error } = await getBrowserSupabaseClient().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new ApiProblem(
      401,
      "unauthenticated",
      "Your session has ended. Sign in again.",
    );
  }
  return data.session.access_token;
}

type RequestOptions = Readonly<{
  body?: object;
  headers?: HeadersInit;
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
}>;

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json, application/problem+json");
  headers.set("Authorization", `Bearer ${await accessToken()}`);
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${apiOrigin()}${path}`, {
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      headers,
      method: options.method ?? "GET",
    });
  } catch {
    throw new ApiProblem(
      503,
      "api_unavailable",
      "SIMULA API is temporarily unavailable. Retry shortly.",
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown =
    contentType.includes("application/json") ||
    contentType.includes("application/problem+json")
      ? await response.json().catch(() => undefined)
      : undefined;
  if (!response.ok) {
    const problem = asProblem(payload);
    throw new ApiProblem(
      response.status,
      problem?.code ?? "request_failed",
      problem?.detail ?? "SIMULA could not complete that request.",
      problem?.correlation_id ||
        response.headers.get("x-correlation-id") ||
        undefined,
      retryAfterSeconds(response.headers.get("retry-after")),
    );
  }
  if (payload === undefined) {
    throw new ApiProblem(
      502,
      "invalid_api_response",
      "SIMULA API returned an invalid response.",
    );
  }
  return payload as T;
}

function idempotencyHeaders(idempotencyKey = crypto.randomUUID()): HeadersInit {
  return { "Idempotency-Key": idempotencyKey };
}

function parsedResponse<T>(parser: (value: unknown) => T, value: unknown): T {
  try {
    return parser(value);
  } catch {
    throw new ApiProblem(
      502,
      "invalid_api_response",
      "SIMULA API returned an invalid response.",
    );
  }
}

async function responsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json") ||
    contentType.includes("application/problem+json")
    ? response.json().catch(() => undefined)
    : undefined;
}

function responseProblem(response: Response, payload: unknown): ApiProblem {
  const problem = asProblem(payload);
  return new ApiProblem(
    response.status,
    problem?.code ?? "request_failed",
    problem?.detail ?? "SIMULA could not complete that request.",
    problem?.correlation_id ||
      response.headers.get("x-correlation-id") ||
      undefined,
    retryAfterSeconds(response.headers.get("retry-after")),
  );
}

async function assetFetch(
  path: string,
  init: Readonly<{
    accept: string;
    body?: BodyInit;
    contentType?: StimulusAssetMediaType;
    idempotencyKey?: string;
    method: "GET" | "PUT";
  }>,
): Promise<Response> {
  const headers = n
ew Headers();
  headers.set("Accept", init.accept);
  headers.set("Authorization", `Bearer ${await accessToken()}`);
  if (init.contentType) {
    headers.set("Content-Type", init.contentType);
  }
  if (init.idempotencyKey) {
    headers.set("Idempotency-Key", init.idempotencyKey);
  }
  try {
    return await fetch(`${apiOrigin()}${path}`, {
      body: init.body,
      cache: "no-store",
      headers,
      method: init.method,
    });
  } catch {
    throw new ApiProblem(
      503,
      "api_unavailable",
      "SIMULA API is temporarily unavailable. Retry shortly.",
    );
  }
}

function assetIdentity(
  asset: StimulusAsset,
  expected: Readonly<{ assetId?: string; stimulusId?: string }>,
): StimulusAsset {
  if (
    (expected.assetId && asset.asset_id !== expected.assetId) ||
    (expected.stimulusId && asset.stimulus_id !== expected.stimulusId)
  ) {
    throw new Error("stimulus asset identity mismatch");
  }
  return asset;
}

export function listOrganizations(cursor?: string): Promise<OrganizationPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<OrganizationPage>(domainPath(`/organizations${query}`));
}

export function createOrganization(name: string): Promise<Organization> {
  return request<Organization>(domainPath("/organizations"), {
    body: { name },
    headers: idempotencyHeaders(),
    method: "POST",
  });
}

export function getOrganizationDashboard(
  organizationId: string,
): Promise<OrganizationDashboard> {
  return request<OrganizationDashboard>(
    domainPath(`/organizations/${organizationId}/dashboard`),
  );
}

export function deleteOrganization(
  organizationId: string,
  confirmation: string,
): Promise<OrganizationDeletion> {
  return request<OrganizationDeletion>(
    `/api/v2/organizations/${organizationId}/deletion`,
    {
      body: { confirmation },
      headers: idempotencyHeaders(),
      method: "POST",
    },
  );
}

export function recordSignIn(): Promise<AuthEvent> {
  return request<AuthEvent>(domainPath("/auth-events"), {
    body: { kind: "sign_in" },
    method: "POST",
  });
}

export function listProjects(
  organizationId: string,
  cursor?: string,
): Promise<ProjectPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<ProjectPage>(
    domainPath(`/organizations/${organizationId}/projects${query}`),
  );
}

export function createProject(
  organizationId: string,
  input: Pick<
    Project,
    "category" | "language" | "market" | "name" | "objective"
  >,
): Promise<Project> {
  return request<Project>(
    domainPath(`/organizations/${organizationId}/projects`),
    {
      body: input,
      headers: idempotencyHeaders(),
      method: "POST",
    },
  );
}

export function getProject(projectId: string): Promise<ProjectDetail> {
  return request<ProjectDetail>(domainPath(`/projects/${projectId}`));
}

export function listCampaignLabCampaigns(
  projectId: string,
): Promise<CampaignLabCampaignPage> {
  return request<CampaignLabCampaignPage>(
    domainPath(
      `/campaign-lab/campaigns?project_id=${encodeURIComponent(projectId)}`,
    ),
  );
}

export function createCampaignLabCampaign(input: {
  project_id: string;
  name: string;
  objective: string;
  purpose: string;
  decision: Record<string, unknown>;
}): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(domainPath("/campaign-lab/campaigns"), {
    body: input,
    headers: idempotencyHeaders(),
    method: "POST",
  });
}

export function createCampaignLabResearch(
  campaignId: string,
  input: Readonly<{
    title: string;
    payload: Readonly<Record<string, unknown>>;
    provenance?: Readonly<Record<string, unknown>>;
    source: Readonly<Record<string, unknown>>;
    filename: string;
    media_type:
      | "text/plain"
      | "text/markdown"
      | "text/csv"
      | "application/json"
      | "application/pdf"
      | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    chunk_size?: number;
    overlap?: number;
    secret_payload: Readonly<Record<string, unknown>>;
  }>,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainPath(`/campaign-lab/campaigns/${campaignId}/research`),
    {
      body: input,
      headers: idempotencyHeaders(),
      method: "POST",
    },
  );
}

export function getCampaignLabResearchRun(
  runId: string,
): Promise<CampaignLabResearchRun> {
  return request<CampaignLabResearchRun>(
    domainPath(`/campaign-lab/research/runs/${runId}`),
  );
}

export function createCampaignLabSimulation(
  campaignId: string,
  requestBody: Record<string, unknown>,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainPath(`/campaign-lab/campaigns/${campaignId}/simulations`),
    {
      body: { request: requestBody },
      headers: idempotencyHeaders(),
      method: "POST",
    },
  );
}

export function createCampaignLabCulturalEvaluation(
  campaignId: string,
  suite: Readonly<Record<string, unknown>>,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainPath(`/campaign-lab/campaigns/${campaignId}/cultural-evaluations`),
    {
      body: { suite },
      headers: idempotencyHeaders(),
      method: "POST",
    },
  );
}

export function getCampaignLabSimulationStatus(
  runId: string,
): Promise<CampaignLabRunStatus> {
  return request<CampaignLabRunStatus>(
    domainPath(`/campaign-lab/simulations/${runId}/status`),
  );
}

export function getCampaignLabSimulationResults(
  runId: string,
): Promise<CampaignLabSimulationResult> {
  return request<CampaignLabSimulationResult>(
    domainPath(`/campaign-lab/simulations/${runId}/results`),
  );
}

export function createCampaignLabInterview(
  campaignId: string,
  input: Readonly<Record<string, unknown>>,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainPath(`/campaign-lab/campaigns/${campaignId}/interviews`),
    { body: input, headers: idempotencyHeaders(), method: "POST" },
  );
}

export function getCampaignLabInterviewRun(
  runId: string,
): Promise<CampaignLabDurableRun> {
  return request<CampaignLabDurableRun>(
    domainPath(`/campaign-lab/interviews/runs/${runId}`),
  );
}

export function createCampaignLabSurveyImport(
  campaignId: string,
  input: Readonly<Record<string, unknown>>,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainPath(`/campaign-lab/campaigns/${campaignId}/surveys/import`),
    { body: input, headers: idempotencyHeaders(), method: "POST" },
  );
}

export function getCampaignLabSurveyImportRun(
  runId: string,
): Promise<CampaignLabDurableRun> {
  return request<CampaignLabDurableRun>(
    domainPath(`/campaign-lab/surveys/runs/${runId}`),
  );
}

export function createCampaignLabCalibration(
  campaignId: string,
  input: Readonly<Record<string, unknown>>,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainPath(`/campaign-lab/campaigns/${campaignId}/calibrations`),
    { body: input, headers: idempotencyHeaders(), method: "POST" },
  );
}

export function getCampaignLabCalibrationRun(
  runId: string,
): Promise<CampaignLabDurableRun> {
  return request<CampaignLabDurableRun>(
    domainPath(`/campaign-lab/calibrations/${runId}`),
  );
}

export function createCampaignLabBacktest(
  campaignId: string,
  input: Readonly<Record<string, unknown>>,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainPath(`/campaign-lab/campaigns/${campaignId}/backtests`),
    { body: input, headers: idempotencyHeaders(), method: "POST" },
  );
}

export function getCampaignLabBacktestRun(
  runId: string,
): Promise<CampaignLabDurableRun> {
  return request<CampaignLabDurableRun>(
    domainPath(`/campaign-lab/backtests/${runId}`),
  );
}

export function createCampaignLabComplianceReview(
  campaignId: string,
  input: Readonly<Record<string, unknown>>,
): Promise<CampaignLabCommand> {
  return re…1347 tokens truncated…e = response.headers.get("content-type")?.toLowerCase();
  const rawLength = response.headers.get("content-length");
  const expectedSha256 = /^"([0-9a-f]{64})"$/.exec(
    response.headers.get("etag") ?? "",
  )?.[1];
  const disposition = /^inline; filename="([^"]{1,120})"$/.exec(
    response.headers.get("content-disposition") ?? "",
  )?.[1];
  if (
    contentType !== expected.media_type ||
    rawLength === null ||
    !/^[0-9]+$/.test(rawLength) ||
    Number(rawLength) !== expected.expected_byte_size ||
    Number(rawLength) > STIMULUS_ASSET_MAX_BYTES ||
    expectedSha256 !== expected.expected_content_sha256 ||
    disposition !== expected.filename ||
    response.headers.get("cache-control") !== "private, no-store" ||
    response.headers.get("content-security-policy") !== "sandbox" ||
    response.headers.get("x-content-type-options") !== "nosniff"
  ) {
    throw new ApiProblem(
      502,
      "invalid_api_response",
      "SIMULA API returned an unsafe private campaign asset.",
    );
  }
  const blob = await response.blob();
  const bytes = await blob.arrayBuffer();
  const actualSha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
  if (
    blob.size !== expected.expected_byte_size ||
    blob.type !== expected.media_type ||
    actualSha256 !== expected.expected_content_sha256
  ) {
    throw new ApiProblem(
      502,
      "invalid_api_response",
      "SIMULA API returned an unsafe private campaign asset.",
    );
  }
  return Object.freeze({ blob, filename: expected.filename });
}

export function deleteStimulusAsset(
  asset: StimulusAsset,
  idempotencyKey = crypto.randomUUID(),
): Promise<StimulusAsset> {
  const expected = parseStimulusAsset(asset);
  return request<unknown>(
    `/api/v2/stimulus-assets/${expected.asset_id}/deletion`,
    {
      body: {},
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  ).then((value) =>
    parsedResponse(
      (response) =>
        assetIdentity(parseStimulusAssetCommand(response), {
          assetId: expected.asset_id,
          stimulusId: expected.stimulus_id,
        }),
      value,
    ),
  );
}

function visualProfileIdentity(
  value: VisualStimulusProfileRecord,
  asset: StimulusAsset,
): VisualStimulusProfileRecord {
  if (
    value.asset_id !== asset.asset_id ||
    value.organization_id !== asset.organization_id ||
    value.stimulus_id !== asset.stimulus_id ||
    value.asset_content_sha256 !== asset.content_sha256
  ) {
    throw new Error("visual profile identity mismatch");
  }
  return value;
}

export function createStimulusVisualProfile(
  asset: StimulusAsset,
  idempotencyKey = crypto.randomUUID(),
): Promise<VisualStimulusProfileRecord> {
  const expected = parseStimulusAsset(asset);
  if (
    expected.status !== "available" ||
    expected.content_sha256 === null ||
    !["image/jpeg", "image/png", "image/webp"].includes(expected.media_type) ||
    Date.parse(expected.retention_until) <= Date.now()
  ) {
    return Promise.reject(
      new ApiProblem(
        409,
        "asset_unavailable",
        "Only an available JPEG, PNG, or WebP can be technically profiled.",
      ),
    );
  }
  return request<unknown>(
    `/api/v2/stimulus-assets/${expected.asset_id}/visual-profile`,
    {
      body: { methodology_version: "technical_image_signals_v1" },
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  ).then((value) =>
    parsedResponse(
      (response) =>
        visualProfileIdentity(
          parseVisualStimulusProfileResponse(response),
          expected,
        ),
      value,
    ),
  );
}

export function getStimulusVisualProfile(
  asset: StimulusAsset,
): Promise<VisualStimulusProfileRecord> {
  const expected = parseStimulusAsset(asset);
  return request<unknown>(
    `/api/v2/stimulus-assets/${expected.asset_id}/visual-profile`,
  ).then((value) =>
    parsedResponse(
      (response) =>
        visualProfileIdentity(
          parseVisualStimulusProfileResponse(response),
          expected,
        ),
      value,
    ),
  );
}

export function createSimulationRun(
  projectId: string,
  stimulusVersionId: string,
  idempotencyKey = crypto.randomUUID(),
): Promise<SimulationRun> {
  return request<unknown>(domainPath(`/projects/${projectId}/runs`), {
    body: { stimulus_version_id: stimulusVersionId },
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
  }).then((value) => parsedResponse(parseSimulationRun, value));
}

export function createBehavioralDemoRun(
  projectId: string,
  stimulusVersionId: string,
  variantKey: string,
  idempotencyKey = crypto.randomUUID(),
): Promise<SimulationRun> {
  return request<unknown>(
    `/api/v2/projects/${projectId}/behavioral-demo-runs`,
    {
      body: {
        stimulus_version_id: stimulusVersionId,
        variant_key: variantKey,
      },
      headers: { "Idempotency-Key": idempotencyKey },
      method: "POST",
    },
  ).then((value) => parsedResponse(parseSimulationRun, value));
}

export function getSimulationRun(runId: string): Promise<SimulationRun> {
  return request<unknown>(domainPath(`/runs/${runId}`)).then((value) =>
    parsedResponse(parseSimulationRun, value),
  );
}

export function cancelSimulationRun(runId: string): Promise<SimulationRun> {
  return request<unknown>(domainPath(`/runs/${runId}/cancel`), {
    body: {},
    method: "POST",
  }).then((value) => parsedResponse(parseSimulationRun, value));
}

export function getSimulationResult(runId: string): Promise<SimulationResult> {
  return request<unknown>(domainPath(`/runs/${runId}/result`)).then((value) =>
    parsedResponse(parseSimulationResult, value),
  );
}

export function getBehavioralResult(runId: string): Promise<BehavioralResult> {
  return request<unknown>(`/api/v2/runs/${runId}/behavioral-result`).then(
    (value) =>
      parsedResponse(
        (response) => parseBehavioralResult(response, runId),
        value,
      ),
  );
}

export function getBehavioralEvidence(
  runId: string,
): Promise<BehavioralEvidence> {
  return request<unknown>(`/api/v2/runs/${runId}/behavioral-evidence`).then(
    (value) =>
      parsedResponse(
        (response) => parseBehavioralEvidence(response, runId),
        value,
      ),
  );
}

export function getRunAuditHistory(runId: string): Promise<RunAuditHistory> {
  return request<unknown>(`/api/v2/runs/${runId}/audit-history`).then((value) =>
    parsedResponse(
      (candidate) => parseRunAuditHistory(candidate, runId),
      value,
    ),
  );
}

export function getBehavioralComparison(
  candidateRunId: string,
  baselineRunId: string,
  studyId?: string,
): Promise<BehavioralComparison> {
  const query = new URLSearchParams({ baseline_run_id: baselineRunId });
  return request<unknown>(
    `/api/v2/runs/${candidateRunId}/behavioral-comparison?${query.toString()}`,
  ).then((value) =>
    parsedResponse(
      (response) =>
        parseBehavioralComparison(response, {
          baselineRunId,
          candidateRunId,
          studyId,
        }),
      value,
    ),
  );
}

export function getSimulationProvenance(
  runId: string,
): Promise<SimulationProvenance> {
  return request<unknown>(domainPath(`/runs/${runId}/provenance`)).then(
    (value) => parsedResponse(parseSimulationProvenance, value),
  );
}

export type ProductRecord = Record<string, unknown>;
export type ProductCollection = Readonly<{ items: ProductRecord[] }>;
export type ProductCommand = Readonly<{ data: ProductRecord }>;
export type MethodologyRegistry =
  ControlPlaneSchemas["MethodologyRegistryResponseDto"];

export type CampaignEvidenceRun = Readonly<{
  evidence_id: string;
  organization_id: string;
  project_id: string;
  kind: "survey_calibration" | "historical_backtest";
  status:
    | "queued"
    | "running"
    | "retrying"
    | "completed"
    | "failed"
    | "cancel_requested"
    | "canceled";
  stage: string;
  progress: number;
  source_version_id: string | null;
  outcome_set_id: string | null;
  created_at: string;
  retention_until: string;
  started_at: string | null;
  completed_at: string | null;
  attempt_count: number;
  last_error_code: string | null;
  last_error_detail: string | null;
  result: Readonly<Record<string, unknown>> | null;
  replayed: boolean;
}>;

export type CampaignEvidenceEvent = Readonly<{
  event_id: string;
  evidence_id: string;
  stage: string;
  progress: number;
  event_kind: string;
  message: string | null;
  created_at: string;
}>;

export type CampaignEvidenceEventCollection = Readonly<{
  items: readonly CampaignEvidenceEvent[];
}>;

export function getMethodologyRegistry(): Promise<MethodologyRegistry> {
  return request<MethodologyRegistry>(domainPath("/methodology/registry"));
}

export function createSurveyCalibration(
  projectId: string,
  input: Readonly<{
    source_version_id: string;
    synthetic_observations: readonly Readonly<Record<string, unknown>>[];
    survey?: Readonly<Record<string, unknown>>;
    survey_import?: Readonly<Record<string, unknown>>;
  }>,
): Promise<CampaignEvidenceRun> {
  return request<CampaignEvidenceRun>(
    domainV2Path(
      `/projects/${projectId}/campaign-evidence/survey-calibrations`,
    ),
    { body: input, headers: idempotencyHeaders(), method: "POST" },
  );
}

export function createHistoricalBacktest(
  projectId: string,
  input: Readonly<{
    outcome_set_id: string;
    protocol: Readonly<Record<string, unknown>>;
    prediction_set: Readonly<Record<string, unknown>>;
    baseline_prediction_set?: Readonly<Record<string, unknown>>;
    outcomes: Readonly<Record<string, unknown>>;
  }>,
): Promise<CampaignEvidenceRun> {
  return request<CampaignEvidenceRun>(
    domainV2Path(`/projects/${projectId}/campaign-evidence/backtests`),
    { body: input, headers: idempotencyHeaders(), method: "POST" },
  );
}

export function getCampaignEvidenceRun(
  evidenceId: string,
): Promise<CampaignEvidenceRun> {
  return request<CampaignEvidenceRun>(
    domainV2Path(`/campaign-evidence/${evidenceId}`),
  );
}

export function getCampaignEvidenceEvents(
  evidenceId: string,
): Promise<CampaignEvidenceEventCollection> {
  return request<CampaignEvidenceEventCollection>(
    domainV2Path(`/campaign-evidence/${evidenceId}/events`),
  );
}

export function cancelCampaignEvidenceRun(
  evidenceId: string,
): Promise<CampaignEvidenceRun> {
  return request<CampaignEvidenceRun>(
    domainV2Path(`/campaign-evidence/${evidenceId}/cancel`),
    { body: {}, method: "POST" },
  );
}

export function listAudienceDefinitions(
  organizationId: string,
): Promise<ProductCollection> {
  return request<ProductCollection>(
    domainPath(`/organizations/${organizationId}/audiences`),
  );
}

export function createAudienceDefinition(
  organizationId: string,
  input: ControlPlaneSchemas["AudienceCreateDto"],
): Promise<ControlPlaneSchemas["AudienceCommandResponseDto"]> {
  return request<ControlPlaneSchemas["AudienceCommandResponseDto"]>(
    domainPath(`/organizations/${organizationId}/audiences`),
    {
      body: input,
      headers: idempotencyHeaders(),
      method: "POST",
    },
  );
}

export function listSimulationConfigurations(
  projectId: string,
): Promise<ProductCollection> {
  return request<ProductCollection>(
    domainPath(`/projects/${projectId}/simulation-configurations`),
  );
}

export function createSimulationConfiguration(
  projectId: string,
  input: ControlPlaneSchemas["SimulationConfigurationCreateDto"],
): Promise<ControlPlaneSchemas["SimulationConfigurationResponseDto"]> {
  return request<ControlPlaneSchemas["SimulationConfigurationResponseDto"]>(
    domainPath(`/projects/${projectId}/simulation-configurations`),
    {
      body: input,
      headers: idempotencyHeaders(),
      method: "POST",
    },
  );
}

export function createMethodologyPreview(
  projectId: string,
  input: ControlPlaneSchemas["MethodologyPreviewCreateDto"],
): Promise<ControlPlaneSchemas["ProductCommandResponseDto"]> {
  return request<ControlPlaneSchemas["ProductCommandResponseDto"]>(
    domainPath(`/projects/${projectId}/methodology-previews`),
    {
      body: input,
      headers: idempotencyHeaders(),
      method: "POST",
    },
  );
}

export function createVariantGroup(
  projectId: string,
  input: ControlPlaneSchemas["VariantGroupCreateDto"],
): Promise<ControlPlaneSchemas["ProductCommandResponseDto"]> {
  return request<ControlPlaneSchemas["ProductCommandResponseDto"]>(
    domainPath(`/projects/${projectId}/variant-groups`),
    {
      body: input,
      headers: idempotencyHeaders(),
      method: "POST",
    },
  );
}

export function listVariantGroups(
  projectId: string,
): Promise<ControlPlaneSchemas["ProductCollectionResponseDto"]> {
  return request<ControlPlaneSchemas["ProductCollectionResponseDto"]>(
    domainPath(`/projects/${projectId}/variant-groups`),
  );
}

export function compareVariantReports(
  variantGroupId: string,
): Promise<ControlPlaneSchemas["ProductCollectionResponseDto"]> {
  return request<ControlPlaneSchemas["ProductCollectionResponseDto"]>(
    domainPath(`/variant-groups/${variantGroupId}/comparison`),
  );
}

export function createFeedbackRecord(
  organizationId: string,
  input: object,
): Promise<ProductCommand> {
  return request<ProductCommand>(
    `/api/v1/organizations/${organizationId}/feedback`,
    { body: input, headers: idempotencyHeaders(), method: "POST" },
  );
}

export function listFeedbackRecords(
  organizationId: string,
): Promise<ProductCollection> {
  return request<ProductCollection>(
    `/api/v1/organizations/${organizationId}/feedback`,
  );
}

export function createRunMethodologyReport(
  runId: string,
  input: ControlPlaneSchemas["RunMethodologyReportCreateDto"],
): Promise<ControlPlaneSchemas["ProductCommandResponseDto"]> {
  return request<ControlPlaneSchemas["ProductCommandResponseDto"]>(
    domainPath(`/runs/${runId}/methodology-reports`),
    {
      body: input,
      headers: idempotencyHeaders(),
      method: "POST",
    },
  );
}

export function getRunReport(
  runId: string,
): Promise<ControlPlaneSchemas["ProductCommandResponseDto"]> {
  return request<ControlPlaneSchemas["ProductCommandResponseDto"]>(
    domainPath(`/runs/${runId}/report`),
  );
}

export function createReportExport(
  reportId: string,
  input: ControlPlaneSchemas["ReportExportCreateDto"],
): Promise<ControlPlaneSchemas["ProductCommandResponseDto"]> {
  return request<ControlPlaneSchemas["ProductCommandResponseDto"]>(
    domainPath(`/reports/${reportId}/exports`),
    {
      body: input,
      headers: idempotencyHeaders(),
      method: "POST",
    },
  );
}

export async function downloadReportExport(
  exportId: string,
): Promise<ReportExportDownload> {
  const headers = new Headers();
  headers.set("Accept", "application/json, text/csv, application/problem+json");
  headers.set("Authorization", `Bearer ${await accessToken()}`);

  let response: Response;
  try {
    response = await fetch(
      `${apiOrigin()}${domainPath(`/exports/${exportId}`)}`,
      {
        cache: "no-store",
        headers,
        method: "GET",
      },
    );
  } catch {
    throw new ApiProblem(
      503,
      "api_unavailable",
      "SIMULA API is temporarily unavailable. Retry shortly.",
    );
  }
  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const payload: unknown =
      contentType.includes("application/json") ||
      contentType.includes("application/problem+json")
        ? await response.json().catch(() => undefined)
        : undefined;
    const problem = asProblem(payload);
    throw new ApiProblem(
      response.status,
      problem?.code ?? "request_failed",
      problem?.detail ?? "SIMULA could not complete that request.",
      problem?.correlation_id ||
        response.headers.get("x-correlation-id") ||
        undefined,
      retryAfterSeconds(response.headers.get("retry-after")),
    );
  }

  const contentType = response.headers
    .get("content-type")
    ?.toLowerCase()
    .replaceAll(" ", "");
  const disposition = response.headers.get("content-disposition");
  const filename = /^attachment; filename="([a-z0-9][a-z0-9_.-]{0,119})"$/.exec(
    disposition ?? "",
  )?.[1];
  const rawLength = response.headers.get("content-length");
  const expectedSha256 = /^"([0-9a-f]{64})"$/.exec(
    response.headers.get("etag") ?? "",
  )?.[1];
  if (
    (contentType !== "application/json" &&
      contentType !== "text/csv;charset=utf-8") ||
    filename === undefined ||
    expectedSha256 === undefined ||
    (rawLength !== null &&
      (!/^[0-9]+$/.test(rawLength) || Number(rawLength) > 2_097_152))
  ) {
    throw new ApiProblem(
      502,
      "invalid_api_response",
      "SIMULA API returned an unsafe report export.",
    );
  }
  const blob = await response.blob();
  const bytes = await blob.arrayBuffer();
  const actualSha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
  if (
    blob.size < 1 ||
    blob.size > 2_097_152 ||
    (rawLength !== null && Number(rawLength) !== blob.size) ||
    actualSha256 !== expectedSha256
  ) {
    throw new ApiProblem(
      502,
      "invalid_api_response",
      "SIMULA API returned an unsafe report export.",
    );
  }
  return Object.freeze({ blob, filename });
}

export function createReportShare(
  reportId: string,
  input: object,
): Promise<ProductCommand> {
  return request<ProductCommand>(`/api/v1/reports/${reportId}/shares`, {
    body: input,
    headers: idempotencyHeaders(),
    method: "POST",
  });
}

export function listReportShares(reportId: string): Promise<ProductCollection> {
  return request<ProductCollection>(`/api/v1/reports/${reportId}/shares`);
}

export function accessSharedReport(token: string): Promise<ProductCommand> {
  return request<ProductCommand>(
    `/api/v1/shared-reports/${encodeURIComponent(token)}`,
  );
}

export function revokeReportShare(shareId: string): Promise<ProductCommand> {
  return request<ProductCommand>(`/api/v1/report-shares/${shareId}`, {
    headers: idempotencyHeaders(),
    method: "DELETE",
  });
}

export function createOrganizationInvitation(
  organizationId: string,
  input: object,
): Promise<ProductCommand> {
  return request<ProductCommand>(
    `/api/v1/organizations/${organizationId}/invitations`,
    { body: input, headers: idempotencyHeaders(), method: "POST" },
  );
}

export function acceptOrganizationInvitation(
  token: string,
): Promise<ProductCommand> {
  return request<ProductCommand>("/api/v1/organization-invitations/accept", {
    body: { token },
    headers: idempotencyHeaders(),
    method: "POST",
  });
}

export function listOrganizationInvitations(
  organizationId: string,
): Promise<ProductCollection> {
  return request<ProductCollection>(
    `/api/v1/organizations/${organizationId}/invitations`,
  );
}

export function setOrganizationFeatureFlag(
  organizationId: string,
  flagKey: string,
  input: object,
): Promise<ProductCommand> {
  return request<ProductCommand>(
    `/api/v1/organizations/${organizationId}/feature-flags/${encodeURIComponent(flagKey)}`,
    { body: input, headers: idempotencyHeaders(), method: "PUT" },
  );
}

export function listOrganizationFeatureFlags(
  organizationId: string,
): Promise<ProductCollection> {
  return request<ProductCollection>(
    `/api/v1/organizations/${organizationId}/feature-flags`,
  );
}

export function getOrganizationAdminSummary(
  organizationId: string,
): Promise<ProductCommand> {
  return request<ProductCommand>(
    `/api/v1/organizations/${organizationId}/admin-summary`,
  );
}

export function getOrganizationAudit(
  organizationId: string,
): Promise<ProductCollection> {
  return request<ProductCollection>(
    `/api/v1/organizations/${organizationId}/audit`,
  );
}

