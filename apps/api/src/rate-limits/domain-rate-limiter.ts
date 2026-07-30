import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import IORedis, { type Redis as RedisClient } from "ioredis";
import { createHash, randomBytes } from "node:crypto";

import {
  DOMAIN_RATE_LIMITER,
  DOMAIN_REDIS_CLIENT,
  DOMAIN_RUNTIME_CONFIG,
} from "../domain/domain.constants";
import type { EnabledDomainRuntime } from "../domain/domain-runtime";
import { AppProblem, dependencyUnavailable } from "../domain/problem";
import { organizationCachePatterns } from "./organization-cache-patterns";

const RATE_KEY_SCHEMA = "s2";
const REDIS_TIMEOUT_MS = 1_000;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IDEMPOTENCY_PATTERN = /^[ -~]{16,128}$/;

const TOKEN_BUCKET_LUA = `
if #KEYS == 2 then
  local marker_state = redis.call('HGET', KEYS[2], 'state')
  if marker_state == 'accepted' then
    return {2, 0}
  end
  if marker_state == 'pending' then
    local owner_field = 'owner:' .. ARGV[5]
    if redis.call('HSETNX', KEYS[2], owner_field, 1) == 1 then
      redis.call('HINCRBY', KEYS[2], 'participants', 1)
    end
    return {3, 0}
  end
end

local now_parts = redis.call('TIME')
local now = tonumber(now_parts[1]) + (tonumber(now_parts[2]) / 1000000)
local refill_per_second = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local ttl_seconds = tonumber(ARGV[3])

local stored = redis.call('HMGET', KEYS[1], 'tokens', 'updated_at')
local tokens = tonumber(stored[1]) or capacity
local updated_at = tonumber(stored[2]) or now
if updated_at > now then
  updated_at = now
end
tokens = math.min(capacity, tokens + ((now - updated_at) * refill_per_second))

if tokens < 1 then
  local retry_after = math.ceil((1 - tokens) / refill_per_second)
  redis.call('HMSET', KEYS[1], 'tokens', tokens, 'updated_at', now)
  redis.call('EXPIRE', KEYS[1], ttl_seconds)
  return {0, retry_after}
end

tokens = tokens - 1
redis.call('HMSET', KEYS[1], 'tokens', tokens, 'updated_at', now)
redis.call('EXPIRE', KEYS[1], ttl_seconds)
if #KEYS == 2 then
  redis.call(
    'HSET', KEYS[2],
    'state', 'pending',
    'participants', 1,
    'owner:' .. ARGV[5], 1
  )
  redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4]))
end
return {1, 0}
`;

const ACCEPT_IDEMPOTENCY_LUA = `
for _, key in ipairs(KEYS) do
  local remaining_ttl = redis.call('TTL', key)
  redis.call('DEL', key)
  redis.call('HSET', key, 'state', 'accepted', 'participants', 0)
  if remaining_ttl > 0 then
    redis.call('EXPIRE', key, remaining_ttl)
  else
    redis.call('EXPIRE', key, tonumber(ARGV[1]))
  end
end
return #KEYS
`;

const REJECT_IDEMPOTENCY_LUA = `
local removed = 0
for index, key in ipairs(KEYS) do
  if redis.call('HGET', key, 'state') == 'pending' then
    local owner_field = 'owner:' .. ARGV[index]
    if redis.call('HDEL', key, owner_field) == 1 then
      local participants = redis.call('HINCRBY', key, 'participants', -1)
      if participants <= 0 then
        redis.call('DEL', key)
      end
      removed = removed + 1
    end
  end
end
return removed
`;

