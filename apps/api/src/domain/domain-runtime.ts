import {
  parseRedisConnection,
  type RedisConnectionOptions,
  type RuntimeEnvironment,
} from "../config/redis-connection";
import {
  parseDeploymentAdmission,
  type ProductionAdmission,
} from "../config/production-admission";

export type SimulaEnvironment =
  "local" | "test" | "preview" | "staging" | "production";

export interface AssetStorageRuntime {
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export interface DisabledDomainRuntime {
  readonly enabled: false;
}

export interface EnabledDomainRuntime {
  readonly enabled: true;
  readonly environment: SimulaEnvironment;
  readonly releaseSha: string;
  readonly migrationHead: string;
  readonly productionAdmission?: ProductionAdmission;
  readonly databaseUrl: string;
  readonly databaseCaPem: string | null;
  readonly supabaseIssuer: string;
  readonly supabaseJwksUrl: string;
  readonly supabasePublishableKey: string;
  readonly cursorSecret: string;
  readonly redisConnection: RedisConnectionOptions;
  readonly rateLimitKeyPrefix: string;
  readonly behavioralEngineUrl: string;
  readonly behavioralEngineToken: string;
  readonly assetStorage?: AssetStorageRuntime;
  readonly visualProfileEnabled?: true;
}

export type DomainRuntime = DisabledDomainRuntime | EnabledDomainRuntime;

export class DomainConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainConfigurationError";
  }
}

function required(environment: RuntimeEnvironment, name: string): string {
  const value = environment[name];
  if (value === undefined || value.trim() === "") {
    throw new DomainConfigurationError(`${name} is required.`);
  }
  return value.trim();
}

function exactOrigin(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DomainConfigurationError(`${name} must be an exact HTTP origin.`);
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new DomainConfigurationError(`${name} must be an exact HTTP origin.`);
  }
  return url.origin;
}

export function parseCorsOrigins(
  environment: RuntimeEnvironment = process.env,
): readonly string[] {
  const simulaEnvironment = environment.SIMULA_ENVIRONMENT ?? "test";
  let rawOrigins = environment.SIMULA_CORS_ORIGINS;
  if (
    rawOrigins === undefined &&
    (simulaEnvironment === "local" || simulaEnvironment === "test")
  ) {
    rawOrigins = "http://127.0.0.1:3000,http://localhost:3000";
  }
  if (rawOrigins === undefined) {
    throw new DomainConfigurationError(
      "SIMULA_CORS_ORIGINS is required outside local/test.",
    );
  }
  const origins = rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "")
    .map((origin) => exactOrigin(origin, "SIMULA_CORS_ORIGINS"));
  if (
    origins.length === 0 ||
    origins.includes("*") ||
    new Set(origins).size !== origins.length
  ) {
    throw new DomainConfigurationError(
      "SIMULA_CORS_ORIGINS must be nonempty and unique.",
    );
  }
  return Object.freeze(origins);
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

function privateEngineOrigin(
  value: string,
  environment: SimulaEnvironment,
): string {
  const origin = exactOrigin(value, "SIMULA_BEHAVIORAL_ENGINE_URL");
  const url = new URL(origin);
  if (environment === "local" || environment === "test") {
    if (url.protocol !== "http:" || !isLoopback(url.hostname)) {
      throw new DomainConfigurationError(
        "Local and test behavioral engine must use loopback HTTP.",
      );
    }
  } else if (
    url.protocol !== "http:" ||
    !url.hostname.endsWith(".railway.internal")
  ) {
    throw new DomainConfigurationError(
      "Deployed behavioral engine must use a Railway private HTTP origin.",
    );
  }
  return origin;
}

function privateEngineToken(environment: RuntimeEnvironment): string {
  const token = required(environment, "SIMULA_BEHAVIORAL_ENGINE_TOKEN");
  if (
    token.length < 32 ||
    token.length > 256 ||
    token.toLowerCase().includes("replace") ||
    token.toLowerCase().includes("example") ||
    token.toLowerCase().includes("changeme")
  ) {
    throw new DomainConfigurationError(
      "SIMULA_BEHAVIORAL_ENGINE_TOKEN must be a non-placeholder 32-256 character secret.",
    );
  }
  return token;
}

