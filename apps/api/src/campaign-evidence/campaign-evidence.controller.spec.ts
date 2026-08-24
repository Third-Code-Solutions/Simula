import type { Response } from "express";

import type { VerifiedIdentity } from "../auth/identity";
import type { AuthenticatedRequest } from "../auth/supabase-auth.guard";
import { AppProblem } from "../domain/problem";
import type { OrganizationGateway } from "../organizations/organization-gateway.port";
import type {
  DomainRateLimiter,
  RateAdmission,
} from "../rate-limits/domain-rate-limiter";
import { CampaignEvidenceController } from "./campaign-evidence.controller";
import type {
  HistoricalBacktestCreateDto,
  SurveyCalibrationCreateDto,
} from "./campaign-evidence.dto";
import type { CampaignEvidenceServicePort } from "./campaign-evidence.service";

const IDENTITY: VerifiedIdentity = {
  userId: "66000000-0000-4000-8000-000000000001",
  issuer: "https://auth.simula.invalid",
  expiresAt: 4_102_444_800,
  sessionId: "66000000-0000-4000-8000-000000000002",
};
const ORGANIZATION_ID = "66000000-0000-4000-8000-000000000003";
const PROJECT_ID = "66000000-0000-4000-8000-000000000004";
const CORRELATION_ID = "66000000-0000-4000-8000-000000000005";
const IDEMPOTENCY_KEY = "campaign-evidence-controller-0001";
const ADMISSION: RateAdmission = {
  markerKey: "simula:s2:organization_mutation:test",
  ownerToken: "a".repeat(32),
  acceptedReplay: false,
};

function request(): AuthenticatedRequest {
  return {
    rawHeaders: ["Idempotency-Key", IDEMPOTENCY_KEY],
    simulaCorrelationId: CORRELATION_ID,
  } as AuthenticatedRequest;
}

function harness() {
  const conflict = new AppProblem(
    409,
    "version_conflict",
    "Campaign evidence creation is unavailable",
    "Immutable evidence binding is unavailable.",
  );
  const evidence = {
    create: jest.fn().mockRejectedValue(conflict),
  } as unknown as jest.Mocked<CampaignEvidenceServicePort>;
  const organizations = {
    organizationForProject: jest.fn().mockResolvedValue(ORGANIZATION_ID),
  } as unknown as jest.Mocked<OrganizationGateway>;
  const rateLimiter = {
    requireOrganizationMutation: jest.fn().mockResolvedValue(ADMISSION),
    acceptIdempotency: jest.fn().mockResolvedValue(undefined),
    rejectIdempotency: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<DomainRateLimiter>;
  const response = {
    setHeader: jest.fn(),
  } as unknown as jest.Mocked<Response>;
  return {
    controller: new CampaignEvidenceController(
      evidence,
      organizations,
      rateLimiter,
    ),
    evidence,
    organizations,
    rateLimiter,
    response,
  };
}

describe("CampaignEvidenceController immutable evidence retirement", () => {
  it.each([
    {
      endpoint: "survey calibration",
      invoke: (controller: CampaignEvidenceController, response: Response) =>
        controller.createSurveyCalibration(
          PROJECT_ID,
          IDENTITY,
          {
            source_version_id: "66000000-0000-4000-8000-000000000006",
            synthetic_observations: [{ variant_key: "control" }],
            survey: { observations: [] },
          } as SurveyCalibrationCreateDto,
          request(),
          response,
        ),
    },
    {
      endpoint: "historical backtest",
      invoke: (controller: CampaignEvidenceController, response: Response) =>
        controller.createHistoricalBacktest(
          PROJECT_ID,
          IDENTITY,
          {
            outcome_set_id: "66000000-0000-4000-8000-000000000007",
            protocol: {},
            prediction_set: {},
            outcomes: { outcomes: [] },
          } as HistoricalBacktestCreateDto,
          request(),
          response,
        ),
    },
  ])(
    "propagates the 409 and rejects the pending marker for $endpoint",
    async ({ invoke }) => {
      const { controller, evidence, organizations, rateLimiter, response } =
        harness();

      await expect(invoke(controller, response)).rejects.toMatchObject({
        code: "version_conflict",
        status: 409,
      });

      expect(organizations.organizationForProject).toHaveBeenCalledWith(
        IDENTITY,
        PROJECT_ID,
      );
      expect(rateLimiter.requireOrganizationMutation).toHaveBeenCalledTimes(1);
      expect(evidence.create).toHaveBeenCalledTimes(1);
      expect(rateLimiter.rejectIdempotency).toHaveBeenCalledWith(ADMISSION);
      expect(rateLimiter.acceptIdempotency).not.toHaveBeenCalled();
      expect(response.setHeader).not.toHaveBeenCalled();
    },
  );

  it("does not reach evidence creation when rate-limit admission fails", async () => {
    const { controller, evidence, rateLimiter, response } = harness();
    rateLimiter.requireOrganizationMutation.mockRejectedValueOnce(
      new AppProblem(429, "rate_limited", "Rate limit reached", "Retry later."),
    );

    await expect(
      controller.createSurveyCalibration(
        PROJECT_ID,
        IDENTITY,
        {
          source_version_id: "66000000-0000-4000-8000-000000000006",
          synthetic_observations: [{ variant_key: "control" }],
          survey: { observations: [] },
        } as SurveyCalibrationCreateDto,
        request(),
        response,
      ),
    ).rejects.toMatchObject({ code: "rate_limited", status: 429 });

    expect(evidence.create).not.toHaveBeenCalled();
    expect(rateLimiter.acceptIdempotency).not.toHaveBeenCalled();
    expect(rateLimiter.rejectIdempotency).not.toHaveBeenCalled();
    expect(response.setHeader).not.toHaveBeenCalled();
  });
});
