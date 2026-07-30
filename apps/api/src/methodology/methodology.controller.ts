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
  ApiTags,
} from "@nestjs/swagger";
import { createHash } from "node:crypto";
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
  AudienceCollectionResponseDto,
  AudienceCommandResponseDto,
  AudienceCreateDto,
} from "../audiences/audience.dto";
import type { MethodologyEngine } from "./methodology-engine";
import {
  MethodologyPreviewCreateDto,
  MethodologyRegistryResponseDto,
  ProductCommandResponseDto,
  SimulationConfigurationCollectionResponseDto,
  SimulationConfigurationCreateDto,
  SimulationConfigurationResponseDto,
} from "./methodology.dto";

const URL_NAMESPACE = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");

export function uuid5Url(value: string): string {
  const digest = createHash("sha1")
    .update(URL_NAMESPACE)
    .update(value, "utf8")
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

const IDEMPOTENCY_HEADER = {
  name: "Idempotency-Key",
  required: true,
  schema: { type: "string", minLength: 16, maxLength: 128 },
} as const;

@ApiTags("methodology")
@ApiBearerAuth("supabase")
@UseGuards(SupabaseAuthGuard)
@Controller({ version: "2" })
export class MethodologyController {
  constructor(
    @Inject(ORGANIZATION_GATEWAY)
    private readonly gateway: OrganizationGateway,
    @Inject(DOMAIN_RATE_LIMITER)
    private readonly rateLimiter: DomainRateLimiter,
    @Inject(METHODOLOGY_ENGINE)
    private readonly engine: MethodologyEngine,
  ) {}

  @Get("methodology/registry")
  @ApiOperation({ operationId: "getMethodologyRegistry" })
  @ApiOkResponse({ type: MethodologyRegistryResponseDto })
  @ApiAuthenticatedDomainProblems()
  getRegistry(
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<MethodologyRegistryResponseDto> {
    return this.gateway.getMethodologyRegistry(identity);
  }

  @Post("organizations/:organization_id/audiences")
  @HttpCode(201)
  @ApiOperation({ operationId: "createAudienceDefinition" })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiCreatedResponse({ type: AudienceCommandResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async createAudience(
    @Param("organization_id") rawOrganizationId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: AudienceCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AudienceCommandResponseDto> {
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
        scope: "POST:/api/v2/organizations/{organization_id}/audiences",
      },
    );
    try {
      const command = await this.gateway.createAudienceDefinition(
        identity,
        organizationId,
        body,
        key,
        canonicalRequestSha256(body),
        requestCorrelationId(request),
      );
      await acceptAdmissions(this.rateLimiter, [admission]);
      response.setHeader("Idempotent-Replayed", String(command.replayed));
      if (command.replayed) {
        response.status(200);
      }
      return command.value;
    } catch (error) {
      await rejectAdmissions(this.rateLimiter, [admission]);
      throw error;
    }
  }

  @Get("organizations/:organization_id/audiences")
  @ApiOperation({ operationId: "listAudienceDefinitions" })
  @ApiOkResponse({ type: AudienceCollectionResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async listAudiences(
    @Param("organization_id") rawOrganizationId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<AudienceCollectionResponseDto> {
    const organizationId = resourceId(rawOrganizationId, "organization_id");
    return {
      items: await this.gateway.listAudienceDefinitions(
        identity,
        organizationId,
      ),
    };
  }

  @Post("projects/:project_id/simulation-configurations")
  @HttpCode(201)
  @ApiOperation({ operationId: "createSimulationConfiguration" })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiCreatedResponse({ type: SimulationConfigurationResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async createConfiguration(
    @Param("project_id") rawProjectId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: SimulationConfigurationCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SimulationConfigurationResponseDto> {
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
        scope: "POST:/api/v2/projects/{project_id}/simulation-configurations",
        resourceId: projectId,
      },
    );
    try {
      const command = await this.gateway.createSimulationConfiguration(
        identity,
        projectId,
        body,
        key,
        canonicalRequestSha256(body),
        requestCorrelationId(request),
      );
      await acceptAdmissions(this.rateLimiter, [admission]);
      response.setHeader("Idempotent-Replayed", String(command.replayed));
      if (command.replayed) {
        response.status(200);
      }
      return command.value;
    } catch (error) {
      await rejectAdmissions(this.rateLimiter, [admission]);
      throw error;
    }
  }

  @Get("projects/:project_id/simulation-configurations")
  @ApiOperation({ operationId: "listSimulationConfigurations" })
  @ApiOkResponse({ type: SimulationConfigurationCollectionResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async listConfigurations(
    @Param("project_id") rawProjectId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<SimulationConfigurationCollectionResponseDto> {
    return {
      items: await this.gateway.listSimulationConfigurations(
        identity,
        resourceId(rawProjectId, "project_id"),
      ),
    };
  }

  @Post("projects/:project_id/methodology-previews")
  @ApiOperation({ operationId: "createMethodologyPreview" })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOkResponse({ type: ProductCommandResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async createPreview(
    @Param("project_id") rawProjectId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: MethodologyPreviewCreateDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProductCommandResponseDto> {
    const projectId = resourceId(rawProjectId, "project_id");
    const organizationId = await this.gateway.organizationForProject(
      identity,
      projectId,
    );
    const key = idempotencyKey(request);
    await this.rateLimiter.requireOrganizationMutation(
      identity.userId,
      organizationId,
    );
    const runId =
      body.run_id ??
      uuid5Url(
        `simula:${identity.userId}:${projectId}:${body.configuration_version_id}:` +
          `${body.stimulus_version_id}:${key}`,
      );
    const command = await this.gateway.getMethodologyPreviewCommand(
      identity,
      projectId,
      body,
      runId,
      uuid5Url(`simula-report:${runId}`),
    );
    return { data: await this.engine.execute(command) };
  }
}
