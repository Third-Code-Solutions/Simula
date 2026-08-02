const DEPLOYMENT_ENVIRONMENTS = new Set([
  "local",
  "test",
  "preview",
  "staging",
  "production",
]);
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/;

export type ObservabilityService = "api" | "dispatcher";

export interface ObservabilityConfig {
  readonly enabled: boolean;
  readonly environment: string;
  readonly releaseSha: string;
  readonly service: ObservabilityService;
  readonly sentryDsn?: string;
  readonly otlpTracesEndpoint?: string;
  readonly tracesSampleRate: number;
}

function parseEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? "false";
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error("SIMULA_TELEMETRY_ENABLED must be true or false.");
}

function parseSampleRate(value: string | undefined): number {
  const normalized = value?.trim() ?? "0.1";
  const sampleRate = Number(normalized);
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    throw new Error(
      "SIMULA_TELEMETRY_TRACES_SAMPLE_RATE must be a number from 0 through 1.",
    );
  }
  return sampleRate;
}

function parseHttpsUrl(
  name: string,
  value: string | undefined,
  environment: string,
  expectedPathSuffix?: string,
): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is required when telemetry is enabled.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  const localHttp =
    environment === "local" &&
    parsed.protocol === "http:" &&
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error(
      `${name} must use HTTPS outside a loopback-only local environment.`,
    );
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${name} must not contain query parameters or a fragment.`);
  }
  if (expectedPathSuffix && !parsed.pathname.endsWith(expectedPathSuffix)) {
    throw new Error(`${name} must end with ${expectedPathSuffix}.`);
  }
  return parsed.toString();
}

export function readObservabilityConfig(
  environment: NodeJS.ProcessEnv,
  service: ObservabilityService,
): ObservabilityConfig {
  const enabled = parseEnabled(environment.SIMULA_TELEMETRY_ENABLED);
  const runtimeEnvironment = (environment.SIMULA_ENVIRONMENT ?? "local").trim();
  const releaseSha = (environment.SIMULA_RELEASE_SHA ?? "0".repeat(40)).trim();
  const tracesSampleRate = parseSampleRate(
    environment.SIMULA_TELEMETRY_TRACES_SAMPLE_RATE,
  );

  if (!enabled) {
    return {
      enabled,
      environment: runtimeEnvironment,
      releaseSha,
      service,
      tracesSampleRate,
    };
  }
  if (!DEPLOYMENT_ENVIRONMENTS.has(runtimeEnvironment)) {
    throw new Error("SIMULA_ENVIRONMENT is unsupported.");
  }
  if (!RELEASE_SHA_PATTERN.test(releaseSha)) {
    throw new Error(
      "SIMULA_RELEASE_SHA must be an exact lowercase 40-character git SHA when telemetry is enabled.",
    );
  }

  return {
    enabled,
    environment: runtimeEnvironment,
    releaseSha,
    service,
    sentryDsn: parseHttpsUrl(
      "SIMULA_SENTRY_DSN",
      environment.SIMULA_SENTRY_DSN,
      runtimeEnvironment,
    ),
    otlpTracesEndpoint: parseHttpsUrl(
      "SIMULA_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
      environment.SIMULA_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
      runtimeEnvironment,
      "/v1/traces",
    ),
    tracesSampleRate,
  };
}
