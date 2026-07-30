import {
  createPublicKey,
  type JsonWebKey,
  type KeyObject,
  timingSafeEqual,
} from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import jwt, { type JwtHeader, type JwtPayload } from "jsonwebtoken";

import {
  DOMAIN_HTTP_FETCHER,
  DOMAIN_RUNTIME_CONFIG,
} from "../domain/domain.constants";
import type { EnabledDomainRuntime } from "../domain/domain-runtime";
import { dependencyUnavailable, unauthenticated } from "../domain/problem";
import type { IdentityVerifier, VerifiedIdentity } from "./identity";

const ALGORITHMS = new Set(["ES256", "RS256"]);
const JWKS_TTL_MS = 600_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_TOKEN_BYTES = 8 * 1024;
const FETCH_TIMEOUT_MS = 2_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw unauthenticated();
  }
  return value as Record<string, unknown>;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) ||
      Number(declaredLength) > MAX_RESPONSE_BYTES)
  ) {
    throw dependencyUnavailable(
      "Authentication could not be verified. Retry shortly.",
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_RESPONSE_BYTES) {
    throw dependencyUnavailable(
      "Authentication could not be verified. Retry shortly.",
    );
  }
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw dependencyUnavailable(
      "Authentication could not be verified. Retry shortly.",
    );
  }
}

@Injectable()
export class SupabaseTokenVerifier implements IdentityVerifier {
  private keys = new Map<string, { algorithm: string; key: KeyObject }>();
  private keysExpireAt = 0;
  private refreshPromise: Promise<void> | null = null;

  constructor(
    @Inject(DOMAIN_RUNTIME_CONFIG)
    private readonly config: EnabledDomainRuntime,
    @Inject(DOMAIN_HTTP_FETCHER)
    private readonly fetcher: Fetcher,
  ) {}

  async verify(token: string): Promise<VerifiedIdentity> {
    if (
      token === "" ||
      Buffer.byteLength(token, "utf8") > MAX_TOKEN_BYTES ||
      /\s/.test(token)
    ) {
      throw unauthenticated();
    }

    const decoded = jwt.decode(token, { complete: true });
    if (
      decoded === null ||
      typeof decoded.payload === "string" ||
      decoded.header.typ !== "JWT"
    ) {
      throw unauthenticated();
    }
    const algorithm = decoded.header.alg;
    if (algorithm === "HS256") {
      if (
        this.config.environment !== "local" &&
        this.config.environment !== "test"
      ) {
        throw unauthenticated();
      }
      return this.verifyLocalSymmetric(token, decoded.payload);
    }
    if (!ALGORITHMS.has(algorithm)) {
      throw unauthenticated();
    }

    const keyId = decoded.header.kid;
    if (typeof keyId !== "string" || keyId === "") {
      throw unauthenticated();
    }
    const candidate = await this.keyFor(keyId);
    if (
      !constantTimeEqual(candidate.algorithm, algorithm) ||
      !constantTimeEqual(candidate.algorithm, decoded.header.alg)
    ) {
      throw unauthenticated();
    }

    let claims: JwtPayload;
    try {
      const verified = jwt.verify(token, candidate.key, {
        algorithms: [algorithm as "ES256" | "RS256"],
        audience: "authenticated",
        issuer: this.config.supabaseIssuer,
      });
      if (typeof verified === "string") {
        throw unauthenticated();
      }
      claims = verified;
    } catch {
      throw unauthenticated();
    }
    return this.identity(claims);
  }

