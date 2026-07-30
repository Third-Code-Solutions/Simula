import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

import {
  DOMAIN_IDENTITY_VERIFIER,
  DOMAIN_RATE_LIMITER,
  ORGANIZATION_GATEWAY,
} from "../domain/domain.constants";
import { unauthenticated } from "../domain/problem";
import type { OrganizationGateway } from "../organizations/organization-gateway.port";
import type { DomainRateLimiter } from "../rate-limits/domain-rate-limiter";
import type { IdentityVerifier, VerifiedIdentity } from "./identity";

export interface AuthenticatedRequest extends Request {
  simulaIdentity?: VerifiedIdentity;
  simulaCorrelationId?: string;
  simulaPreAuthRateLimitIpHash?: string;
  simulaSignInAuditRecorded?: boolean;
  simulaTraceparent?: string;
}

function bearerToken(request: Request): string {
  const authorizationHeaders: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index];
    const value = request.rawHeaders[index + 1];
    if (name?.toLowerCase() === "authorization" && value !== undefined) {
      authorizationHeaders.push(value);
    }
  }
  if (authorizationHeaders.length !== 1) {
    throw unauthenticated();
  }
  const match = /^Bearer ([^\s,]{1,8192})$/i.exec(
    authorizationHeaders[0] ?? "",
  );
  if (match?.[1] === undefined) {
    throw unauthenticated();
  }
  return match[1];
}

function correlationId(request: AuthenticatedRequest): string {
  if (
    request.simulaCorrelationId === undefined ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      request.simulaCorrelationId,
    )
  ) {
    throw new Error("correlation middleware did not install a UUID");
  }
  return request.simulaCorrelationId;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    @Inject(DOMAIN_IDENTITY_VERIFIER)
    private readonly verifier: IdentityVerifier,
    @Inject(DOMAIN_RATE_LIMITER)
    private readonly rateLimiter: DomainRateLimiter,
    @Inject(ORGANIZATION_GATEWAY)
    private readonly organizations: Pick<
      OrganizationGateway,
      "recordSignInSuccess"
    >,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const ipHash = request.simulaPreAuthRateLimitIpHash;
    if (ipHash === undefined || !/^[0-9a-f]{64}$/.test(ipHash)) {
      throw new Error("pre-authentication rate limit was not installed");
    }
    const identity = await this.verifier.verify(bearerToken(request));
    await this.rateLimiter.releaseUnauthenticated(ipHash);
    await this.rateLimiter.requireGeneral(identity.userId);
    request.simulaSignInAuditRecorded =
      await this.organizations.recordSignInSuccess(
        identity,
        correlationId(request),
      );
    request.simulaIdentity = identity;
    return true;
  }
}
