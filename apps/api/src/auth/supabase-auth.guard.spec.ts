import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import type { OrganizationGateway } from "../organizations/organization-gateway.port";
import type { DomainRateLimiter } from "../rate-limits/domain-rate-limiter";
import type { IdentityVerifier } from "./identity";
import {
  type AuthenticatedRequest,
  SupabaseAuthGuard,
} from "./supabase-auth.guard";

const IDENTITY = Object.freeze({
  userId: "018f274b-3c77-7b22-b749-c9274230ef9a",
  issuer: "https://project.supabase.co/auth/v1",
  expiresAt: 1_800_000_000,
  sessionId: "018f274b-3c77-7b22-b749-c9274230ef9b",
});
const CORRELATION_ID = "018f274b-3c77-7b22-b749-c9274230ef9c";
const IP_HASH = "a".repeat(64);

function contextFor(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function dependencies() {
  return {
    verify: jest.fn().mockResolvedValue(IDENTITY),
    requireUnauthenticated: jest.fn().mockResolvedValue(undefined),
    releaseUnauthenticated: jest.fn().mockResolvedValue(undefined),
    requireGeneral: jest.fn().mockResolvedValue(undefined),
    recordSignInSuccess: jest.fn().mockResolvedValue(true),
  };
}

function guard(mocks: ReturnType<typeof dependencies>): SupabaseAuthGuard {
  return new SupabaseAuthGuard(
    { verify: mocks.verify } as IdentityVerifier,
    {
      requireUnauthenticated: mocks.requireUnauthenticated,
      releaseUnauthenticated: mocks.releaseUnauthenticated,
      requireGeneral: mocks.requireGeneral,
    } as unknown as DomainRateLimiter,
    {
      recordSignInSuccess: mocks.recordSignInSuccess,
    } as unknown as Pick<OrganizationGateway, "recordSignInSuccess">,
  );
}

function requestWith(rawHeaders: string[]): AuthenticatedRequest {
  return {
    rawHeaders,
    simulaCorrelationId: CORRELATION_ID,
    simulaPreAuthRateLimitIpHash: IP_HASH,
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as AuthenticatedRequest;
}

describe("SupabaseAuthGuard", () => {
  it("promotes a verified request from IP rate limit to user rate limit and audits it", async () => {
    const mocks = dependencies();
    const request = requestWith(["Authorization", "Bearer signed-token"]);

    await expect(guard(mocks).canActivate(contextFor(request))).resolves.toBe(
      true,
    );
    expect(mocks.requireUnauthenticated).not.toHaveBeenCalled();
    expect(mocks.verify).toHaveBeenCalledWith("signed-token");
    expect(mocks.releaseUnauthenticated).toHaveBeenCalledWith(IP_HASH);
    expect(mocks.requireGeneral).toHaveBeenCalledWith(IDENTITY.userId);
    expect(mocks.recordSignInSuccess).toHaveBeenCalledWith(
      IDENTITY,
      CORRELATION_ID,
    );
    expect(request.simulaSignInAuditRecorded).toBe(true);
    expect(request.simulaIdentity).toBe(IDENTITY);
    expect(mocks.verify.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.releaseUnauthenticated.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.requireGeneral.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.recordSignInSuccess.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it.each([
    { rawHeaders: [] },
    { rawHeaders: ["Authorization", "Basic credentials"] },
    {
      rawHeaders: [
        "Authorization",
        "Bearer first",
        "authorization",
        "Bearer second",
      ],
    },
    { rawHeaders: ["Authorization", "Bearer token,second"] },
  ])(
    "charges the IP bucket and rejects malformed authorization %#",
    async ({ rawHeaders }) => {
      const mocks = dependencies();
      await expect(
        guard(mocks).canActivate(contextFor(requestWith(rawHeaders))),
      ).rejects.toMatchObject({ code: "unauthenticated", status: 401 });
      expect(mocks.requireUnauthenticated).not.toHaveBeenCalled();
      expect(mocks.verify).not.toHaveBeenCalled();
      expect(mocks.releaseUnauthenticated).not.toHaveBeenCalled();
      expect(mocks.requireGeneral).not.toHaveBeenCalled();
      expect(mocks.recordSignInSuccess).not.toHaveBeenCalled();
    },
  );

  it("does not refund an unverified bearer attempt", async () => {
    const mocks = dependencies();
    mocks.verify.mockRejectedValueOnce(
      Object.assign(new Error("unauthenticated"), {
        code: "unauthenticated",
        status: 401,
      }),
    );

    await expect(
      guard(mocks).canActivate(
        contextFor(requestWith(["Authorization", "Bearer rejected-token"])),
      ),
    ).rejects.toMatchObject({ code: "unauthenticated", status: 401 });
    expect(mocks.releaseUnauthenticated).not.toHaveBeenCalled();
    expect(mocks.requireGeneral).not.toHaveBeenCalled();
    expect(mocks.recordSignInSuccess).not.toHaveBeenCalled();
  });

  it("fails before identity installation when sign-in audit is unavailable", async () => {
    const mocks = dependencies();
    mocks.recordSignInSuccess.mockRejectedValueOnce(
      Object.assign(new Error("dependency unavailable"), {
        code: "dependency_unavailable",
        status: 503,
      }),
    );
    const request = requestWith(["Authorization", "Bearer signed-token"]);

    await expect(
      guard(mocks).canActivate(contextFor(request)),
    ).rejects.toMatchObject({
      code: "dependency_unavailable",
      status: 503,
    });
    expect(request.simulaIdentity).toBeUndefined();
  });

  it("fails closed if global pre-authentication admission was bypassed", async () => {
    const mocks = dependencies();
    const request = requestWith(["Authorization", "Bearer signed-token"]);
    request.simulaPreAuthRateLimitIpHash = undefined;

    await expect(guard(mocks).canActivate(contextFor(request))).rejects.toThrow(
      "pre-authentication rate limit was not installed",
    );
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
