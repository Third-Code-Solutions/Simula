import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";

import { CurrentIdentity } from "../auth/current-identity.decorator";
import type { VerifiedIdentity } from "../auth/identity";
import {
  type AuthenticatedRequest,
  SupabaseAuthGuard,
} from "../auth/supabase-auth.guard";
import {
  CAMPAIGN_EVIDENCE_SERVICE,
  DOMAIN_RATE_LIMITER,
  ORGANIZATION_GATEWAY,
} from "../domain/domain.constants";
import {
  ApiAuthenticatedDomainProblems,
  ApiValidationProblem,
} from "../domain/problem.dto";
import {
  acceptAdmissions,
  rejectAdmissions,
} from "../http/command-coordination";
import {
  canonicalRequestSha256,
  idempotencyKey,
  requestCorrelationId,
  resourceId,
} from "../http/request-contract";
import type { OrganizationGateway } from "../organizations/organization-gateway.port";
import type { DomainRateLimiter } from "../rate-limits/domain-rate-limiter";
import {
  CampaignEvidenceEventCollectionDto,
  CampaignEvidenceRunResponseDto,
  HistoricalBacktestCreateDto,
  SurveyCalibrationCreateDto,
} from "./campaign-evidence.dto";
import type { CampaignEvidenceServicePort } from "./campaign-evidence.service";

const IDEMPOTENCY_HEADER = {
  name: "Idempotency-Key",
  required: true,
  schema: { type: "string", minLength: 16, maxLength: 128 },
} as const;

@ApiTags("campaign-evidence")
@ApiBearerAuth("supabase")
@UseGuards(SupabaseAuthGuard)
@Controller({ version: "2" })
export class CampaignEvidenceController {
  constructor(
    @Inject(CAMPAIGN_EVIDENCE_SERVICE)
    private readonly evidence: CampaignEvidenceServicePort,
    @Inject(ORGANIZATION_GATEWAY)
    private readonly organizations: OrganizationGateway,
    @Inject(DOMAIN_RATE_LIMITER)
    private readonly rateLimiter: DomainRateLimiter,
  ) {}

  @Post("projects/:project_id/campaign-evidence/survey-calibrations")
  @HttpCode(202)
  @ApiOperation({
    operationId: "createSurveyCalibration",
    description:
      "Queue a deterministic comparison between weighted synthetic aggregate observations and an admitted consented survey dataset.",
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiAcceptedResponse({ type: CampaignEvidenceRunResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async createSurveyCalibration(
    @Param("project_id") rawProjectId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: SurveyCalibrationCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CampaignEvidenceRunResponseDto> {
    return this.create(
      resourceId(rawProjectId, "project_id"),
      identity,
      "survey_calibration",
      body,
      request,
      response,
    );
  }

  @Post("projects/:project_id/campaign-evidence/backtests")
  @HttpCode(202)
  @ApiOperation({
    operationId: "createHistoricalBacktest",
    description:
      "Queue a blind historical replay. Held-out outcomes are stored in a worker-only secret row and are never returned by reads.",
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiAcceptedResponse({ type: CampaignEvidenceRunResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async createHistoricalBacktest(
    @Param("project_id") rawProjectId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: HistoricalBacktestCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CampaignEvidenceRunResponseDto> {
    return this.create(
      resourceId(rawProjectId, "project_id"),
      identity,
      "historical_backtest",
      body,
      request,
      response,
    );
  }

  @Get("campaign-evidence/:evidence_id")
  @ApiOperation({ operationId: "getCampaignEvidenceRun" })
  @ApiOkResponse({ type: CampaignEvidenceRunResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  get(
    @Param("evidence_id") rawEvidenceId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<CampaignEvidenceRunResponseDto> {
    return this.evidence.get(
      identity,
      resourceId(rawEvidenceId, "evidence_id"),
    );
  }

  @Get("campaign-evidence/:evidence_id/events")
  @ApiOperation({ operationId: "getCampaignEvidenceEvents" })
  @ApiOkResponse({ type: CampaignEvidenceEventCollectionDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  events(
    @Param("evidence_id") rawEvidenceId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<CampaignEvidenceEventCollectionDto> {
    return this.evidence.events(
      identity,
      resourceId(rawEvidenceId, "evidence_id"),
    );
  }

  @Post("campaign-evidence/:evidence_id/cancel")
  @HttpCode(202)
  @ApiOperation({ operationId: "cancelCampaignEvidenceRun" })
  @ApiAcceptedResponse({ type: CampaignEvidenceRunResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async cancel(
    @Param("evidence_id") rawEvidenceId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Req() request: AuthenticatedRequest,
  ): Promise<CampaignEvidenceRunResponseDto> {
    const evidenceId = resourceId(rawEvidenceId, "evidence_id");
    const current = await this.evidence.get(identity, evidenceId);
    await this.rateLimiter.requireOrganizationMutation(
      identity.userId,
      current.organization_id,
    );
    return this.evidence.cancel(
      identity,
      evidenceId,
      requestCorrelationId(request),
    );
  }

  private async create(
    projectId: string,
    identity: VerifiedIdentity,
    kind: "survey_calibration" | "historical_backtest",
    body: SurveyCalibrationCreateDto | HistoricalBacktestCreateDto,
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<CampaignEvidenceRunResponseDto> {
    const organizationId = await this.organizations.organizationForProject(
      identity,
      projectId,
    );
    const key = idempotencyKey(request);
    const admission = await this.rateLimiter.requireOrganizationMutation(
      identity.userId,
      organizationId,
      {
        key,
        scope:
          kind === "survey_calibration"
            ? "POST:/api/v2/projects/{project_id}/campaign-evidence/survey-calibrations"
            : "POST:/api/v2/projects/{project_id}/campaign-evidence/backtests",
        resourceId: projectId,
      },
    );
    try {
      const result = await this.evidence.create(
        identity,
        organizationId,
        projectId,
        kind,
        body,
        key,
        canonicalRequestSha256(body),
        requestCorrelationId(request),
      );
      await acceptAdmissions(this.rateLimiter, [admission]);
      response.setHeader("Idempotent-Replayed", String(result.replayed));
      return result;
    } catch (error) {
      await rejectAdmissions(this.rateLimiter, [admission]);
      throw error;
    }
  }
}
