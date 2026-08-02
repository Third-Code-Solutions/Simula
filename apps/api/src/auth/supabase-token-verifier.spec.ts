import { generateKeyPairSync, type JsonWebKey } from "node:crypto";

import jwt from "jsonwebtoken";

import { REQUIRED_DATABASE_MIGRATION_HEAD } from "../config/production-admission";
import type { EnabledDomainRuntime } from "../domain/domain-runtime";
import { SupabaseTokenVerifier } from "./supabase-token-verifier";

const USER_ID = "018f274b-3c77-7b22-b749-c9274230ef9a";
const SESSION_ID = "018f274b-3c77-7b22-b749-c9274230ef9b";
const ISSUER = "https://project.supabase.co/auth/v1";
const KEY_ID = "test-key";

const CONFIG: EnabledDomainRuntime = Object.freeze({
  enabled: true,
  environment: "preview",
  releaseSha: "a".repeat(40),
  migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD,
  databaseUrl:
    "postgresql://simula_api:password@database.invalid:5432/postgres",
  databaseCaPem: "test-ca",
  supabaseIssuer: ISSUER,
  supabaseJwksUrl: `${ISSUER}/.well-known/jwks.json`,
  supabasePublishableKey: "sb_publishable_test",
  cursorSecret: "0123456789abcdef0123456789abcdef",
  redisConnection: {
    db: 14,
    enableOfflineQueue: false as const,
    host: "127.0.0.1",
    maxRetriesPerRequest: 1 as const,
    port: 6379,
  },
  rateLimitKeyPrefix: "simula:test:auth",
  behavioralEngineUrl: "http://127.0.0.1:8010",
  behavioralEngineToken: "t".repeat(32),
});

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2_048,
});
const publicJwk = publicKey.export({ format: "jwk" }) as JsonWebKey;

function token(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      role: "authenticated",
      session_id: SESSION_ID,
      ...overrides,
    },
    privateKey,
    {
      algorithm: "RS256",
      audience: "authenticated",
      expiresIn: 60,
      issuer: ISSUER,
      subject: USER_ID,
      keyid: KEY_ID,
      header: {
        alg: "RS256",
        kid: KEY_ID,
        typ: "JWT",
      },
    },
  );
}

function jwks(keys: readonly unknown[]): Response {
  return new Response(JSON.stringify({ keys }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function keyDocument(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...publicJwk,
    alg: "RS256",
    key_ops: ["verify"],
    kid: KEY_ID,
    use: "sig",
    ...overrides,
  };
}

describe("SupabaseTokenVerifier", () => {
  it("verifies an exact asymmetric Supabase token and caches its JWKS", async () => {
    const fetcher = jest.fn().mockResolvedValue(jwks([keyDocument()]));
    const verifier = new SupabaseTokenVerifier(CONFIG, fetcher);
    const signed = token();

    await expect(verifier.verify(signed)).resolves.toEqual({
      userId: USER_ID,
      issuer: ISSUER,
      expiresAt: expect.any(Number),
      sessionId: SESSION_ID,
    });
    await expect(verifier.verify(signed)).resolves.toMatchObject({
      userId: USER_ID,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    token({ role: "service_role" }),
    token({ session_id: "not-a-uuid" }),
    jwt.sign(
      {
        role: "authenticated",
        session_id: SESSION_ID,
        sub: USER_ID,
        iss: ISSUER,
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) - 1,
      },
      privateKey,
      {
        algorithm: "RS256",
        keyid: KEY_ID,
        header: { alg: "RS256", kid: KEY_ID, typ: "JWT" },
      },
    ),
  ])("rejects an invalid token claim set %#", async (signed) => {
    const verifier = new SupabaseTokenVerifier(
      CONFIG,
      jest.fn().mockResolvedValue(jwks([keyDocument()])),
    );
    await expect(verifier.verify(signed)).rejects.toMatchObject({
      code: "unauthenticated",
      status: 401,
    });
  });

  it("fails a duplicate or malformed JWKS closed as a dependency error", async () => {
    const verifier = new SupabaseTokenVerifier(
      CONFIG,
      jest.fn().mockResolvedValue(jwks([keyDocument(), keyDocument()])),
    );

    await expect(verifier.verify(token())).rejects.toMatchObject({
      code: "dependency_unavailable",
      status: 503,
    });
  });

  it("uses the Supabase user endpoint for local symmetric token verification", async () => {
    const localConfig: EnabledDomainRuntime = {
      ...CONFIG,
      environment: "test",
      supabaseIssuer: "http://127.0.0.1:54321/auth/v1",
      supabaseJwksUrl: "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json",
    };
    const signed = jwt.sign(
      {
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 60,
        iss: localConfig.supabaseIssuer,
        role: "authenticated",
        session_id: SESSION_ID,
        sub: USER_ID,
      },
      "local-secret",
      {
        algorithm: "HS256",
        header: { alg: "HS256", typ: "JWT" },
      },
    );
    const fetcher = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: USER_ID }), { status: 200 }),
      );

    await expect(
      new SupabaseTokenVerifier(localConfig, fetcher).verify(signed),
    ).resolves.toMatchObject({ userId: USER_ID, sessionId: SESSION_ID });
    expect(fetcher).toHaveBeenCalledWith(
      `${localConfig.supabaseIssuer}/user`,
      expect.objectContaining({
        redirect: "error",
        headers: expect.objectContaining({
          apikey: localConfig.supabasePublishableKey,
          Authorization: `Bearer ${signed}`,
        }),
      }),
    );
  });

  it("rejects local symmetric tokens outside local and test", async () => {
    const signed = jwt.sign(
      {
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 60,
        iss: ISSUER,
        role: "authenticated",
        session_id: SESSION_ID,
        sub: USER_ID,
      },
      "secret",
      {
        algorithm: "HS256",
        header: { alg: "HS256", typ: "JWT" },
      },
    );
    await expect(
      new SupabaseTokenVerifier(CONFIG, jest.fn()).verify(signed),
    ).rejects.toMatchObject({ code: "unauthenticated", status: 401 });
  });
});