export function parseAssetStorageRuntime(
  environment: RuntimeEnvironment,
  simulaEnvironment: SimulaEnvironment,
): AssetStorageRuntime | undefined {
  const enabled = environment.SIMULA_ASSET_STORAGE_ENABLED;
  if (enabled === undefined || enabled === "false") {
    return undefined;
  }
  if (enabled !== "true") {
    throw new DomainConfigurationError(
      "SIMULA_ASSET_STORAGE_ENABLED must be true or false.",
    );
  }
  const rawEndpoint = required(environment, "SIMULA_ASSET_STORAGE_ENDPOINT");
  let endpoint: URL;
  try {
    endpoint = new URL(rawEndpoint);
  } catch {
    throw new DomainConfigurationError(
      "SIMULA_ASSET_STORAGE_ENDPOINT is invalid.",
    );
  }
  if (
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.search !== "" ||
    endpoint.hash !== "" ||
    endpoint.pathname.replace(/\/$/, "") !== "/storage/v1/s3"
  ) {
    throw new DomainConfigurationError(
      "SIMULA_ASSET_STORAGE_ENDPOINT must identify the Supabase S3 endpoint.",
    );
  }
  if (simulaEnvironment === "local" || simulaEnvironment === "test") {
    if (endpoint.protocol !== "http:" || !isLoopback(endpoint.hostname)) {
      throw new DomainConfigurationError(
        "Local and test asset storage must use loopback HTTP.",
      );
    }
  } else if (
    endpoint.protocol !== "https:" ||
    !endpoint.hostname.endsWith(".storage.supabase.co")
  ) {
    throw new DomainConfigurationError(
      "Deployed asset storage must use the direct Supabase Storage hostname.",
    );
  }
  const region = required(environment, "SIMULA_ASSET_STORAGE_REGION");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(region)) {
    throw new DomainConfigurationError(
      "SIMULA_ASSET_STORAGE_REGION is invalid.",
    );
  }
  const accessKeyId = required(
    environment,
    "SIMULA_ASSET_STORAGE_ACCESS_KEY_ID",
  );
  const secretAccessKey = required(
    environment,
    "SIMULA_ASSET_STORAGE_SECRET_ACCESS_KEY",
  );
  if (
    accessKeyId.length < 8 ||
    accessKeyId.length > 256 ||
    secretAccessKey.length < 32 ||
    secretAccessKey.length > 256 ||
    secretAccessKey.toLowerCase().includes("replace") ||
    secretAccessKey.toLowerCase().includes("example") ||
    secretAccessKey.toLowerCase().includes("changeme")
  ) {
    throw new DomainConfigurationError(
      "SIMULA asset storage credentials are invalid.",
    );
  }
  return Object.freeze({
    endpoint: endpoint.href.replace(/\/$/, ""),
    region,
    accessKeyId,
    secretAccessKey,
  });
}

function visualProfileEnabled(environment: RuntimeEnvironment): boolean {
  const enabled = environment.SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED;
  if (enabled === undefined || enabled === "false") {
    return false;
  }
  if (enabled !== "true") {
    throw new DomainConfigurationError(
      "SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED must be true or false.",
    );
  }
  return true;
}

function parseEnvironment(value: string): SimulaEnvironment {
  if (
    value !== "local" &&
    value !== "test" &&
    value !== "preview" &&
    value !== "staging" &&
    value !== "production"
  ) {
    throw new DomainConfigurationError("SIMULA_ENVIRONMENT is unsupported.");
  }
  return value;
}

