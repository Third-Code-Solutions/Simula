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
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
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
import { uuid5Url } from "./methodology.controller";
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

function record(
  value: unknown,
  name: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid ${name}`);
  }
  return value as Readonly<Record<string, unknown>>;
}

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
  @HttpCode(201)
  @ApiOperation({ operationId: "createRunMethodologyReport" })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiCreatedResponse({ type: ProductCommandResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async createRunMethodologyReport(
    @Param("run_id") rawRunId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: RunMethodologyReportCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProductCommandResponseDto> {
    const runId = resourceId(rawRunId, "run_id");
    const run = await this.gateway.getSimulationRun(identity, runId);
    if (run.state !== "succeeded") {
      throw new AppProblem(
        409,
        "version_conflict",
        "Completed run unavailable",
        "A succeeded run is required before generating its methodology report.",
      );
    }
    const key = idempotencyKey(request);
    const admission = await this.rateLimiter.requireOrganizationMutation(
      identity.userId,
      run.organization_id,
      {
        key,
        scope: "POST:/api/v2/runs/{run_id}/methodology-reports",
        resourceId: runId,
      },
    );
    try {
      const previewCommand = await this.gateway.getMethodologyPreviewCommand(
        identity,
        run.project_id,
        {
          ...body,
          stimulus_version_id: run.stimulus_version_id,
          run_id: runId,
        },
        runId,
        uuid5Url(`simula-report:${runId}`),
      );
      const preview = await this.engine.execute(previewCommand);
      const report = record(preview.report, "methodology report");
      const command = await this.gateway.createReportArtifact(
        identity,
        runId,
        report,
        key,
        canonicalRequestSha256({ run_id: runId, ...body }),
        requestCorrelationId(request),
      );
      await acceptAdmissions(this.rateLimiter, [admission]);
      response.setHeader("Idempotent-Replayed", String(command.replayed));
      if (command.replayed) {
        response.status(200);
      }
      return { data: { ...command.value, artifact: report } };
    } catch (error) {
      await rejectAdmissions(this.rateLimiter, [admission]);
      throw error;
    }
  }

  @Get("runs/:run_id/report")
  @ApiOperation({ operationId: "getRunReport" })
  @ApiOkResponse({ type: ProductCommandResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async getRunReport(
    @Param("run_id") rawRunId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<ProductCommandResponseDto> {
    const runId = resourceId(rawRunId, "run_id");
    await this.rateLimiter.requireRunRead(identity.userId, runId);
    return { data: { ...(await this.gateway.getRunReport(identity, runId)) } };
  }

  @Post("reports/:report_id/exports")
  @HttpCode(201)
  @ApiOperation({ operationId: "createReportExport" })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiCreatedResponse({ type: ProductCommandResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async createReportExport(
    @Param("report_id") rawReportId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: ReportExportCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProductCommandResponseDto> {
    const reportId = resourceId(rawReportId, "report_id");
    const report = await this.gateway.getStoredReportArtifact(
      identity,
      reportId,
    );
    const key = idempotencyKey(request);
    const admission = await this.rateLimiter.requireOrganizationMutation(
      identity.userId,
      report.organization_id,
      {
        key,
        scope: "POST:/api/v2/reports/{report_id}/exports",
        resourceId: reportId,
      },
    );
    try {
      const rendered = await this.engine.renderExport({
        report: report.artifact,
        format: body.format,
      });
      const command = await this.gateway.createReportExport(
        identity,
        reportId,
        body,
        rendered,
        key,
        canonicalRequestSha256({ report_id: reportId, ...body }),
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

  @Get("exports/:export_id")
  @ApiOperation({ operationId: "downloadReportExport" })
  @ApiProduces("application/json", "text/csv")
  @ApiOkResponse({
    description: "Unexpired report export.",
    schema: { type: "string", format: "binary" },
  })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async downloadReportExport(
    @Param("export_id") rawExportId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Res() response: Response,
  ): Promise<void> {
    await this.rateLimiter.requireGeneral(identity.userId);
    const stored = await this.gateway.getReportExport(
      identity,
      resourceId(rawExportId, "export_id"),
    );
    response.setHeader(
      "Content-Type",
      stored.format === "json" ? "application/json" : "text/csv; charset=utf-8",
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${stored.filename}"`,
    );
    response.setHeader("Content-Length", String(stored.content.length));
    response.setHeader("ETag", `"${stored.content_sha256}"`);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.status(200).send(stored.content);
  }
}
