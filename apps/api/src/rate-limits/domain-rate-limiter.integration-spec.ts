import { randomUUID } from "node:crypto";
import type { Redis as RedisClient } from "ioredis";

import { REQUIRED_DATABASE_MIGRATION_HEAD } from "../config/production-admission";
import type { EnabledDomainRuntime } from "../domain/domain-runtime";
import {
  createDomainRedis,
  RedisDomainRateLimiter,
} from "./domain-rate-limiter";

const IP_A = "a".repeat(64);
const IP_B = "b".repeat(64);
const USER_A = "018f274b-3c77-7b22-b749-c9274230ef9a";
const USER_B = "018f274b-3c77-7b22-b749-c9274230ef9b";
const ORGANIZATION_ID = "018f274b-3c77-7b22-b749-c9274230ef9c";

describe("RedisDomainRateLimiter live Redis integration", () => {
  let client: RedisClient;
  let limiter: RedisDomainRateLimiter;
  let prefix: string;

  beforeAll(async () => {
    prefix = `simula:test:rate:${randomUUID()}`;
    const config: EnabledDomainRuntime = {
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
      rateLimitKeyPrefix: prefix,
      behavioralEngineUrl: "http://127.0.0.1:8010",
      behavioralEngineToken: "t".repeat(32),
    };
    client = createDomainRedis(config);
    limiter = new RedisDomainRateLimiter(config, client);
    await expect(limiter.isReady()).resolves.toBe(true);
  });

  afterAll(async () => {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        "MATCH",
        `${prefix}:*`,
        "COUNT",
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await client.unlink(...keys);
      }
    } while (cursor !== "0");
    await limiter.onModuleDestroy();
  });

  it("exhausts, isolates, and refunds the unauthenticated IP bucket", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await limiter.requireUnauthenticated(IP_A);
    }
    await expect(limiter.requireUnauthenticated(IP_A)).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
    await expect(limiter.requireUnauthenticated(IP_B)).resolves.toBeUndefined();
    await limiter.releaseUnauthenticated(IP_A);
    await expect(limiter.requireUnauthenticated(IP_A)).resolves.toBeUndefined();
  });

  it("exhausts one authenticated user without affecting another", async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await limiter.requireGeneral(USER_A);
    }
    await expect(limiter.requireGeneral(USER_A)).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
    await expect(limiter.requireGeneral(USER_B)).resolves.toBeUndefined();
  });

  it("allows an accepted idempotent replay without spending a second token", async () => {
    const key = "organization-create-0001";
    const scope = "POST:/api/v2/organizations";
    const first = await limiter.requireOrganizationCreate(USER_B, key, scope);
    expect(first.acceptedReplay).toBe(false);
    await limiter.acceptIdempotency(first);

    await expect(
      limiter.requireOrganizationCreate(USER_B, key, scope),
    ).resolves.toMatchObject({ acceptedReplay: true });
    await expect(
      limiter.requireOrganizationCreate(
        USER_B,
        "organization-create-0002",
        scope,
      ),
    ).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });

  it("atomically enforces the paired run-create buckets", async () => {
    const scope = "POST:/api/v2/projects/{project_id}/runs";
    const first = await limiter.requireRunCreate(
      USER_B,
      ORGANIZATION_ID,
      USER_A,
      "simulation-create-0001",
      scope,
    );
    await limiter.acceptIdempotency(...first);
    await expect(
      limiter.requireRunCreate(
        USER_B,
        ORGANIZATION_ID,
        USER_A,
        "simulation-create-0001",
        scope,
      ),
    ).resolves.toEqual([expect.objectContaining({ acceptedReplay: true })]);
  });

  it("purges only the selected organization's durable rate keys", async () => {
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const userId = randomUUID();
    const otherUserId = randomUUID();
    const projectId = randomUUID();
    const otherProjectId = randomUUID();
    const scope = "POST:/api/v2/projects/{project_id}/runs";
    const selected = await limiter.requireRunCreate(
      userId,
      organizationId,
      projectId,
      "simulation-purge-0001",
      scope,
    );
    const unrelated = await limiter.requireRunCreate(
      otherUserId,
      otherOrganizationId,
      otherProjectId,
      "simulation-purge-0002",
      scope,
    );
    const collidingUserKey = `${prefix}:s2:general_authenticated:user:${organizationId}`;
    await limiter.acceptIdempotency(...selected, ...unrelated);
    await client.set(collidingUserKey, "1");

    await limiter.purgeOrganization(organizationId);

    expect(
      await client.exists(
        `${prefix}:s2:run_create_organization:organization:${organizationId}`,
        selected[0]?.markerKey ?? "",
      ),
    ).toBe(0);
    expect(
      await client.exists(
        `${prefix}:s2:run_create_organization:organization:${otherOrganizationId}`,
        unrelated[0]?.markerKey ?? "",
      ),
    ).toBe(2);
    expect(await client.exists(collidingUserKey)).toBe(1);
    await client.del(collidingUserKey);
  });
});
