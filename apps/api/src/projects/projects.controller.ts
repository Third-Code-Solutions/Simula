import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
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
  ORGANIZATION_GATEWAY,
} from "../domain/domain.constants";
import { AppProblem } from "../domain/problem";
import {
  ApiAuthenticatedDomainProblems,
  ApiValidationProblem,
} from "../domain/problem.dto";
import {
  acceptAdmissions,
  recordPrivilegedDenial,
  rejectAdmissions,
} from "../http/command-coordination";
import {
  canonicalRequestSha256,
  expectedVersion,
  idempotencyKey,
  requestCorrelationId,
  resourceId,
} from "../http/request-contract";
import { CursorCodec } from "../organizations/cursor-codec";
import type { OrganizationGateway } from "../organizations/organization-gateway.port";
import type { DomainRateLimiter } from "../rate-limits/domain-rate-limiter";
import {
  ProjectCreateDto,
  ProjectDetailDto,
  ProjectPageDto,
  ProjectPageQueryDto,
  ProjectPatchDto,
  ProjectResponseDto,
} from "./project.dto";

@ApiTags("projects")
@ApiBearerAuth("supabase")
@UseGuards(SupabaseAuthGuard)
@Controller({ version: "2" })
export class ProjectsController {
  constructor(
    @Inject(ORGANIZATION_GATEWAY)
    private readonly gateway: OrganizationGateway,
    @Inject(DOMAIN_RATE_LIMITER)
    private readonly rateLimiter: DomainRateLimiter,
    private readonly cursors: CursorCodec,
  ) {}

  @Post("organizations/:organization_id/projects")
  @HttpCode(201)
  @ApiOperation({ operationId: "createProject" })
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    schema: { type: "string", minLength: 16, maxLength: 128 },
  })
  @ApiCreatedResponse({ type: ProjectResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async create(
    @Param("organization_id") rawOrganizationId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: ProjectCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProjectResponseDto> {
    const organizationId = await this.gateway.visibleOrganization(
      identity,
      resourceId(rawOrganizationId, "organization_id"),
    );
    const key = idempotencyKey(request);
    const admission = await this.rateLimiter.requireOrganizationMutation(
      identity.userId,
      organizationId,
      {
        key,
        scope: "POST:/api/v2/organizations/{organization_id}/projects",
      },
    );
    const correlationId = requestCorrelationId(request);
    let command;
    try {
      command = await this.gateway.createProject(
        identity,
        organizationId,
        body,
        key,
        canonicalRequestSha256(body),
        correlationId,
      );
    } catch (error) {
      await rejectAdmissions(this.rateLimiter, [admission]);
      if (error instanceof AppProblem && error.code === "forbidden") {
        await recordPrivilegedDenial(
          this.gateway,
          identity,
          organizationId,
          "project.create_denied",
          "project",
          null,
          correlationId,
        );
      }
      throw error;
    }
    await acceptAdmissions(this.rateLimiter, [admission]);
    response.setHeader("Idempotent-Replayed", String(command.replayed));
    response.setHeader("ETag", `"${command.value.version}"`);
    return command.value;
  }

  @Get("organizations/:organization_id/projects")
  @ApiOperation({ operationId: "listProjects" })
  @ApiOkResponse({ type: ProjectPageDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async list(
    @Param("organization_id") rawOrganizationId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query() query: ProjectPageQueryDto,
  ): Promise<ProjectPageDto> {
    const organizationId = resourceId(rawOrganizationId, "organization_id");
    const scope = `projects:${organizationId}`;
    const after = this.cursors.decode(query.cursor, scope);
    const records = await this.gateway.listProjects(
      identity,
      organizationId,
      after,
      query.page_size + 1,
    );
    const visible = records.slice(0, query.page_size);
    const last = visible.at(-1);
    return {
      items: visible,
      next_cursor:
        records.length > query.page_size && last !== undefined
          ? this.cursors.encode(scope, {
              createdAt: last.created_at,
              resourceId: last.id,
            })
          : null,
    };
  }

  @Get("projects/:project_id")
  @ApiOperation({ operationId: "getProject" })
  @ApiOkResponse({ type: ProjectDetailDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async get(
    @Param("project_id") rawProjectId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProjectDetailDto> {
    const project = await this.gateway.getProject(
      identity,
      resourceId(rawProjectId, "project_id"),
    );
    response.setHeader("ETag", `"${project.version}"`);
    return project;
  }

  @Patch("projects/:project_id")
  @ApiOperation({ operationId: "updateProject" })
  @ApiHeader({
    name: "If-Match",
    required: true,
    schema: { type: "string", pattern: '^"[1-9][0-9]*"$' },
  })
  @ApiOkResponse({ type: ProjectResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async update(
    @Param("project_id") rawProjectId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: ProjectPatchDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProjectResponseDto> {
    if (Object.keys(body).length === 0) {
      throw new AppProblem(
        422,
        "validation_error",
        "Request validation failed",
        "At least one project field is required.",
        [{ field: "request", code: "required" }],
      );
    }
    const projectId = resourceId(rawProjectId, "project_id");
    const organizationId = await this.gateway.organizationForProject(
      identity,
      projectId,
    );
    await this.rateLimiter.requireOrganizationMutation(
      identity.userId,
      organizationId,
    );
    const correlationId = requestCorrelationId(request);
    let project;
    try {
      project = await this.gateway.updateProject(
        identity,
        projectId,
        expectedVersion(request),
        body,
        correlationId,
      );
    } catch (error) {
      if (error instanceof AppProblem && error.code === "forbidden") {
        await recordPrivilegedDenial(
          this.gateway,
          identity,
          organizationId,
          "project.update_denied",
          "project",
          projectId,
          correlationId,
        );
      }
      throw error;
    }
    response.setHeader("ETag", `"${project.version}"`);
    return project;
  }
}
