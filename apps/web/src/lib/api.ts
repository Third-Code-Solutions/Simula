import type { components } from "@simula/contracts";

import {
  type SimulationProvenance,
  type SimulationResult,
  type SimulationRun,
  parseSimulationProvenance,
  parseSimulationResult,
  parseSimulationRun,
} from "@/features/runs/result-contract";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

type Schemas = components["schemas"];

export type Organization = Schemas["OrganizationResponse"];
export type OrganizationPage = Schemas["OrganizationPage"];
export type Project = Schemas["ProjectResponse"];
export type ProjectDetail = Schemas["ProjectDetail"];
export type ProjectPage = Schemas["ProjectPage"];
export type Stimulus = Schemas["StimulusResponse"];
export type StimulusVersion = Schemas["StimulusVersionResponse"];
export type AudienceDisclosure = Schemas["AudienceDisclosureResponse"];
export type AuthEvent = Schemas["AuthEventResponse"];
export type { SimulationProvenance, SimulationResult, SimulationRun };

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

export class ApiProblem extends Error {
  public readonly correlationId: string | undefined;

  public constructor(
    public readonly status: number,
    public readonly code: string,
    detail: string,
    correlationId?: string,
  ) {
    super(detail);
    this.correlationId = correlationId;
  }
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
  method?: "GET" | "PATCH" | "POST";
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

function idempotencyHeaders(): HeadersInit {
  return { "Idempotency-Key": crypto.randomUUID() };
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

export function listOrganizations(cursor?: string): Promise<OrganizationPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<OrganizationPage>(`/api/v1/organizations${query}`);
}

export function createOrganization(name: string): Promise<Organization> {
  return request<Organization>("/api/v1/organizations", {
    body: { name },
    headers: idempotencyHeaders(),
    method: "POST",
  });
}

export function recordSignIn(): Promise<AuthEvent> {
  return request<AuthEvent>("/api/v1/auth-events", {
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
    `/api/v1/organizations/${organizationId}/projects${query}`,
  );
}

export function createProject(
  organizationId: string,
  input: Pick<
    Project,
    "category" | "language" | "market" | "name" | "objective"
  >,
): Promise<Project> {
  return request<Project>(`/api/v1/organizations/${organizationId}/projects`, {
    body: input,
    headers: idempotencyHeaders(),
    method: "POST",
  });
}

export function getProject(projectId: string): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/api/v1/projects/${projectId}`);
}

export function getDemoAudience(): Promise<AudienceDisclosure> {
  return request<AudienceDisclosure>("/api/v1/audiences/demo");
}

export function updateProject(
  projectId: string,
  version: number,
  input: Partial<
    Pick<Project, "category" | "language" | "market" | "name" | "objective">
  >,
): Promise<Project> {
  return request<Project>(`/api/v1/projects/${projectId}`, {
    body: input,
    headers: { "If-Match": `"${version}"` },
    method: "PATCH",
  });
}

export function createStimulus(
  projectId: string,
  input: Pick<Stimulus, "name"> & { content: string },
): Promise<Stimulus> {
  return request<Stimulus>(`/api/v1/projects/${projectId}/stimuli`, {
    body: input,
    headers: idempotencyHeaders(),
    method: "POST",
  });
}

export function appendStimulusVersion(
  stimulusId: string,
  content: string,
): Promise<StimulusVersion> {
  return request<StimulusVersion>(`/api/v1/stimuli/${stimulusId}/versions`, {
    body: { content },
    headers: idempotencyHeaders(),
    method: "POST",
  });
}

export function createSimulationRun(
  projectId: string,
  stimulusVersionId: string,
  idempotencyKey = crypto.randomUUID(),
): Promise<SimulationRun> {
  return request<unknown>(`/api/v1/projects/${projectId}/runs`, {
    body: { stimulus_version_id: stimulusVersionId },
    headers: { "Idempotency-Key": idempotencyKey },
    method: "POST",
  }).then((value) => parsedResponse(parseSimulationRun, value));
}

export function getSimulationRun(runId: string): Promise<SimulationRun> {
  return request<unknown>(`/api/v1/runs/${runId}`).then((value) =>
    parsedResponse(parseSimulationRun, value),
  );
}

export function cancelSimulationRun(runId: string): Promise<SimulationRun> {
  return request<unknown>(`/api/v1/runs/${runId}/cancel`, {
    body: {},
    method: "POST",
  }).then((value) => parsedResponse(parseSimulationRun, value));
}

export function getSimulationResult(runId: string): Promise<SimulationResult> {
  return request<unknown>(`/api/v1/runs/${runId}/result`).then((value) =>
    parsedResponse(parseSimulationResult, value),
  );
}

export function getSimulationProvenance(
  runId: string,
): Promise<SimulationProvenance> {
  return request<unknown>(`/api/v1/runs/${runId}/provenance`).then((value) =>
    parsedResponse(parseSimulationProvenance, value),
  );
}