export function parseDomainRuntime(
  environment: RuntimeEnvironment = process.env,
): DomainRuntime {
  const enabled = environment.SIMULA_NEST_DOMAIN_ENABLED;
  if (enabled === undefined || enabled === "false") {
    return Object.freeze({ enabled: false });
  }
  if (enabled !== "true") {
    throw new DomainConfigurationError(
      "SIMULA_NEST_DOMAIN_ENABLED must be true or false.",
    );
  }

  const simulaEnvironment = parseEnvironment(
    required(environment, "SIMULA_ENVIRONMENT"),
  );

  const releaseSha = required(environment, "SIMULA_RELEASE_SHA");
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
    throw new DomainConfigurationError(
      "SIMULA_RELEASE_SHA must be an exact 40-character git SHA.",
    );
  }
  const deploymentAdmission = parseDeploymentAdmission(
    environment,
    simulaEnvironment,
    (message) => new DomainConfigurationError(message),
  );

  const databaseUrl = required(environment, "SIMULA_DATABASE_URL");
  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new DomainConfigurationError(
      "SIMULA_DATABASE_URL must be PostgreSQL.",
    );
  }
  if (
    (database.protocol !== "postgres:" &&
      database.protocol !== "postgresql:") ||
    database.hostname === "" ||
    database.hash !== "" ||
    database.password === "" ||
    (database.username !== "simula_api" &&
      !/^simula_api\.[a-z0-9]{20}$/.test(database.username))
  ) {
    throw new DomainConfigurationError(
      "SIMULA_DATABASE_URL must use the least-privilege simula_api role.",
    );
  }

  const supabaseUrl = exactOrigin(
    required(environment, "SIMULA_SUPABASE_URL"),
    "SIMULA_SUPABASE_URL",
  );
  const supabase = new URL(supabaseUrl);
  const databaseCaPem = environment.SIMULA_DATABASE_CA_PEM?.trim() || null;
  if (simulaEnvironment === "local" || simulaEnvironment === "test") {
    if (!isLoopback(database.hostname) || !isLoopback(supabase.hostname)) {
      throw new DomainConfigurationError(
        "Local and test dependencies must remain on loopback.",
      );
    }
  } else {
    if (
      database.protocol !== "postgresql:" ||
      supabase.protocol !== "https:" ||
      database.searchParams.get("sslmode")?.toLowerCase() !== "verify-full" ||
      databaseCaPem === null
    ) {
      throw new DomainConfigurationError(
        "Deployed PostgreSQL and Supabase dependencies require verified TLS.",
      );
    }
  }

  const supabaseIssuer = `${supabaseUrl}/auth/v1`;
  const supabaseJwksUrl = required(
    environment,
    "SIMULA_SUPABASE_JWKS_URL",
  ).replace(/\/$/, "");
  if (supabaseJwksUrl !== `${supabaseIssuer}/.well-known/jwks.json`) {
    throw new DomainConfigurationError(
      "SIMULA_SUPABASE_JWKS_URL must match the Auth issuer.",
    );
  }

  const supabasePublishableKey = required(
    environment,
    "SIMULA_SUPABASE_PUBLISHABLE_KEY",
  );
  if (!supabasePublishableKey.startsWith("sb_publishable_")) {
    throw new DomainConfigurationError(
      "Only a Supabase publishable key is accepted.",
    );
  }

  const cursorSecret = required(environment, "SIMULA_CURSOR_SECRET");
  if (
    Buffer.byteLength(cursorSecret, "utf8") < 32 ||
    cursorSecret.toLowerCase().includes("replace")
  ) {
    throw new DomainConfigurationError(
      "SIMULA_CURSOR_SECRET must be an injected 32-byte secret.",
    );
  }

  const redisConnection = parseRedisConnection(environment);
  if (redisConnection === null) {
    throw new DomainConfigurationError(
      "SIMULA_REDIS_URL is required when the NestJS domain is enabled.",
    );
  }
  const redisUrl = new URL(required(environment, "SIMULA_REDIS_URL"));
  if (
    simulaEnvironment !== "local" &&
    simulaEnvironment !== "test" &&
    redisUrl.protocol !== "rediss:" &&
    !redisUrl.hostname.endsWith(".railway.internal")
  ) {
    throw new DomainConfigurationError(
      "Deployed Redis requires rediss:// or Railway private networking.",
    );
  }
  if (
    (simulaEnvironment === "local" || simulaEnvironment === "test") &&
    !isLoopback(redisUrl.hostname)
  ) {
    throw new DomainConfigurationError(
      "Local and test Redis must remain on loopback.",
    );
  }
  const rateLimitKeyPrefix =
    environment.SIMULA_RATE_LIMIT_KEY_PREFIX ?? "simula:rate:v1";
  if (!/^[a-z][a-z0-9:_-]{2,127}$/.test(rateLimitKeyPrefix)) {
    throw new DomainConfigurationError(
      "SIMULA_RATE_LIMIT_KEY_PREFIX is unsafe.",
    );
  }
  const behavioralEngineUrl = privateEngineOrigin(
    required(environment, "SIMULA_BEHAVIORAL_ENGINE_URL"),
    simulaEnvironment,
  );
  const behavioralEngineToken = privateEngineToken(environment);
  const assetStorage = parseAssetStorageRuntime(environment, simulaEnvironment);
  const visualEnabled = visualProfileEnabled(environment);
  if (visualEnabled && assetStorage === undefined) {
    throw new DomainConfigurationError(
      "Technical visual profiling requires private asset storage.",
    );
  }
  return Object.freeze({
    enabled: true,
    environment: simulaEnvironment,
    releaseSha,
    migrationHead: deploymentAdmission.migrationHead,
    ...(deploymentAdmission.productionAdmission === undefined
      ? {}
      : {
          productionAdmission: deploymentAdmission.productionAdmission,
        }),
    databaseUrl,
    databaseCaPem,
    supabaseIssuer,
    supabaseJwksUrl,
    supabasePublishableKey,
    cursorSecret,
    redisConnection,
    rateLimitKeyPrefix,
    behavioralEngineUrl,
    behavioralEngineToken,
    ...(assetStorage === undefined ? {} : { assetStorage }),
    ...(visualEnabled ? { visualProfileEnabled: true as const } : {}),
  });
}
