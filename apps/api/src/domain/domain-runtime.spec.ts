import {
  DomainConfigurationError,
  parseCorsOrigins,
  parseDomainRuntime,
} from "./domain-runtime";
import { REQUIRED_DATABASE_MIGRATION_HEAD } from "../config/production-admission";

const ENABLED_ENVIRONMENT = Object.freeze({
  SIMULA_NEST_DOMAIN_ENABLED: "true",
  SIMULA_ENVIRONMENT: "test",
  SIMULA_RELEASE_SHA: "a".repeat(40),
  SIMULA_DATABASE_URL:
    "postgresql://simula_api:local-password@127.0.0.1:54322/postgres",
  SIMULA_SUPABASE_URL: "http://127.0.0.1:54321",
  SIMULA_SUPABASE_JWKS_URL:
    "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json",
  SIMULA_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local-test",
  SIMULA_CURSOR_SECRET: "0123456789abcdef0123456789abcdef",
  SIMULA_REDIS_URL: "redis://127.0.0.1:6379/14",
  SIMULA_BEHAVIORAL_ENGINE_URL: "http://127.0.0.1:8010",
  SIMULA_BEHAVIORAL_ENGINE_TOKEN: "t".repeat(32),
  SIMULA_CORS_ORIGINS: "http://127.0.0.1:3000,http://localhost:3000",
});

