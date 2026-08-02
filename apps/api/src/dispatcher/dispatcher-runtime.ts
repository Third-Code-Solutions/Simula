import {
  parseRedisConnection,
  type RedisConnectionOptions,
  type RuntimeEnvironment,
} from "../config/redis-connection";
import type { SimulaEnvironment } from "../domain/domain-runtime";
import {
  parseAssetStorageRuntime,
  type AssetStorageRuntime,
} from "../domain/domain-runtime";
import {
  parseDeploymentAdmission,
  type ProductionAdmission,
} from "../config/production-admission";

export interface DispatcherRuntimeConfig {
  readonly environment: SimulaEnvironment;
  readonly releaseSha: string;
  readonly migrationHead: string;
  readonly productionAdmission?: ProductionAdmission;
  readonly databaseUrl: string;
  readonly databaseCaPem: string | null;
  readonly redisConnection: RedisConnectionOptions;
  readonly rateLimitKeyPrefix: string;
  readonly port: number;
  readonly assetStorage?: AssetStorageRuntime;
}

export class DispatcherConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispatcherConfigurationError";
  }
}

function required(environment: RuntimeEnvironment, name: string): string {
  const value = environment[name];
  if (value === undefined || value.trim() === "") {
    throw new DispatcherConfigurationError(`${name} is required.`);
  }
  return value.trim();
}

function loopback(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

function parseEnvironment(value: string): SimulaEnvironment {
  if (
    value !== "local" &&
    value !== "test" &&
    value !== "preview" &&
    value !== "staging" &&
    value !== "production"
  ) {
    throw new DispatcherConfigurationError(
      "SIMULA_ENVIRONMENT is unsupported.",
    );
  }
  return value;
}

function parsePort(rawValue: string | undefined): number {
  const value = rawValue ?? "8080";
  if (!/^[0-9]+$/.test(value)) {
    throw new DispatcherConfigurationError(
      "PORT must be an integer from 1 through 65535.",
    );
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new DispatcherConfigurationError(
      "PORT must be an integer from 1 through 65535.",
    );
  }
  return port;
}

export function parseDispatcherRuntime(
  environment: RuntimeEnvironment = process.env,
): DispatcherRuntimeConfig {
  const simulaEnvironment = parseEnvironment(
    required(environment, "SIMULA_ENVIRONMENT"),
  );
  const releaseSha = required(environment, "SIMULA_RELEASE_SHA");
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
    throw new DispatcherConfigurationError(
      "SIMULA_RELEASE_SHA must be an exact 40-character git SHA.",
    );
  }
  const deploymentAdmission = parseDeploymentAdmission(
    environment,
    simulaEnvironment,
    (message) => new DispatcherConfigurationError(message),
  );

  const databaseUrl = required(environment, "SIMULA_WORKER_DATABASE_URL");
  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new DispatcherConfigurationError(
      "SIMULA_WORKER_DATABASE_URL must be PostgreSQL.",
    );
  }
  if (
    (database.protocol !== "postgres:" &&
      database.protocol !== "postgresql:") ||
    database.hostname === "" ||
    database.hash !== "" ||
    database.password === "" ||
    (database.username !== "simula_worker" &&
      !/^simula_worker\.[a-z0-9]{20}$/.test(database.username))
  ) {
    throw new DispatcherConfigurationError(
      "SIMULA_WORKER_DATABASE_URL must use the least-privilege simula_worker role.",
    );
  }

  const redisConnection = parseRedisConnection(environment);
  if (redisConnection === null) {
    throw new DispatcherConfigurationError(
      "SIMULA_REDIS_URL is required for the BullMQ dispatcher.",
    );
  }
  const redis = new URL(required(environment, "SIMULA_REDIS_URL"));
  const rateLimitKeyPrefix =
    environment.SIMULA_RATE_LIMIT_KEY_PREFIX ?? "simula:rate:v1";
  if (!/^[a-z][a-z0-9:_-]{2,127}$/.test(rateLimitKeyPrefix)) {
    throw new DispatcherConfigurationError(
      "SIMULA_RATE_LIMIT_KEY_PREFIX is unsafe.",
    );
  }
  const assetStorage = parseAssetStorageRuntime(environment, simulaEnvironment);
  const databaseCaPem = environment.SIMULA_DATABASE_CA_PEM?.trim() || null;
  if (simulaEnvironment === "local" || simulaEnvironment === "test") {
    if (!loopback(database.hostname) || !loopback(redis.hostname)) {
      throw new DispatcherConfigurationError(
        "Local and test dispatcher dependencies must remain on loopback.",
      );
    }
  } else if (
    database.protocol !== "postgresql:" ||
    database.searchParams.get("sslmode")?.toLowerCase() !== "verify-full" ||
    databaseCaPem === null ||
    (redis.protocol !== "rediss:" &&
      !redis.hostname.endsWith(".railway.internal"))
  ) {
    throw new DispatcherConfigurationError(
      "Deployed dispatcher requires verified PostgreSQL TLS and Redis TLS or Railway private networking.",
    );
  }

  return Object.freeze({
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
    redisConnection,
    rateLimitKeyPrefix,
    port: parsePort(environment.PORT),
    ...(assetStorage === undefined ? {} : { assetStorage }),
  });
}