const RUN_CREATE_TOKEN_BUCKET_LUA = `
local marker_state = redis.call('HGET', KEYS[3], 'state')
if marker_state == 'accepted' then
  return {2, 0}
end
if marker_state == 'pending' then
  local owner_field = 'owner:' .. ARGV[8]
  if redis.call('HSETNX', KEYS[3], owner_field, 1) == 1 then
    redis.call('HINCRBY', KEYS[3], 'participants', 1)
  end
  return {3, 0}
end

local now_parts = redis.call('TIME')
local now = tonumber(now_parts[1]) + (tonumber(now_parts[2]) / 1000000)

local function refill(key, refill_per_second, capacity)
  local stored = redis.call('HMGET', key, 'tokens', 'updated_at')
  local tokens = tonumber(stored[1]) or capacity
  local updated_at = tonumber(stored[2]) or now
  if updated_at > now then
    updated_at = now
  end
  return math.min(capacity, tokens + ((now - updated_at) * refill_per_second))
end

local user_refill = tonumber(ARGV[1])
local user_capacity = tonumber(ARGV[2])
local user_tokens = refill(KEYS[1], user_refill, user_capacity)
local organization_refill = tonumber(ARGV[4])
local organization_capacity = tonumber(ARGV[5])
local organization_tokens = refill(KEYS[2], organization_refill, organization_capacity)

local retry_after = 0
if user_tokens < 1 then
  retry_after = math.max(retry_after, math.ceil((1 - user_tokens) / user_refill))
end
if organization_tokens < 1 then
  retry_after = math.max(
    retry_after,
    math.ceil((1 - organization_tokens) / organization_refill)
  )
end

if retry_after > 0 then
  redis.call('HMSET', KEYS[1], 'tokens', user_tokens, 'updated_at', now)
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
  redis.call('HMSET', KEYS[2], 'tokens', organization_tokens, 'updated_at', now)
  redis.call('EXPIRE', KEYS[2], tonumber(ARGV[6]))
  return {0, retry_after}
end

redis.call('HMSET', KEYS[1], 'tokens', user_tokens - 1, 'updated_at', now)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
redis.call('HMSET', KEYS[2], 'tokens', organization_tokens - 1, 'updated_at', now)
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[6]))
redis.call(
  'HSET', KEYS[3],
  'state', 'pending',
  'participants', 1,
  'owner:' .. ARGV[8], 1
)
redis.call('EXPIRE', KEYS[3], tonumber(ARGV[7]))
return {1, 0}
`;

const TOKEN_BUCKET_REFUND_LUA = `
local now_parts = redis.call('TIME')
local now = tonumber(now_parts[1]) + (tonumber(now_parts[2]) / 1000000)
local refill_per_second = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local ttl_seconds = tonumber(ARGV[3])

local stored = redis.call('HMGET', KEYS[1], 'tokens', 'updated_at')
local tokens = tonumber(stored[1]) or capacity
local updated_at = tonumber(stored[2]) or now
if updated_at > now then
  updated_at = now
end
tokens = math.min(capacity, tokens + ((now - updated_at) * refill_per_second))
tokens = math.min(capacity, tokens + 1)
redis.call('HMSET', KEYS[1], 'tokens', tokens, 'updated_at', now)
redis.call('EXPIRE', KEYS[1], ttl_seconds)
return 1
`;

interface TokenBucketPolicy {
  readonly name: string;
  readonly limit: number;
  readonly periodSeconds: number;
  readonly burst: number;
}

const GENERAL_AUTHENTICATED: TokenBucketPolicy = Object.freeze({
  name: "general_authenticated",
  limit: 120,
  periodSeconds: 60,
  burst: 30,
});
const GENERAL_UNAUTHENTICATED: TokenBucketPolicy = Object.freeze({
  name: "general_unauthenticated",
  limit: 30,
  periodSeconds: 60,
  burst: 10,
});
const ORGANIZATION_CREATE: TokenBucketPolicy = Object.freeze({
  name: "organization_create",
  limit: 3,
  periodSeconds: 60 * 60,
  burst: 1,
});
const ORGANIZATION_MUTATION: TokenBucketPolicy = Object.freeze({
  name: "organization_mutation",
  limit: 30,
  periodSeconds: 60 * 60,
  burst: 5,
});
const RUN_CREATE_USER: TokenBucketPolicy = Object.freeze({
  name: "run_create_user",
  limit: 10,
  periodSeconds: 60 * 60,
  burst: 2,
});
const RUN_CREATE_ORGANIZATION: TokenBucketPolicy = Object.freeze({
  name: "run_create_organization",
  limit: 50,
  periodSeconds: 24 * 60 * 60,
  burst: 2,
});
const RUN_READ: TokenBucketPolicy = Object.freeze({
  name: "run_read",
  limit: 60,
  periodSeconds: 60,
  burst: 10,
});
const RUN_CANCEL: TokenBucketPolicy = Object.freeze({
  name: "run_cancel",
  limit: 30,
  periodSeconds: 60 * 60,
  burst: 5,
});