describe("parseDomainRuntime", () => {
  it("keeps the migration surface disabled by default", () => {
    expect(parseDomainRuntime({})).toEqual({ enabled: false });
    expect(parseDomainRuntime({ SIMULA_NEST_DOMAIN_ENABLED: "false" })).toEqual(
      { enabled: false },
    );
  });

  it("admits an exact loopback test configuration", () => {
    expect(parseDomainRuntime(ENABLED_ENVIRONMENT)).toMatchObject({
      enabled: true,
      environment: "test",
      releaseSha: "a".repeat(40),
      migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD,
      databaseCaPem: null,
      supabaseIssuer: "http://127.0.0.1:54321/auth/v1",
      rateLimitKeyPrefix: "simula:rate:v1",
      behavioralEngineUrl: "http://127.0.0.1:8010",
      redisConnection: expect.objectContaining({
        db: 14,
        host: "127.0.0.1",
        port: 6379,
      }),
    });
  });

  it("admits production only with exact release and migration evidence", () => {
    expect(
      parseDomainRuntime({
        ...ENABLED_ENVIRONMENT,
        SIMULA_ENVIRONMENT: "production",
        SIMULA_DATABASE_URL:
          "postgresql://simula_api.abcdefghijklmnopqrst:secret@db.example.com:5432/postgres?sslmode=verify-full",
        SIMULA_DATABASE_CA_PEM: "trusted-ca",
        SIMULA_SUPABASE_URL: "https://project.supabase.co",
        SIMULA_SUPABASE_JWKS_URL:
          "https://project.supabase.co/auth/v1/.well-known/jwks.json",
        SIMULA_REDIS_URL:
          "redis://default:secret@redis.railway.internal:6379/0",
        SIMULA_BEHAVIORAL_ENGINE_URL: "http://ai-engine.railway.internal:8010",
        SIMULA_DATABASE_MIGRATION_HEAD: REQUIRED_DATABASE_MIGRATION_HEAD,
        SIMULA_PRODUCTION_ADMISSION_ENABLED: "true",
        SIMULA_PRODUCTION_ROLLOUT_ID: "018f274b-3c77-4b22-b749-c9274230ef9a",
        SIMULA_RELEASE_PROVENANCE_URL:
          "https://github.com/Third-Code-Solutions/Simula/actions/runs/12345678",
        SIMULA_RELEASE_BUNDLE_SHA256: "b".repeat(64),
        SIMULA_RELEASE_SIGSTORE_BUNDLE_SHA256: "c".repeat(64),
      }),
    ).toMatchObject({
      enabled: true,
      environment: "production",
      migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD,
      productionAdmission: {
        rolloutId: "018f274b-3c77-4b22-b749-c9274230ef9a",
        releaseBundleSha256: "b".repeat(64),
        sigstoreBundleSha256: "c".repeat(64),
      },
      redisConnection: {
        host: "redis.railway.internal",
      },
    });
  });

  it("admits an exact optional loopback Supabase S3 configuration", () => {
    expect(
      parseDomainRuntime({
        ...ENABLED_ENVIRONMENT,
        SIMULA_ASSET_STORAGE_ENABLED: "true",
        SIMULA_ASSET_STORAGE_ENDPOINT: "http://127.0.0.1:54321/storage/v1/s3",
        SIMULA_ASSET_STORAGE_REGION: "local",
        SIMULA_ASSET_STORAGE_ACCESS_KEY_ID: "local-access-key",
        SIMULA_ASSET_STORAGE_SECRET_ACCESS_KEY: "s".repeat(32),
      }),
    ).toMatchObject({
      assetStorage: {
        endpoint: "http://127.0.0.1:54321/storage/v1/s3",
        region: "local",
        accessKeyId: "local-access-key",
      },
    });
  });

  it("admits technical visual profiling only with private asset storage", () => {
    const runtime = parseDomainRuntime({
      ...ENABLED_ENVIRONMENT,
      SIMULA_ASSET_STORAGE_ENABLED: "true",
      SIMULA_ASSET_STORAGE_ENDPOINT: "http://127.0.0.1:54321/storage/v1/s3",
      SIMULA_ASSET_STORAGE_REGION: "local",
      SIMULA_ASSET_STORAGE_ACCESS_KEY_ID: "local-access-key",
      SIMULA_ASSET_STORAGE_SECRET_ACCESS_KEY: "s".repeat(32),
      SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED: "true",
    });

    expect(runtime).toMatchObject({
      visualProfileEnabled: true,
      assetStorage: expect.any(Object),
    });
    expect(() =>
      parseDomainRuntime({
        ...ENABLED_ENVIRONMENT,
        SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED: "true",
      }),
    ).toThrow("Technical visual profiling requires private asset storage.");
    expect(() =>
      parseDomainRuntime({
        ...ENABLED_ENVIRONMENT,
        SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED: "enabled",
      }),
    ).toThrow(DomainConfigurationError);
  });

  it.each([
    {
      ...ENABLED_ENVIRONMENT,
      SIMULA_NEST_DOMAIN_ENABLED: "yes",
    },
    {
      ...ENABLED_ENVIRONMENT,
      SIMULA_RELEASE_SHA: "main",
    },
    {
      ...ENABLED_ENVIRONMENT,
      SIMULA_DATABASE_URL:
        "postgresql://postgres:local-password@127.0.0.1:54322/postgres",
    },
    {
      ...ENABLED_ENVIRONMENT,
      SIMULA_SUPABASE_URL: "http://supabase.internal",
    },
    {
      ...ENABLED_ENVIRONMENT,
      SIMULA_SUPABASE_JWKS_URL: "http://attacker.invalid/jwks.json",
    },
    {
      ...ENABLED_ENVIRONMENT,
      SIMULA_CURSOR_SECRET: "replace-me",
    },
    {
      ...ENABLED_ENVIRONMENT,
      SIMULA_REDIS_URL: "redis://redis.internal:6379/14",
    },
    {
      ...ENABLED_ENVIRONMENT,
      SIMULA_RATE_LIMIT_KEY_PREFIX: "unsafe prefix",
    },
    {
      ...ENABLED_ENVIRONMENT,
      SIMULA_ENVIRONMENT: "production",
    },
    {
      ...ENABLED_ENVIRONMENT,
      SIMULA_ASSET_STORAGE_ENABLED: "true",
      SIMULA_ASSET_STORAGE_ENDPOINT: "https://attacker.invalid/storage/v1/s3",
      SIMULA_ASSET_STORAGE_REGION: "local",
      SIMULA_ASSET_STORAGE_ACCESS_KEY_ID: "local-access-key",
      SIMULA_ASSET_STORAGE_SECRET_ACCESS_KEY: "s".repeat(32),
    },
  ])("rejects unsafe migration configuration %#", (environment) => {
    expect(() => parseDomainRuntime(environment)).toThrow(
      DomainConfigurationError,
    );
  });

  it("defaults local/test CORS and rejects deployed wildcard or duplicates", () => {
    expect(parseCorsOrigins({ SIMULA_ENVIRONMENT: "test" })).toEqual([
      "http://127.0.0.1:3000",
      "http://localhost:3000",
    ]);
    expect(() =>
      parseCorsOrigins({
        SIMULA_ENVIRONMENT: "staging",
        SIMULA_CORS_ORIGINS:
          "https://app.example.test,https://app.example.test",
      }),
    ).toThrow(DomainConfigurationError);
    expect(() =>
      parseCorsOrigins({
        SIMULA_ENVIRONMENT: "staging",
        SIMULA_CORS_ORIGINS: "*",
      }),
    ).toThrow(DomainConfigurationError);
  });
});
