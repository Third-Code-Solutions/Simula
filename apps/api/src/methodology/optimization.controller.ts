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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
  DOMAIN_RATE_LIMITER,
  METHODOLOGY_ENGINE,
  ORGANIZATION_GATEWAY,
} from "../domain/domain.constants";
import { AppProblem } from "../domain/problem";
import {
  ApiAuthenticatedDomainProblems,
  ApiGoneProblem,
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
import type { MethodologyEngine } from "./methodology-engine";
import { ProductCommandResponseDto } from "./methodology.dto";
import {
  ProductCollectionResponseDto,
  ReportExportCreateDto,
  RunMethodologyReportCreateDto,
  VariantGroupCreateDto,
} from "./optimization.dto";

const IDEMPOTENCY_HEADER = {
  name: "Idempotency-Key",
  required: true,
  schema: { type: "string", minLength: 16, maxLength: 128 },
} as const;

@ApiTags("optimization")
@ApiBearerAuth("supabase")
@UseGuards(SupabaseAuthGuard)
@Controller({ version: "2" })
export class OptimizationController {
  constructor(
    @Inject(ORGANIZATION_GATEWAY)
    private readonly gateway: OrganizationGateway,
    @Inject(DOMAIN_RATE_LIMITER)
    private readonly rateLimiter: DomainRateLimiter,
    @Inject(METHODOLOGY_ENGINE)
    private readonly engine: MethodologyEngine,
  ) {}

  @Post("projects/:project_id/variant-groups")
  @HttpCode(201)
  @ApiOperation({ operationId: "createVariantGroup" })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiCreatedResponse({ type: ProductCommandResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async createVariantGroup(
    @Param("project_id") rawProjectId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: VariantGroupCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProductCommandResponseDto> {
    const projectId = resourceId(rawProjectId, "project_id");
    const organizationId = await this.gateway.organizationForProject(
      identity,
      projectId,
    );
    const key = idempotencyKey(request);
    const admission = await this.rateLimiter.requireOrganizationMutation(
      identity.userId,
      organizationId,
      {
        key,
        scope: "POST:/api/v2/projects/{project_id}/variant-groups",
        resourceId: projectId,
      },
    );
    try {
      const command = await this.gateway.createVariantGroup(
        identity,
        projectId,
        body,
        key,
        canonicalRequestSha256({ project_id: projectId, ...body }),
        requestCorrelationId(request),
      );
      await acceptAdmissions(this.rateLimiter, [admission]);
      response.setHeader("Idempotent-Replayed", String(command.replayed));
      if (command.replayed) {
        response.status(200);
      }
      return { data: { ...command.value } };
    } catch (error) {
      await rejectAdmissions(this.rateLimiter, [admission]);
      throw error;
    }
  }

  @Get("projects/:project_id/variant-groups")
  @ApiOperation({ operationId: "listVariantGroups" })
  @ApiOkResponse({ type: ProductCollectionResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async listVariantGroups(
    @Param("project_id") rawProjectId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<ProductCollectionResponseDto> {
    await this.rateLimiter.requireGeneral(identity.userId);
    return {
      items: (
        await this.gateway.listVariantGroups(
          identity,
          resourceId(rawProjectId, "project_id"),
        )
      ).map((item) => ({ ...item })),
    };
  }

  @Get("variant-groups/:variant_group_id/comparison")
  @ApiOperation({ operationId: "compareVariantReports" })
  @ApiOkResponse({ type: ProductCollectionResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async compareVariantReports(
    @Param("variant_group_id") rawVariantGroupId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<ProductCollectionResponseDto> {
    await this.rateLimiter.requireGeneral(identity.userId);
    const command = await this.gateway.getVariantComparisonCommand(
      identity,
      resourceId(rawVariantGroupId, "variant_group_id"),
    );
    return { items: await this.engine.compare(command) };
  }

  @Post("runs/:run_id/methodology-reports")
  @HttpCode(409)
  @ApiOperation({
    operationId: "createRunMethodologyReport",
    deprecated: true,
    description:
      "Unavailable until runs record the exact immutable configuration executed by the methodology engine.",
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiConflictResponse({
    description: "Immutable run configuration binding is unavailable.",
  })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async createRunMethodologyReport(
    @Param("run_id") rawRunId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: RunMethodologyReportCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProductCommandResponseDto> {
    void rawRunId;
    void identity;
    void body;
    void request;
    void response;
    throw new AppProblem(
      409,
      "version_conflict",
      "Bound methodology report unavailable",
      "This run does not contain an immutable simulation-configuration binding, so a methodology report cannot be generated safely.",
    );
  }

  @Get("runs/:run_id/report")
  @HttpCode(410)
  @ApiOperation({
    operationId: "getRunReport",
    deprecated: true,
    description: "Legacy report artifacts are quarantined and unavailable.",
  })
  @ApiGoneProblem("Legacy report artifact is quarantined.")
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async getRunReport(
    @Param("run_id") rawRunId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<ProductCommandResponseDto> {
    void rawRunId;
    void identity;
    throw new AppProblem(
      410,
      "unsupported_scope",
      "Legacy report artifacts are quarantined",
      "Reports created before canonical run-to-configuration binding are unavailable.",
    );
  }

  @Post("reports/:report_id/exports")
  @HttpCode(410)
  @ApiOperation({
    operationId: "createReportExport",
    deprecated: true,
    description: "Exports of quarantined report artifacts are unavailable.",
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiGoneProblem("Legacy report artifact is quarantined.")
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async createReportExport(
    @Param("report_id") rawReportId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: ReportExportCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProductCommandResponseDto> {
    void rawReportId;
    void identity;
    void body;
    void request;
    void response;
    throw new AppProblem(
      410,
      "unsupported_scope",
      "Legacy report exports are unavailable",
      "Quarantined report artifacts cannot be exported.",
    );
  }

  @Get("exports/:export_id")
  @HttpCode(410)
  @ApiOperation({
    operationId: "downloadReportExport",
    deprecated: true,
    description: "Downloads of quarantined report artifacts are unavailable.",
  })
  @ApiGoneProblem("Legacy report export is quarantined.")
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async downloadReportExport(
    @Param("export_id") rawExportId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Res() response: Response,
  ): Promise<void> {
    void rawExportId;
    void identity;
    void response;
    throw new AppProblem(
      410,
      "unsupported_scope",
      "Legacy report exports are unavailable",
      "Quarantined report exports cannot be downloaded.",
    );
  }
}
