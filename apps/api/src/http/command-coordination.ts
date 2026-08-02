import { Logger } from "@nestjs/common";

import { AppProblem } from "../domain/problem";
import type { OrganizationGateway } from "../organizations/organization-gateway.port";
import type {
  DomainRateLimiter,
  RateAdmission,
} from "../rate-limits/domain-rate-limiter";
import type { VerifiedIdentity } from "../auth/identity";

const logger = new Logger("DomainCommandCoordination");

export async function acceptAdmissions(
  rateLimiter: DomainRateLimiter,
  admissions: readonly (RateAdmission | null)[],
): Promise<void> {
  const present = admissions.filter(
    (admission): admission is RateAdmission => admission !== null,
  );
  if (present.length === 0) {
    return;
  }
  try {
    await rateLimiter.acceptIdempotency(...present);
  } catch (error) {
    logger.warn({
      event: "rate_marker_acceptance_deferred",
      admissions_count: present.length,
      error_code: error instanceof AppProblem ? error.code : "internal_error",
    });
  }
}

export async function rejectAdmissions(
  rateLimiter: DomainRateLimiter,
  admissions: readonly (RateAdmission | null)[],
): Promise<void> {
  const present = admissions.filter(
    (admission): admission is RateAdmission => admission !== null,
  );
  if (present.length === 0) {
    return;
  }
  try {
    await rateLimiter.rejectIdempotency(...present);
  } catch (error) {
    logger.warn({
      event: "rate_marker_rejection_deferred",
      admissions_count: present.length,
      error_code: error instanceof AppProblem ? error.code : "internal_error",
    });
  }
}

export async function recordPrivilegedDenial(
  gateway: Pick<OrganizationGateway, "recordPrivilegedDenial">,
  identity: VerifiedIdentity,
  organizationId: string,
  action: string,
  objectType: string,
  objectId: string | null,
  correlationId: string,
): Promise<void> {
  try {
    await gateway.recordPrivilegedDenial(
      identity,
      organizationId,
      action,
      objectType,
      objectId,
      correlationId,
    );
  } catch (error) {
    logger.error({
      event: "audit_evidence_incomplete",
      action,
      correlation_id: correlationId,
      error_code: error instanceof AppProblem ? error.code : "internal_error",
    });
  }
}
