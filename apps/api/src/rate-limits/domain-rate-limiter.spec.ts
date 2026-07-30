import type { Redis as RedisClient } from "ioredis";

import { REQUIRED_DATABASE_MIGRATION_HEAD } from "../config/production-admission";
import type { EnabledDomainRuntime } from "../domain/domain-runtime";
import { RedisDomainRateLimiter } from "./domain-rate-limiter";

const CONFIG: EnabledDomainRuntime = {
  enabled: true,
  environment: "test",
  releaseSha: "a".repeat(40),
  migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD,
  databaseUrl: "postgresql://simula_api:password@127.0.0.1:54322/postgres",
  databaseCaPem: null,
  supabaseIssuer: "http://127.0.0.1:54321/auth/v1",
  supabaseJwksUrl: "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json",
  supabasePublishableKey: "sb_publishable_test",
  cursorSecret: "0123456789abcdef0123456789abcdef",
  redisConnection: {
    db: 14,
    enableOfflineQueue: false,
    host: "127.0.0.1",
    maxRetriesPerRequest: 1,
    port: 6379,
  },
  rateLimitKeyPrefix: "simula:test:rate",
  behavioralEngineUrl: "http://127.0.0.1:8010",
  behavioralEngineToken: "t".repeat(32),
};
const IP_HASH = "a".repeat(64);
const USER_ID = "018f274b-3c77-7b22-b749-c9274230ef9a";

function redisWith(...evaluations: unknown[]) {
  const client = {
    status: "wait",
    connect: jest.fn(async () => {
      client.status = "ready";
    }),
    ping: jest.fn().mockResolvedValue("PONG"),
    eval: jest.fn(),
    quit: jest.fn().mockResolvedValue("OK"),
    disconnect: jest.fn(),
  };
  for (const evaluation of evaluations) {
    client.eval.mockResolvedValueOnce(evaluation);
  }
  return client;
}

describe("RedisDomainRateLimiter", () => {
  it("consumes isolated IP and user token buckets", async () => {
    const client = redisWith([1, 0], [1, 0]);
    const limiter = new RedisDomainRateLimiter(
      CONFIG,
      client as unknown as RedisClient,
    );

    await limiter.requireUnauthenticated(IP_HASH);
    await limiter.requireGeneral(USER_ID);

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.eval.mock.calls[0]?.[2]).toBe(
      `${CONFIG.rateLimitKeyPrefix}:s2:general_unauthenticated:ip:${IP_HASH}`,
    );
    expect(client.eval.mock.calls[1]?.[2]).toBe(
      `${CONFIG.rateLimitKeyPrefix}:s2:general_authenticated:user:${USER_ID}`,
    );
  });

  it("returns a bounded durable rate-limit problem", async () => {
    const client = redisWith([0, 3]);
    const limiter = new RedisDomainRateLimiter(
      CONFIG,
      client as unknown as RedisClient,
    );

    await expect(limiter.requireUnauthenticated(IP_HASH)).rejects.toMatchObject(
      {
        status: 429,
        code: "rate_limited",
        retryAfter: 3,
      },
    );
  });

  it("refunds the provisional unauthenticated token", async () => {
    const client = redisWith(1);
    const limiter = new RedisDomainRateLimiter(
      CONFIG,
      client as unknown as RedisClient,
    );

    await limiter.releaseUnauthenticated(IP_HASH);
    expect(client.eval.mock.calls[0]?.[2]).toContain("general_unauthenticated");
  });

  it("fails closed on malformed Redis replies", async () => {
    const client = redisWith(["surprise"]);
    const limiter = new RedisDomainRateLimiter(
      CONFIG,
      client as unknown as RedisClient,
    );

    await expect(limiter.requireGeneral(USER_ID)).rejects.toMatchObject({
      status: 503,
      code: "dependency_unavailable",
      retryAfter: 5,
    });
  });

  it("accepts an idempotency marker and recognizes its replay", async () => {
    const client = redisWith([1, 0], 1, [2, 0]);
    const limiter = new RedisDomainRateLimiter(
      CONFIG,
      client as unknown as RedisClient,
    );
    const key = "organization-key-0001";
    const scope = "POST:/api/v2/organizations";

    const first = await limiter.requireOrganizationCreate(USER_ID, key, scope);
    expect(first).toMatchObject({
      acceptedReplay: false,
      ownerToken: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    await limiter.acceptIdempotency(first);
    const replay = await limiter.requireOrganizationCreate(USER_ID, key, scope);
    expect(replay.acceptedReplay).toBe(true);
    expect(client.eval.mock.calls[1]?.[1]).toBe(1);
  });

  it("rejects only the matching pending idempotency owner", async () => {
    const client = redisWith([1, 0], 1);
    const limiter = new RedisDomainRateLimiter(
      CONFIG,
      client as unknown as RedisClient,
    );
    const admission = await limiter.requireOrganizationMutation(
      USER_ID,
      "018f274b-3c77-7b22-b749-c9274230ef9c",
      {
        key: "project-command-0001",
        scope: "POST:/api/v2/organizations/{organization_id}/projects",
      },
    );
    expect(admission).not.toBeNull();

    await limiter.rejectIdempotency(admission!);
    expect(client.eval.mock.calls[1]?.slice(-1)[0]).toBe(admission?.ownerToken);
  });

  it("scans, deletes, and verifies organization-scoped Redis keys", async () => {
    const organizationId = "018f274b-3c77-7b22-b749-c9274230ef9c";
    const key = `${CONFIG.rateLimitKeyPrefix}:s2:organization_mutation:user:${USER_ID}:${organizationId}`;
    const client = redisWith();
    const scan = jest
      .fn()
      .mockResolvedValueOnce(["0", [key]])
      .mockResolvedValue(["0", []]);
    const del = jest.fn().mockResolvedValue(1);
    Object.assign(client, { scan, del });
    const limiter = new RedisDomainRateLimiter(
      CONFIG,
      client as unknown as RedisClient,
    );

    await expect(
      limiter.purgeOrganization(organizationId),
    ).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith(key);
    expect(scan).toHaveBeenCalledWith(
      "0",
      "MATCH",
      `${CONFIG.rateLimitKeyPrefix}:s2:organization_mutation:user:*:${organizationId}`,
      "COUNT",
      200,
    );
    expect(scan).toHaveBeenCalledTimes(10);
  });

  it("keeps the organization identity discoverable in run-create markers", async () => {
    const organizationId = "018f274b-3c77-7b22-b749-c9274230ef9c";
    const projectId = "018f274b-3c77-7b22-b749-c9274230ef9d";
    const client = redisWith([1, 0]);
    const limiter = new RedisDomainRateLimiter(
      CONFIG,
      client as unknown as RedisClient,
    );

    const admissions = await limiter.requireRunCreate(
      USER_ID,
      organizationId,
      projectId,
      "simulation-create-0001",
      "POST:/api/v2/projects/{project_id}/runs",
    );

    expect(admissions).toHaveLength(1);
    expect(admissions[0]?.markerKey).toMatch(
      new RegExp(
        `^${CONFIG.rateLimitKeyPrefix}:s2:run_create:organization:${organizationId}:idempotency:[0-9a-f]{64}$`,
      ),
    );
  });

  it("reports dependency readiness without leaking transport errors", async () => {
    const client = redisWith();
    client.connect.mockRejectedValueOnce(new Error("secret host"));
    const limiter = new RedisDomainRateLimiter(
      CONFIG,
      client as unknown as RedisClient,
    );

    await expect(limiter.isReady()).resolves.toBe(false);
  });
});
