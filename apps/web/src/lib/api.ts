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
export type CampaignLabForecastDataset = Readonly<{
  id: string;
  source_key: string;
  source_version: string;
  owner_name: string;
  license_name: string;
  geography: string;
  observation_period: string;
  source_checksum_sha256: string;
  normalized_checksum_sha256: string;
  manifest: Readonly<Record<string, unknown>>;
  admitted_at: string;
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

function apiOrigin(path: string): string {
  const apiVersion = /^\/api\/(v1|v2)(?:\/|$)/.exec(path)?.[1];
  const value =
    apiVersion === "v1"
      ? (process.env.NEXT_PUBLIC_SIMULA_API_V1_URL ??
        process.env.NEXT_PUBLIC_SIMULA_API_URL)
      : apiVersion === "v2"
        ? (process.env.NEXT_PUBLIC_SIMULA_API_V2_URL ??
          process.env.NEXT_PUBLIC_SIMULA_API_URL)
        : process.env.NEXT_PUBLIC_SIMULA_API_URL;
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

function domainV1Path(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error("domain API paths must be absolute");
  }
  return `/api/v1${path}`;
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
  signal?: AbortSignal;
  headers?: HeadersInit;
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
}>;

function requestDeadline(callerSignal?: AbortSignal | null) {
  const timeout = AbortSignal.timeout(30_000);
  const signal = callerSignal
    ? AbortSignal.any([timeout, callerSignal])
    : timeout;
  const problem = () =>
    new ApiProblem(
      timeout.aborted ? 504 : 499,
      timeout.aborted ? "request_timeout" : "request_cancelled",
      timeout.aborted
        ? "The request timed out. Its outcome is not confirmed. Retry to check or resume the same action."
        : "Request cancelled because you left this view.",
    );
  function wait<T>(action: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal.aborted) {
        reject(problem());
        return;
      }
      const abort = () => {
        signal.removeEventListener("abort", abort);
        reject(problem());
      };
      signal.addEventListener("abort", abort, { once: true });
      // Auth refresh is shared by the SDK; bound this caller's wait without
      // cancelling another view's session refresh.
      void Promise.resolve()
        .then(() => {
          if (signal.aborted) throw problem();
          return action();
        })
        .then(
          (value) => {
            signal.removeEventListener("abort", abort);
            if (signal.aborted) reject(problem());
            else resolve(value);
          },
          (error: unknown) => {
            signal.removeEventListener("abort", abort);
            reject(signal.aborted ? problem() : error);
          },
        );
    });
  }
  return { signal, wait };
}

