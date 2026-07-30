import { parseRedisConnection } from "./redis-connection";

describe("parseRedisConnection", () => {
  it("returns null when Redis is intentionally unconfigured", () => {
    expect(parseRedisConnection({})).toBeNull();
  });

  it("parses a TLS connection without exposing URL structure", () => {
    expect(
      parseRedisConnection({
        SIMULA_ENVIRONMENT: "production",
        SIMULA_REDIS_URL: "rediss://worker:secret@redis.internal:6380/2",
      }),
    ).toEqual({
      db: 2,
      enableOfflineQueue: false,
      host: "redis.internal",
      maxRetriesPerRequest: 1,
      password: "secret",
      port: 6380,
      tls: { servername: "redis.internal" },
      username: "worker",
    });
  });

  it("rejects plaintext production Redis", () => {
    expect(() =>
      parseRedisConnection({
        SIMULA_ENVIRONMENT: "production",
        SIMULA_REDIS_URL: "redis://redis.internal:6379/0",
      }),
    ).toThrow(
      "Production Redis requires rediss:// or Railway private networking.",
    );
  });

  it("accepts Railway private-network Redis without public TLS", () => {
    expect(
      parseRedisConnection({
        SIMULA_ENVIRONMENT: "production",
        SIMULA_REDIS_URL:
          "redis://default:secret@redis.railway.internal:6379/0",
      }),
    ).toMatchObject({
      host: "redis.railway.internal",
      password: "secret",
      port: 6379,
    });
  });

  it("rejects surprising URL options", () => {
    expect(() =>
      parseRedisConnection({
        SIMULA_REDIS_URL: "redis://127.0.0.1:6379/0?tls=false",
      }),
    ).toThrow("must not contain query or fragment data");
  });
});
