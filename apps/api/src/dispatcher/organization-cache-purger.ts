import IORedis, { type Redis as RedisClient } from "ioredis";

import type { RedisConnectionOptions } from "../config/redis-connection";
import { organizationCachePatterns } from "../rate-limits/organization-cache-patterns";
import type { OrganizationCachePurger } from "./organization-deletion-reconciler";

const REDIS_TIMEOUT_MILLISECONDS = 1_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class RedisOrganizationCachePurger implements OrganizationCachePurger {
  private readonly client: RedisClient;
  private connection: Promise<void> | null = null;

  constructor(
    connection: RedisConnectionOptions,
    private readonly keyPrefix: string,
  ) {
    if (!/^[a-z][a-z0-9:_-]{2,127}$/.test(keyPrefix)) {
      throw new Error("organization cache key prefix is unsafe");
    }
    this.client = new IORedis({
      ...connection,
      commandTimeout: REDIS_TIMEOUT_MILLISECONDS,
      connectTimeout: REDIS_TIMEOUT_MILLISECONDS,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: null,
    });
  }

  async close(): Promise<void> {
    if (this.client.status === "ready") {
      await this.client.quit();
      return;
    }
    this.client.disconnect();
  }

  async purgeOrganization(organizationId: string): Promise<void> {
    if (!UUID_PATTERN.test(organizationId)) {
      throw new Error("organization cache identity is invalid");
    }
    await this.ensureConnected();
    const patterns = organizationCachePatterns(this.keyPrefix, organizationId);
    for (const pattern of patterns) {
      await this.scan(pattern, async (keys) => {
        if (keys.length > 0) await this.client.del(...keys);
      });
    }
    for (const pattern of patterns) {
      await this.scan(pattern, (keys) => {
        if (keys.length !== 0) {
          throw new Error(
            "organization cache cleanup could not verify absence",
          );
        }
      });
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.status === "ready") return;
    if (this.connection === null) {
      this.connection = this.client.connect().then(() => undefined);
    }
    try {
      await this.connection;
    } catch (error) {
      this.connection = null;
      throw error;
    }
  }

  private async scan(
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
}