export interface RateAdmission {
  readonly markerKey: string;
  readonly ownerToken: string;
  readonly acceptedReplay: boolean;
}

export interface DomainRateLimiter {
  isReady(): Promise<boolean>;
  requireUnauthenticated(ipHash: string): Promise<void>;
  releaseUnauthenticated(ipHash: string): Promise<void>;
  requireGeneral(userId: string): Promise<void>;
  requireOrganizationCreate(
    userId: string,
    idempotencyKey: string,
    idempotencyScope: string,
  ): Promise<RateAdmission>;
  requireOrganizationMutation(
    userId: string,
    organizationId: string,
    idempotency?: {
      readonly key: string;
      readonly scope: string;
      readonly resourceId?: string;
    },
  ): Promise<RateAdmission | null>;
  purgeOrganization(organizationId: string): Promise<void>;
  requireRunCreate(
    userId: string,
    organizationId: string,
    projectId: string,
    idempotencyKey: string,
    idempotencyScope: string,
  ): Promise<readonly RateAdmission[]>;
  acceptIdempotency(...admissions: readonly RateAdmission[]): Promise<void>;
  rejectIdempotency(...admissions: readonly RateAdmission[]): Promise<void>;
  requireRunRead(userId: string, runId: string): Promise<void>;
  requireRunCancel(userId: string, organizationId: string): Promise<void>;
}

function dependencyProblem(): AppProblem {
  return dependencyUnavailable(
    "The request could not be safely rate limited. Retry shortly.",
  );
}

function refillPerSecond(policy: TokenBucketPolicy): number {
  return policy.limit / policy.periodSeconds;
}

function ttlSeconds(policy: TokenBucketPolicy): number {
  return Math.max(60, Math.ceil((policy.burst / refillPerSecond(policy)) * 2));
}

function exactEvaluation(value: unknown): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw dependencyProblem();
  }
  const allowed = Number(value[0]);
  const retryAfter = Number(value[1]);
  if (
    !Number.isSafeInteger(allowed) ||
    !Number.isSafeInteger(retryAfter) ||
    retryAfter < 0
  ) {
    throw dependencyProblem();
  }
  return [allowed, retryAfter];
}

function requireUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw dependencyProblem();
  }
}