async function authenticatedFetch(path: string, init: RequestInit) {
  const deadline = requestDeadline(init.signal);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await deadline.wait(accessToken)}`);
  try {
    const response = await deadline.wait(() =>
      fetch(`${apiOrigin(path)}${path}`, {
        ...init,
        cache: "no-store",
        headers,
        signal: deadline.signal,
      }),
    );
    return { response, deadline };
  } catch (error) {
    if (error instanceof ApiProblem) throw error;
    throw new ApiProblem(
      503,
      "api_unavailable",
      "SIMULA API is temporarily unavailable. Retry shortly.",
    );
  }
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json, application/problem+json");
  if (options.body) headers.set("Content-Type", "application/json");
  const { response, deadline } = await authenticatedFetch(path, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers,
    method: options.method ?? "GET",
    signal: options.signal,
  });
  const payload = await deadline.wait(() => responsePayload(response));
  if (!response.ok) throw responseProblem(response, payload);
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
    signal?: AbortSignal;
  }>,
) {
  const headers = new Headers();
  headers.set("Accept", init.accept);
  if (init.contentType) headers.set("Content-Type", init.contentType);
  if (init.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey);
  return authenticatedFetch(path, {
    body: init.body,
    headers,
    method: init.method,
    signal: init.signal,
  });
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
  offset = 0,
): Promise<CampaignLabCampaignPage> {
  return request<CampaignLabCampaignPage>(
    domainV1Path(
      `/campaign-lab/campaigns?project_id=${encodeURIComponent(projectId)}${offset ? `&offset=${offset}` : ""}`,
    ),
  );
}

export function getCampaignLabCampaign(
  campaignId: string,
): Promise<Readonly<{ campaign: CampaignLabCampaign }>> {
  return request(
    domainV1Path(`/campaign-lab/campaigns/${encodeURIComponent(campaignId)}`),
  );
}

export function listCampaignLabRuns(
  campaignId: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<
  Readonly<{
    items: ReadonlyArray<CampaignLabRunStatus>;
    pagination: Readonly<{ limit: number; offset: number }>;
  }>
> {
  return request(
    domainV1Path(
      `/campaign-lab/campaigns/${encodeURIComponent(campaignId)}/runs?limit=25&offset=${offset}`,
    ),
    { signal },
  );
}

export function createCampaignLabCampaign(
  input: {
    project_id: string;
    name: string;
    objective: string;
    purpose: string;
    decision: Record<string, unknown>;
  },
  idempotencyKey?: string,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(domainV1Path("/campaign-lab/campaigns"), {
    body: input,
    headers: idempotencyHeaders(idempotencyKey),
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
  idempotencyKey?: string,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainV1Path(`/campaign-lab/campaigns/${campaignId}/research`),
    {
      body: input,
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  );
}

export function getCampaignLabResearchRun(
  runId: string,
  signal?: AbortSignal,
): Promise<CampaignLabResearchRun> {
  return request<CampaignLabResearchRun>(
    domainV1Path(`/campaign-lab/research/runs/${runId}`),
    { signal },
  );
}

export function createCampaignLabSimulation(
  campaignId: string,
  requestBody: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainV1Path(`/campaign-lab/campaigns/${campaignId}/simulations`),
    {
      body: { request: requestBody },
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  );
}

export function createCampaignLabCulturalEvaluation(
  campaignId: string,
  suite: Readonly<Record<string, unknown>>,
  idempotencyKey?: string,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainV1Path(`/campaign-lab/campaigns/${campaignId}/cultural-evaluations`),
    {
      body: { suite },
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  );
}

export function getCampaignLabSimulationStatus(
  runId: string,
  signal?: AbortSignal,
): Promise<CampaignLabRunStatus> {
  return request<CampaignLabRunStatus>(
    domainV1Path(`/campaign-lab/simulations/${runId}/status`),
    { signal },
  );
}

export function getCampaignLabSimulationResults(
  runId: string,
  signal?: AbortSignal,
): Promise<CampaignLabSimulationResult> {
  return request<CampaignLabSimulationResult>(
    domainV1Path(`/campaign-lab/simulations/${runId}/results`),
    { signal },
  );
}

export function createCampaignLabInterview(
  campaignId: string,
  input: Readonly<Record<string, unknown>>,
  idempotencyKey?: string,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainV1Path(`/campaign-lab/campaigns/${campaignId}/interviews`),
    {
      body: input,
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  );
}

export function getCampaignLabInterviewRun(
  runId: string,
  signal?: AbortSignal,
): Promise<CampaignLabDurableRun> {
  return request<CampaignLabDurableRun>(
    domainV1Path(`/campaign-lab/interviews/runs/${runId}`),
    { signal },
  );
}

export type SurveyImportPreview = {
  summary: {
    input_response_count: number;
    accepted_response_count: number;
    duplicate_response_count: number;
    low_quality_response_count: number;
    bot_response_count: number;
    malformed_response_count: number;
  };
  aggregate_group_count: number;
  evidence_binding: Record<string, string | null>;
  disclosure: string;
};

export function previewCampaignLabSurveyImport(
  campaignId: string,
  input: Readonly<Record<string, unknown>>,
): Promise<SurveyImportPreview> {
  return request<SurveyImportPreview>(
    domainV1Path(`/campaign-lab/campaigns/${campaignId}/surveys/preview`),
    { body: input, method: "POST" },
  );
}

export function createCampaignLabSurveyImport(
  campaignId: string,
  input: Readonly<Record<string, unknown>>,
  idempotencyKey?: string,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainV1Path(`/campaign-lab/campaigns/${campaignId}/surveys/import`),
    {
      body: input,
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  );
}

export function createCampaignLabNativeSurveyForm(
  campaignId: string,
  form: Readonly<Record<string, unknown>>,
  idempotencyKey?: string,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainV1Path(`/campaign-lab/campaigns/${campaignId}/surveys/forms`),
    {
      body: { form },
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  );
}

export function submitCampaignLabNativeSurveyResponses(
  campaignId: string,
  formId: string,
  responses: ReadonlyArray<Readonly<Record<string, unknown>>>,
  idempotencyKey?: string,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainV1Path(
      `/campaign-lab/campaigns/${campaignId}/surveys/forms/${formId}/responses`,
    ),
    {
      body: { responses },
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  );
}

export function getCampaignLabSurveyImportRun(
  runId: string,
  signal?: AbortSignal,
): Promise<CampaignLabDurableRun> {
  return request<CampaignLabDurableRun>(
    domainV1Path(`/campaign-lab/surveys/runs/${runId}`),
    { signal },
  );
}

export function createCampaignLabCalibrationFromRuns(
  campaignId: string,
  input: {
    simulation_run_id: string;
    survey_import_run_id: string;
    calibration_version: string;
  },
  idempotencyKey: string,
): Promise<CampaignLabCommand> {
  return request(
    domainV1Path(
      `/campaign-lab/campaigns/${campaignId}/calibrations/from-runs`,
    ),
    {
      body: input,
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  );
}

export function listCampaignLabBoundCalibrations(
  campaignId: string,
  offset = 0,
  signal?: AbortSignal,
): ReturnType<typeof listCampaignLabRuns> {
  return request(
    domainV1Path(
      `/campaign-lab/campaigns/${campaignId}/calibrations/from-runs?limit=25&offset=${offset}`,
    ),
    { signal },
  );
}

export type BoundCampaignReport = CampaignLabDurableRun & {
  review?: Readonly<Record<string, unknown>> | null;
};

export function createCampaignLabBoundReport(
  campaignId: string,
  input: { simulation_run_id: string; calibration_run_id?: string },
  key: string,
): Promise<CampaignLabCommand> {
  return request(
    domainV1Path(`/campaign-lab/campaigns/${campaignId}/reports/from-runs`),
    { body: input, headers: idempotencyHeaders(key), method: "POST" },
  );
}
export function listCampaignLabBoundReports(
  campaignId: string,
  offset = 0,
  signal?: AbortSignal,
): ReturnType<typeof listCampaignLabRuns> {
  return request(
    domainV1Path(
      `/campaign-lab/campaigns/${campaignId}/reports/from-runs?limit=25&offset=${offset}`,
    ),
    { signal },
  );
}
export function getCampaignLabBoundReport(
  runId: string,
  signal?: AbortSignal,
): Promise<BoundCampaignReport> {
  return request(domainV1Path(`/campaign-lab/reports/bound/runs/${runId}`), {
    signal,
  });
}
export function reviewCampaignLabBoundReport(
  runId: string,
  input: {
    decision: "approved_experimental" | "rejected" | "revoked";
    rationale: string;
  },
): Promise<Readonly<Record<string, unknown>>> {
  return request(
    domainV1Path(`/campaign-lab/reports/bound/runs/${runId}/review`),
    { body: input, method: "POST" },
  );
}
export function exportCampaignLabBoundReport(
  runId: string,
): Promise<BoundCampaignReport> {
  return request(
    domainV1Path(`/campaign-lab/reports/bound/runs/${runId}/export`),
  );
}

export function createCampaignLabCalibration(
  campaignId: string,
  input: Readonly<Record<string, unknown>>,
  idempotencyKey?: string,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainV1Path(`/campaign-lab/campaigns/${campaignId}/calibrations`),
    {
      body: input,
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  );
}

export function getCampaignLabCalibrationRun(
  runId: string,
  signal?: AbortSignal,
): Promise<CampaignLabDurableRun> {
  return request<CampaignLabDurableRun>(
    domainV1Path(`/campaign-lab/calibrations/${runId}`),
    { signal },
  );
}

export function createCampaignLabBacktest(
  campaignId: string,
  input: Readonly<Record<string, unknown>>,
  idempotencyKey?: string,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainV1Path(`/campaign-lab/campaigns/${campaignId}/backtests`),
    {
      body: input,
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  );
}

export function getCampaignLabBacktestRun(
  runId: string,
  signal?: AbortSignal,
): Promise<CampaignLabDurableRun> {
  return request<CampaignLabDurableRun>(
    domainV1Path(`/campaign-lab/backtests/${runId}`),
    { signal },
  );
}

export function listCampaignLabForecastDatasets(): Promise<
  Readonly<{ items: ReadonlyArray<CampaignLabForecastDataset> }>
> {
  return request<
    Readonly<{ items: ReadonlyArray<CampaignLabForecastDataset> }>
  >(domainV1Path("/campaign-lab/forecast-datasets"));
}

export function createCampaignLabAggregateForecast(
  campaignId: string,
  input: Readonly<Record<string, unknown>>,
  idempotencyKey?: string,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainV1Path(`/campaign-lab/campaigns/${campaignId}/forecasts`),
    {
      body: input,
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  );
}

export function getCampaignLabAggregateForecastRun(
  runId: string,
  signal?: AbortSignal,
): Promise<CampaignLabDurableRun> {
  return request<CampaignLabDurableRun>(
    domainV1Path(`/campaign-lab/forecasts/${runId}`),
    { signal },
  );
}

export function createCampaignLabComplianceReview(
  campaignId: string,
  input: Readonly<Record<string, unknown>>,
  idempotencyKey?: string,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainV1Path(`/campaign-lab/campaigns/${campaignId}/compliance/reviews`),
    {
      body: input,
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  );
}

export function getCampaignLabComplianceRun(
  campaignId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<CampaignLabDurableRun> {
  return request<CampaignLabDurableRun>(
    domainV1Path(
      `/campaign-lab/campaigns/${campaignId}/compliance/runs/${runId}`,
    ),
    { signal },
  );
}

export function createCampaignLabReport(
  campaignId: string,
  input: Readonly<Record<string, unknown>>,
  idempotencyKey?: string,
): Promise<CampaignLabCommand> {
  return request<CampaignLabCommand>(
    domainV1Path(`/campaign-lab/campaigns/${campaignId}/reports`),
    {
      body: input,
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  );
}

export function getCampaignLabReportRun(
  runId: string,
  signal?: AbortSignal,
): Promise<CampaignLabDurableRun> {
  return request<CampaignLabDurableRun>(
    domainV1Path(`/campaign-lab/reports/runs/${runId}`),
    { signal },
  );
}

export function getCampaignLabAudit(
  campaignId: string,
): Promise<CampaignLabAuditPage> {
  return request<CampaignLabAuditPage>(
    domainV1Path(`/campaign-lab/campaigns/${campaignId}/audit`),
  );
}

export function getDemoAudience(): Promise<AudienceDisclosure> {
  return request<AudienceDisclosure>(domainPath("/audiences/demo"));
}

export function updateProject(
  projectId: string,
  version: number,
  input: Partial<
    Pick<Project, "category" | "language" | "market" | "name" | "objective">
  >,
): Promise<Project> {
  return request<Project>(domainPath(`/projects/${projectId}`), {
    body: input,
    headers: { "If-Match": `"${version}"` },
    method: "PATCH",
  });
}

export function createStimulus(
  projectId: string,
  input: Pick<Stimulus, "name"> & { content: string },
): Promise<Stimulus> {
  return request<Stimulus>(domainPath(`/projects/${projectId}/stimuli`), {
    body: input,
    headers: idempotencyHeaders(),
    method: "POST",
  });
}

export function appendStimulusVersion(
  stimulusId: string,
  content: string,
  idempotencyKey = crypto.randomUUID(),
): Promise<StimulusVersion> {
  return request<StimulusVersion>(
    domainPath(`/stimuli/${stimulusId}/versions`),
    {
      body: { content },
      headers: idempotencyHeaders(idempotencyKey),
      method: "POST",
    },
  );
}

export function listStimulusAssets(
  stimulusId: string,
): Promise<readonly StimulusAsset[]> {
  return request<unknown>(`/api/v2/stimuli/${stimulusId}/assets`).then(
    (value) =>
      parsedResponse((response) => {
        const assets = parseStimulusAssetCollection(response);
        for (const asset of assets) {
          assetIdentity(asset, { stimulusId });
        }
        return assets;
      }, value),
  );
}

export function reserveStimulusAsset(
  stimulusId: string,
  input: StimulusAssetReserveInput,
  idempotencyKey = crypto.randomUUID(),
): Promise<StimulusAsset> {
  return request<unknown>(`/api/v2/stimuli/${stimulusId}/assets`, {
    body: input,
    headers: idempotencyHeaders(idempotencyKey),
    method: "POST",
  }).then((value) =>
    parsedResponse(
      (response) =>
        assetIdentity(parseStimulusAssetCommand(response), { stimulusId }),
      value,
    ),
  );
}

export async function uploadStimulusAsset(
  asset: StimulusAsset,
  bytes: ArrayBuffer,
  idempotencyKey = crypto.randomUUID(),
  signal?: AbortSignal,
): Promise<StimulusAsset> {
  const expected = parseStimulusAsset(asset);
  const actualSha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
  if (
    expected.status !== "pending_upload" ||
    bytes.byteLength !== expected.expected_byte_size ||
    actualSha256 !== expected.expected_content_sha256 ||
    Date.parse(expected.retention_until) <= Date.now()
  ) {
    throw new ApiProblem(
      409,
      "asset_mismatch",
      "The selected file does not match its active upload reservation.",
    );
  }
  const { response, deadline } = await assetFetch(
    `/api/v2/stimulus-assets/${expected.asset_id}/content`,
    {
      accept: "application/json, application/problem+json",
      body: bytes,
      contentType: expected.media_type,
      idempotencyKey,
      signal,
      method: "PUT",
    },
  );
  const payload = await deadline.wait(() => responsePayload(response));
  if (!response.ok) {
    throw responseProblem(response, payload);
  }
  return parsedResponse(
    (value) =>
      assetIdentity(parseStimulusAssetCommand(value), {
        assetId: expected.asset_id,
        stimulusId: expected.stimulus_id,
      }),
    payload,
  );
}

export async function downloadStimulusAsset(
  asset: StimulusAsset,
  signal?: AbortSignal,
): Promise<StimulusAssetDownload> {
  const expected = parseStimulusAsset(asset);
  if (
    expected.status !== "available" ||
    expected.byte_size !== expected.expected_byte_size ||
    expected.content_sha256 !== expected.expected_content_sha256 ||
    Date.parse(expected.retention_until) <= Date.now()
  ) {
    throw new ApiProblem(
      409,
      "asset_unavailable",
      "The private campaign asset is not available for verified access.",
    );
  }
  const { response, deadline } = await assetFetch(
    `/api/v2/stimulus-assets/${expected.asset_id}/content`,
    {
      accept: STIMULUS_ASSET_MEDIA_TYPES.join(", "),
      signal,
      method: "GET",
    },
  );
  if (!response.ok) {
    throw responseProblem(
      response,
      await deadline.wait(() => responsePayload(response)),
    );
  }
  const contentType = response.headers.get("content-type")?.toLowerCase();
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
  const blob = await deadline.wait(() => response.blob());
  const bytes = await deadline.wait(() => blob.arrayBuffer());
  const actualSha256 = Array.from(
    new Uint8Array(
      await deadline.wait(() => crypto.subtle.digest("SHA-256", bytes)),
    ),
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

export async function downloadReportExport(
  exportId: string,
  signal?: AbortSignal,
): Promise<ReportExportDownload> {
  const { response, deadline } = await authenticatedFetch(
    domainPath(`/exports/${exportId}`),
    {
      headers: {
        Accept: "application/json, text/csv, application/problem+json",
      },
      method: "GET",
      signal,
    },
  );
  if (!response.ok) {
    throw responseProblem(
      response,
      await deadline.wait(() => responsePayload(response)),
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
  const blob = await deadline.wait(() => response.blob());
  const bytes = await deadline.wait(() => blob.arrayBuffer());
  const actualSha256 = Array.from(
    new Uint8Array(
      await deadline.wait(() => crypto.subtle.digest("SHA-256", bytes)),
    ),
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
