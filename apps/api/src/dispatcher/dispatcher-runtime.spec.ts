import {
  DispatcherConfigurationError,
  parseDispatcherRuntime,
} from "./dispatcher-runtime";
import { REQUIRED_DATABASE_MIGRATION_HEAD } from "../config/production-admission";

const LOCAL_ENVIRONMENT = Object.freeze({
  SIMULA_ENVIRONMENT: "local",
  SIMULA_REDIS_URL: "redis://127.0.0.1:6379/14",
  SIMULA_RELEASE_SHA: "a".repeat(40),
  SIMULA_WORKER_DATABASE_URL:
    "postgresql://simula_worker:local-password@127.0.0.1:54322/postgres",
});

describe("parseDispatcherRuntime", () => {
  it("accepts only the separate least-privilege local dispatcher boundary", () => {
    expect(parseDispatcherRuntime(LOCAL_ENVIRONMENT)).toEqual({
      environment: "local",
      releaseSha: "a".repeat(40),
      migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD,
      databaseUrl:
        "postgresql://simula_worker:local-password@127.0.0.1:54322/postgres",
      databaseCaPem: null,
      redisConnection: {
        db: 14,
        enableOfflineQueue: false,
        host: "127.0.0.1",
        maxRetriesPerRequest: 1,
        port: 6379,
      },
      rateLimitKeyPrefix: "simula:rate:v1",
      port: 8080,
    });
  });

  it("accepts only a bounded HTTP health port", () => {
    expect(
      parseDispatcherRuntime({ ...LOCAL_ENVIRONMENT, PORT: "9000" }).port,
    ).toBe(9000);
    expect(() =>
      parseDispatcherRuntime({ ...LOCAL_ENVIRONMENT, PORT: "0" }),
    ).toThrow("PORT must be an integer");
  });

  it("accepts optional loopback asset storage for deletion recovery", () => {
    expect(
      parseDispatcherRuntime({
        ...LOCAL_ENVIRONMENT,
        SIMULA_ASSET_STORAGE_ENABLED: "true",
        SIMULA_ASSET_STORAGE_ENDPOINT: "http://127.0.0.1:54321/storage/v1/s3",
        SIMULA_ASSET_STORAGE_REGION: "local",
        SIMULA_ASSET_STORAGE_ACCESS_KEY_ID: "local-access-key",
        SIMULA_ASSET_STORAGE_SECRET_ACCESS_KEY: "s".repeat(32),
      }).assetStorage,
    ).toEqual({
      endpoint: "http://127.0.0.1:54321/storage/v1/s3",
      region: "local",
      accessKeyId: "local-access-key",
      secretAccessKey: "s".repeat(32),
    });
  });

  it.each([
    [
      "wrong database role",
      {
        SIMULA_WORKER_DATABASE_URL:
          LOCAL_ENVIRONMENT.SIMULA_WORKER_DATABASE_URL.replace(
            "simula_worker",
            "simula_api",
          ),
      },
    ],
    [
      "missing database password",
      {
        SIMULA_WORKER_DATABASE_URL:
          "postgresql://simula_worker@127.0.0.1:54322/postgres",
      },
    ],
    [
      "non-loopback local database",
      {
        SIMULA_WORKER_DATABASE_URL:
          "postgresql://simula_worker:secret@database.internal:5432/postgres",
      },
    ],
    [
      "non-loopback local Redis",
      { SIMULA_REDIS_URL: "redis://redis.internal:6379/0" },
    ],
    ["production cutover", { SIMULA_ENVIRONMENT: "production" }],
  ])("rejects %s", (_case, override) => {
    expect(() =>
      parseDispatcherRuntime({ ...LOCAL_ENVIRONMENT, ...override }),
    ).toThrow(DispatcherConfigurationError);
  });

  it("requires verified PostgreSQL and Redis TLS outside local/test", () => {
    const deployed = {
      SIMULA_ENVIRONMENT: "staging",
      SIMULA_REDIS_URL: "rediss://redis.internal:6380/0",
      SIMULA_RELEASE_SHA: "b".repeat(40),
      SIMULA_WORKER_DATABASE_URL:
        "postgresql://simula_worker.abcdefghijklmnopqrst:secret@db.example.com:5432/postgres?sslmode=verify-full",
      SIMULA_DATABASE_CA_PEM: "trusted-ca",
      SIMULA_DATABASE_MIGRATION_HEAD: REQUIRED_DATABASE_MIGRATION_HEAD,
    };

    expect(parseDispatcherRuntime(deployed)).toMatchObject({
      environment: "staging",
      databaseCaPem: "trusted-ca",
      redisConnection: {
        host: "redis.internal",
        tls: { servername: "redis.internal" },
      },
    });
    expect(() =>
      parseDispatcherRuntime({
        ...deployed,
        SIMULA_DATABASE_CA_PEM: undefined,
      }),
    ).toThrow(DispatcherConfigurationError);
  });

  it("admits Railway private-network Redis with verified PostgreSQL", () => {
    expect(
      parseDispatcherRuntime({
        SIMULA_ENVIRONMENT: "staging",
        SIMULA_REDIS_URL:
          "redis://default:secret@redis.railway.internal:6379/0",
        SIMULA_RELEASE_SHA: "b".repeat(40),
        SIMULA_WORKER_DATABASE_URL:
          "postgresql://simula_worker.abcdefghijklmnopqrst:secret@db.example.com:5432/postgres?sslmode=verify-full",
        SIMULA_DATABASE_CA_PEM: "trusted-ca",
        SIMULA_DATABASE_MIGRATION_HEAD: REQUIRED_DATABASE_MIGRATION_HEAD,
      }).redisConnection.host,
    ).toBe("redis.railway.internal");
  });

  it("admits production only with exact release and migration evidence", () => {
    expect(
      parseDispatcherRuntime({
        SIMULA_ENVIRONMENT: "production",
        SIMULA_REDIS_URL:
          "redis://default:secret@redis.railway.internal:6379/0",
        SIMULA_RELEASE_SHA: "b".repeat(40),
        SIMULA_WORKER_DATABASE_URL:
          "postgresql://simula_worker.abcdefghijklmnopqrst:secret@db.example.com:5432/postgres?sslmode=verify-full",
        SIMULA_DATABASE_CA_PEM: "trusted-ca",
        SIMULA_DATABASE_MIGRATION_HEAD: REQUIRED_DATABASE_MIGRATION_HEAD,
        SIMULA_PRODUCTION_ADMISSION_ENABLED: "true",
        SIMULA_PRODUCTION_ROLLOUT_ID: "018f274b-3c77-4b22-b749-c9274230ef9a",
        SIMULA_RELEASE_PROVENANCE_URL:
          "https://github.com/Third-Code-Solutions/Simula/actions/runs/12345678",
        SIMULA_RELEASE_BUNDLE_SHA256: "b".repeat(64),
        SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256: "c".repeat(64),
      }),
    ).toMatchObject({
      environment: "production",
      migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD,
      productionAdmission: {
        rolloutId: "018f274b-3c77-4b22-b749-c9274230ef9a",
      },
    });
  });
});