function requireIdempotency(key: string, scope: string): void {
  if (
    !IDEMPOTENCY_PATTERN.test(key) ||
    scope.length < 3 ||
    scope.length > 512 ||
    /[\0\r\n]/.test(scope)
  ) {
    throw dependencyProblem();
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createDomainRedis(config: EnabledDomainRuntime): RedisClient {
  return new IORedis({
    ...config.redisConnection,
    commandTimeout: REDIS_TIMEOUT_MS,
    connectTimeout: REDIS_TIMEOUT_MS,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: null,
  });
}

@Injectable()
export class RedisDomainRateLimiter
  implements DomainRateLimiter, OnModuleDestroy
{
  private connection: Promise<void> | null = null;

  constructor(
    @Inject(DOMAIN_RUNTIME_CONFIG)
    private readonly config: EnabledDomainRuntime,
    @Inject(DOMAIN_REDIS_CLIENT)
    private readonly client: RedisClient,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === "ready") {
      try {
        await this.client.quit();
        return;
      } catch {
        // A broken transport still needs its local resources released.
      }
    }
    this.client.disconnect(false);
  }

  async isReady(): Promise<boolean> {
    try {
      await this.ensureConnected();
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async requireUnauthenticated(ipHash: string): Promise<void> {
    if (!/^[0-9a-f]{64}$/.test(ipHash)) {
      throw dependencyProblem();
    }
    await this.consume(GENERAL_UNAUTHENTICATED, `ip:${ipHash}`);
  }

  async releaseUnauthenticated(ipHash: string): Promise<void> {
    if (!/^[0-9a-f]{64}$/.test(ipHash)) {
      throw dependencyProblem();
    }
    const result = await this.evaluate(
      TOKEN_BUCKET_REFUND_LUA,
      [this.key(GENERAL_UNAUTHENTICATED, `ip:${ipHash}`)],
      [
        String(refillPerSecond(GENERAL_UNAUTHENTICATED)),
        String(GENERAL_UNAUTHENTICATED.burst),
        String(ttlSeconds(GENERAL_UNAUTHENTICATED)),
      ],
    );
    if (Number(result) !== 1) {
      throw dependencyProblem();
    }
  }

  async requireGeneral(userId: string): Promise<void> {
    requireUuid(userId);
    await this.consume(GENERAL_AUTHENTICATED, `user:${userId}`);
  }

  async requireOrganizationCreate(
    userId: string,
    idempotencyKey: string,
    idempotencyScope: string,
  ): Promise<RateAdmission> {
    requireUuid(userId);
    const admission = await this.consume(
      ORGANIZATION_CREATE,
      `user:${userId}`,
      {
        key: idempotencyKey,
        scope: idempotencyScope,
      },
    );
    if (admission === null) {
      throw dependencyProblem();
    }
    return admission;
  }

  async requireOrganizationMutation(
    userId: string,
    organizationId: string,
    idempotency?: {
      readonly key: string;
      readonly scope: string;
      readonly resourceId?: string;
    },
  ): Promise<RateAdmission | null> {
    requireUuid(userId);
    requireUuid(organizationId);
    if (idempotency?.resourceId !== undefined) {
      requireUuid(idempotency.resourceId);
    }
    return this.consume(
      ORGANIZATION_MUTATION,
      `user:${userId}`,
      idempotency,
      organizationId,
    );
  }

  async purgeOrganization(organizationId: string): Promise<void> {
    requireUuid(organizationId);
    try {
      await this.ensureConnected();
      const patterns = organizationCachePatterns(
        this.config.rateLimitKeyPrefix,
        organizationId,
      );
      for (const pattern of patterns) {
        await this.scanOrganizationKeys(pattern, async (keys) => {
          if (keys.length > 0) await this.client.del(...keys);
        });
      }
      for (const pattern of patterns) {
        await this.scanOrganizationKeys(pattern, (keys) => {
          if (keys.length !== 0) throw dependencyProblem();
        });
      }
    } catch {
      throw dependencyProblem();
    }
  }

  private async scanOrganizationKeys(
    pattern: string,
    visit: (keys: readonly string[]) => Promise<void> | void,
  ): Promise<void> {
    let cursor = "0";
    do {
      const [next, keys] = await this.client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        200,
      );
      cursor = next;
      await visit(keys);
    } while (cursor !== "0");
  }

  async requireRunCreate(
    userId: string,
    organizationId: string,
    projectId: string,
    idempotencyKey: string,
    idempotencyScope: string,
  ): Promise<readonly RateAdmission[]> {
    requireUuid(userId);
    requireUuid(organizationId);
    requireUuid(projectId);
    requireIdempotency(idempotencyKey, idempotencyScope);
    const ownerToken = randomBytes(16).toString("hex");
    const userKey = this.key(RUN_CREATE_USER, `user:${userId}`);
    const organizationKey = [
      this.config.rateLimitKeyPrefix,
      RATE_KEY_SCHEMA,
      RUN_CREATE_ORGANIZATION.name,
      "organization",
      organizationId,
    ].join(":");
    const markerKey = [
      this.config.rateLimitKeyPrefix,
      RATE_KEY_SCHEMA,
      "run_create",
      "organization",
      organizationId,
      "idempotency",
      sha256(
        `${userId}\0${organizationId}\0${projectId}\0${idempotencyScope}\0${idempotencyKey}`,
      ),
    ].join(":");
    const evaluation = exactEvaluation(
      await this.evaluate(
        RUN_CREATE_TOKEN_BUCKET_LUA,
        [userKey, organizationKey, markerKey],
        [
          String(refillPerSecond(RUN_CREATE_USER)),
          String(RUN_CREATE_USER.burst),
          String(ttlSeconds(RUN_CREATE_USER)),
          String(refillPerSecond(RUN_CREATE_ORGANIZATION)),
          String(RUN_CREATE_ORGANIZATION.burst),
          String(ttlSeconds(RUN_CREATE_ORGANIZATION)),
          String(IDEMPOTENCY_TTL_SECONDS),
          ownerToken,
        ],
      ),
    );
    if (evaluation[0] === 0) {
      throw this.rateProblem(evaluation[1]);
    }
    if (![1, 2, 3].includes(evaluation[0])) {
      throw dependencyProblem();
    }
    return [
      Object.freeze({
        markerKey,
        ownerToken,
        acceptedReplay: evaluation[0] === 2,
      }),
    ];
  }

  async acceptIdempotency(
    ...admissions: readonly RateAdmission[]
  ): Promise<void> {
    const markerKeys = [
      ...new Set(admissions.map((admission) => admission.markerKey)),
    ];
    if (markerKeys.length === 0) {
      return;
    }
    this.validateMarkerKeys(markerKeys);
    const result = await this.evaluate(ACCEPT_IDEMPOTENCY_LUA, markerKeys, [
      String(IDEMPOTENCY_TTL_SECONDS),
    ]);
    if (Number(result) !== markerKeys.length) {
      throw dependencyProblem();
    }
  }

  async rejectIdempotency(
    ...admissions: readonly RateAdmission[]
  ): Promise<void> {
    const unique = new Map<string, RateAdmission>();
    for (const admission of admissions) {
      unique.set(`${admission.markerKey}\0${admission.ownerToken}`, admission);
    }
    const values = [...unique.values()];
    if (values.length === 0) {
      return;
    }
    this.validateMarkerKeys(values.map((admission) => admission.markerKey));
    if (
      values.some((admission) => !/^[0-9a-f]{32}$/.test(admission.ownerToken))
    ) {
      throw dependencyProblem();
    }
    const result = await this.evaluate(
      REJECT_IDEMPOTENCY_LUA,
      values.map((admission) => admission.markerKey),
      values.map((admission) => admission.ownerToken),
    );
    const removed = Number(result);
    if (
      !Number.isSafeInteger(removed) ||
      removed < 0 ||
      removed > values.length
    ) {
      throw dependencyProblem();
    }
  }

  async requireRunRead(userId: string, runId: string): Promise<void> {
    requireUuid(userId);
    requireUuid(runId);
    await this.consume(RUN_READ, `user:${userId}:run:${runId}`);
  }

  async requireRunCancel(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    requireUuid(userId);
    requireUuid(organizationId);
    await this.consume(RUN_CANCEL, `user:${userId}`, undefined, organizationId);
  }

  private async consume(
    policy: TokenBucketPolicy,
    subject: string,
    idempotency?: {
      readonly key: string;
      readonly scope: string;
      readonly resourceId?: string;
    },
    organizationId?: string,
  ): Promise<RateAdmission | null> {
    const keys = [this.key(policy, subject, organizationId)];
    const ownerToken = randomBytes(16).toString("hex");
    if (idempotency !== undefined) {
      requireIdempotency(idempotency.key, idempotency.scope);
      keys.push(
        [
          keys[0],
          "idempotency",
          sha256(
            `${idempotency.scope}\0${idempotency.resourceId ?? ""}\0${idempotency.key}`,
          ),
        ].join(":"),
      );
    }
    const evaluation = exactEvaluation(
      await this.evaluate(TOKEN_BUCKET_LUA, keys, [
        String(refillPerSecond(policy)),
        String(policy.burst),
        String(ttlSeconds(policy)),
        String(IDEMPOTENCY_TTL_SECONDS),
        ownerToken,
      ]),
    );
    if ([1, 2, 3].includes(evaluation[0])) {
      if (keys.length === 1) {
        return null;
      }
      return Object.freeze({
        markerKey: keys[1] ?? "",
        ownerToken,
        acceptedReplay: evaluation[0] === 2,
      });
    }
    if (evaluation[0] !== 0) {
      throw dependencyProblem();
    }
    throw this.rateProblem(evaluation[1]);
  }

  private rateProblem(retryAfter: number): AppProblem {
    return new AppProblem(
      429,
      "rate_limited",
      "Rate limit reached",
      "Too many requests. Retry after the indicated delay.",
      [],
      Math.max(1, retryAfter),
    );
  }

  private key(
    policy: TokenBucketPolicy,
    subject: string,
    organizationId?: string,
  ): string {
    const parts = [
      this.config.rateLimitKeyPrefix,
      RATE_KEY_SCHEMA,
      policy.name,
      subject,
    ];
    if (organizationId !== undefined) {
      parts.push(organizationId);
    }
    return parts.join(":");
  }

  private validateMarkerKeys(keys: readonly string[]): void {
    const prefix = `${this.config.rateLimitKeyPrefix}:${RATE_KEY_SCHEMA}:`;
    if (
      keys.some(
        (key) =>
          !key.startsWith(prefix) || key.length > 1_024 || /[\0\r\n]/.test(key),
      )
    ) {
      throw dependencyProblem();
    }
  }

  private async evaluate(
    script: string,
    keys: readonly string[],
    arguments_: readonly string[],
  ): Promise<unknown> {
    try {
      await this.ensureConnected();
      return await this.client.eval(
        script,
        keys.length,
        ...keys,
        ...arguments_,
      );
    } catch (error) {
      if (error instanceof AppProblem) {
        throw error;
      }
      throw dependencyProblem();
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.status === "ready") {
      return;
    }
    this.connection ??= this.client
      .connect()
      .then(() => undefined)
      .finally(() => {
        this.connection = null;
      });
    await this.connection;
  }
}

@Injectable()
export class UnavailableDomainRateLimiter implements DomainRateLimiter {
  async isReady(): Promise<boolean> {
    return true;
  }

  async requireUnauthenticated(_ipHash: string): Promise<void> {
    return;
  }

  async releaseUnauthenticated(_ipHash: string): Promise<void> {
    return;
  }

  async requireGeneral(_userId: string): Promise<void> {
    return;
  }

  async requireOrganizationCreate(
    _userId: string,
    _idempotencyKey: string,
    _idempotencyScope: string,
  ): Promise<RateAdmission> {
    throw dependencyProblem();
  }

  async requireOrganizationMutation(
    _userId: string,
    _organizationId: string,
    _idempotency?: {
      readonly key: string;
      readonly scope: string;
      readonly resourceId?: string;
    },
  ): Promise<RateAdmission | null> {
    throw dependencyProblem();
  }

  async purgeOrganization(_organizationId: string): Promise<void> {
    throw dependencyProblem();
  }

  async requireRunCreate(
    _userId: string,
    _organizationId: string,
    _projectId: string,
    _idempotencyKey: string,
    _idempotencyScope: string,
  ): Promise<readonly RateAdmission[]> {
    throw dependencyProblem();
  }

  async acceptIdempotency(
    ..._admissions: readonly RateAdmission[]
  ): Promise<void> {
    throw dependencyProblem();
  }

  async rejectIdempotency(
    ..._admissions: readonly RateAdmission[]
  ): Promise<void> {
    throw dependencyProblem();
  }

  async requireRunRead(_userId: string, _runId: string): Promise<void> {
    throw dependencyProblem();
  }

  async requireRunCancel(
    _userId: string,
    _organizationId: string,
  ): Promise<void> {
    throw dependencyProblem();
  }
}

export const DomainRateLimiterToken = DOMAIN_RATE_LIMITER;
