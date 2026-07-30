import {
  Body,
  Controller,
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
  idempotencyKey,
  requestCorrelationId,
  resourceId,
} from "../http/request-contract";
import type { OrganizationGateway } from "../organizations/organization-gateway.port";
import type { DomainRateLimiter } from "../rate-limits/domain-rate-limiter";
import {
  StimulusCreateDto,
  StimulusResponseDto,
  StimulusVersionAppendDto,
  StimulusVersionResponseDto,
} from "./stimulus.dto";

@ApiTags("stimuli")
@ApiBearerAuth("supabase")
@UseGuards(SupabaseAuthGuard)
@Controller({ version: "2" })
export class StimuliController {
  constructor(
    @Inject(ORGANIZATION_GATEWAY)
    private readonly gateway: OrganizationGateway,
    @Inject(DOMAIN_RATE_LIMITER)
    private readonly rateLimiter: DomainRateLimiter,
  ) {}

  @Post("projects/:project_id/stimuli")
  @HttpCode(201)
  @ApiOperation({ operationId: "createStimulus" })
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    schema: { type: "string", minLength: 16, maxLength: 128 },
  })
  @ApiCreatedResponse({ type: StimulusResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async create(
    @Param("project_id") rawProjectId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: StimulusCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StimulusResponseDto> {
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
        scope: "POST:/api/v2/projects/{project_id}/stimuli",
        resourceId: projectId,
      },
    );
    const correlationId = requestCorrelationId(request);
    let command;
    try {
      command = await this.gateway.createStimulus(
        identity,
        projectId,
        body.name,
        body.content,
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
          "stimulus.create_denied",
          "stimulus",
          null,
          correlationId,
        );
      }
      throw error;
    }
    await acceptAdmissions(this.rateLimiter, [admission]);
    response.setHeader("Idempotent-Replayed", String(command.replayed));
    return command.value;
  }

  @Post("stimuli/:stimulus_id/versions")
  @HttpCode(201)
  @ApiOperation({ operationId: "appendStimulusVersion" })
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    schema: { type: "string", minLength: 16, maxLength: 128 },
  })
  @ApiCreatedResponse({ type: StimulusVersionResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async appendVersion(
    @Param("stimulus_id") rawStimulusId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: StimulusVersionAppendDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StimulusVersionResponseDto> {
    const stimulusId = resourceId(rawStimulusId, "stimulus_id");
    const organizationId = await this.gateway.organizationForStimulus(
      identity,
      stimulusId,
    );
    const key = idempotencyKey(request);
    const admission = await this.rateLimiter.requireOrganizationMutation(
      identity.userId,
      organizationId,
      {
        key,
        scope: "POST:/api/v2/stimuli/{stimulus_id}/versions",
        resourceId: stimulusId,
      },
    );
    const correlationId = requestCorrelationId(request);
    let command;
    try {
      command = await this.gateway.appendStimulusVersion(
        identity,
        stimulusId,
        body.content,
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
          "stimulus.version_append_denied",
          "stimulus_version",
          stimulusId,
          correlationId,
        );
      }
      throw error;
    }
    await acceptAdmissions(this.rateLimiter, [admission]);
    response.setHeader("Idempotent-Replayed", String(command.replayed));
    return command.value;
  }
}