  private async verifyLocalSymmetric(
    token: string,
    decodedClaims: JwtPayload,
  ): Promise<VerifiedIdentity> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.config.supabaseIssuer}/user`, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          apikey: this.config.supabasePublishableKey,
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      throw dependencyUnavailable(
        "Authentication could not be verified. Retry shortly.",
      );
    }
    if (response.status >= 500) {
      throw dependencyUnavailable(
        "Authentication could not be verified. Retry shortly.",
      );
    }
    if (response.status !== 200) {
      throw unauthenticated();
    }
    const user = jsonObject(await readBoundedJson(response));
    const identity = this.identity(decodedClaims);
    if (
      typeof user.id !== "string" ||
      !constantTimeEqual(user.id, identity.userId)
    ) {
      throw unauthenticated();
    }
    return identity;
  }

  private async keyFor(
    keyId: string,
  ): Promise<{ algorithm: string; key: KeyObject }> {
    if (Date.now() >= this.keysExpireAt) {
      await this.refreshKeys(false);
    }
    let key = this.keys.get(keyId);
    if (key === undefined) {
      await this.refreshKeys(true);
      key = this.keys.get(keyId);
    }
    if (key === undefined) {
      throw unauthenticated();
    }
    return key;
  }

  private async refreshKeys(force: boolean): Promise<void> {
    if (!force && Date.now() < this.keysExpireAt) {
      return;
    }
    if (this.refreshPromise !== null) {
      await this.refreshPromise;
      return;
    }
    this.refreshPromise = this.fetchKeys();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async fetchKeys(): Promise<void> {
    let response: Response;
    try {
      response = await this.fetcher(this.config.supabaseJwksUrl, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });
    } catch {
      throw dependencyUnavailable(
        "Authentication could not be verified. Retry shortly.",
      );
    }
    if (!response.ok) {
      throw dependencyUnavailable(
        "Authentication could not be verified. Retry shortly.",
      );
    }
    const payload = jsonObject(await readBoundedJson(response));
    const rawKeys = payload.keys;
    if (!Array.isArray(rawKeys)) {
      throw dependencyUnavailable(
        "Authentication could not be verified. Retry shortly.",
      );
    }

    const parsed = new Map<string, { algorithm: string; key: KeyObject }>();
    try {
      for (const value of rawKeys) {
        const raw = jsonObject(value);
        const keyId = raw.kid;
        const algorithm = raw.alg;
        if (
          typeof keyId !== "string" ||
          keyId === "" ||
          typeof algorithm !== "string" ||
          !ALGORITHMS.has(algorithm) ||
          !Array.isArray(raw.key_ops) ||
          raw.key_ops.length !== 1 ||
          raw.key_ops[0] !== "verify"
        ) {
          continue;
        }
        if (parsed.has(keyId)) {
          throw new Error("duplicate key identity");
        }
        parsed.set(keyId, {
          algorithm,
          key: createPublicKey({
            key: raw as unknown as JsonWebKey,
            format: "jwk",
          }),
        });
      }
    } catch {
      throw dependencyUnavailable(
        "Authentication could not be verified. Retry shortly.",
      );
    }
    if (parsed.size === 0) {
      throw dependencyUnavailable(
        "Authentication could not be verified. Retry shortly.",
      );
    }
    this.keys = parsed;
    this.keysExpireAt = Date.now() + JWKS_TTL_MS;
  }

  private identity(
    claims: JwtPayload | Record<string, unknown>,
  ): VerifiedIdentity {
    const subject = claims.sub;
    const issuer = claims.iss;
    const audience = claims.aud;
    const role = claims.role;
    const sessionId = claims.session_id;
    const expiresAt = claims.exp;
    const notBefore = claims.nbf;
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof subject !== "string" ||
      !UUID_PATTERN.test(subject) ||
      typeof issuer !== "string" ||
      !constantTimeEqual(issuer, this.config.supabaseIssuer) ||
      audience !== "authenticated" ||
      role !== "authenticated" ||
      typeof sessionId !== "string" ||
      !UUID_PATTERN.test(sessionId) ||
      typeof expiresAt !== "number" ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= now ||
      (notBefore !== undefined &&
        (typeof notBefore !== "number" ||
          !Number.isSafeInteger(notBefore) ||
          notBefore > now))
    ) {
      throw unauthenticated();
    }
    return Object.freeze({
      userId: subject,
      issuer,
      expiresAt,
      sessionId,
    });
  }
}
