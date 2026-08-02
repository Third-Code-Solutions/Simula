import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
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
  ASSET_OBJECT_STORE,
  ORGANIZATION_GATEWAY,
} from "../domain/domain.constants";
import { dependencyUnavailable } from "../domain/problem";
import {
  ApiAuthenticatedDomainProblems,
  ApiValidationProblem,
} from "../domain/problem.dto";
import { CursorCodec } from "./cursor-codec";
import type { OrganizationGateway } from "./organization-gateway.port";
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
import type { DomainRateLimiter } from "../rate-limits/domain-rate-limiter";
import { SIMULATION_QUEUE_PORT } from "../queue/queue.constants";
import type { SimulationQueuePort } from "../queue/simulation-queue.port";
import {
  ASSET_BUCKET,
  type AssetObjectStore,
} from "../assets/asset-object-store";
import {
  OrganizationCreateDto,
  OrganizationDashboardResponseDto,
  OrganizationDeleteDto,
  OrganizationDeletionResponseDto,
  OrganizationPageDto,
  OrganizationPageQueryDto,
  OrganizationResponseDto,
} from "./organization.dto";

@ApiTags("organizations")
@ApiBearerAuth("supabase")
@UseGuards(SupabaseAuthGuard)
@Controller({
  path: "organizations",
  version: "2",
})
export class OrganizationsController {
  constructor(
    @Inject(ORGANIZATION_GATEWAY)
    private readonly organizations: OrganizationGateway,
    @Inject(DOMAIN_RATE_LIMITER)
    private readonly rateLimiter: DomainRateLimiter,
    @Inject(ASSET_OBJECT_STORE)
    private readonly objectStore: AssetObjectStore,
    @Inject(SIMULATION_QUEUE_PORT)
    private readonly simulationQueue: SimulationQueuePort,
    private readonly cursors: CursorCodec,
  ) {}

  @Get(":organization_id/dashboard")
  @ApiOperation({ operationId: "getOrganizationDashboard" })
  @ApiOkResponse({ type: OrganizationDashboardResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async dashboard(
    @Param("organization_id") rawOrganizationId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<OrganizationDashboardResponseDto> {
    return this.organizations.getOrganizationDashboard(
      identity,
      resourceId(rawOrganizationId, "organization_id"),
    );
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ operationId: "createOrganization" })
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    schema: { type: "string", minLength: 16, maxLength: 128 },
  })
  @ApiCreatedResponse({ type: OrganizationResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async create(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: OrganizationCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OrganizationResponseDto> {
    const key = idempotencyKey(request);
    const admission = await this.rateLimiter.requireOrganizationCreate(
      identity.userId,
      key,
      "POST:/api/v2/organizations",
    );
    let command;
    try {
      command = await this.organizations.createOrganization(
        identity,
        body.name,
        key,
        canonicalRequestSha256(body),
        requestCorrelationId(request),
      );
    } catch (error) {
      await rejectAdmissions(this.rateLimiter, [admission]);
      throw error;
    }
    await acceptAdmissions(this.rateLimiter, [admission]);
    response.setHeader("Idempotent-Replayed", String(command.replayed));
    return command.value;
  }

  @Post(":organization_id/deletion")
  @HttpCode(200)
  @ApiOperation({ operationId: "deleteOrganization" })
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    schema: { type: "string", minLength: 16, maxLength: 128 },
  })
  @ApiOkResponse({ type: OrganizationDeletionResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async delete(
    @Param("organization_id") rawOrganizationId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: OrganizationDeleteDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OrganizationDeletionResponseDto> {
    const organizationId = resourceId(rawOrganizationId, "organization_id");
    const key = idempotencyKey(request);
    const admission = await this.rateLimiter.requireOrganizationMutation(
      identity.userId,
      organizationId,
      {
        key,
        scope: "POST:/api/v2/organizations/{organization_id}/deletion",
        resourceId: organizationId,
      },
    );
    let accepted = false;
    try {
      const requested = await this.organizations.requestOrganizationDeletion(
        identity,
        organizationId,
        body.confirmation,
        key,
        canonicalRequestSha256({
          confirmation: body.confirmation,
          organization_id: organizationId,
        }),
        requestCorrelationId(request),
      );
      await acceptAdmissions(this.rateLimiter, [admission]);
      accepted = true;

      if (
        requested.storage_objects.length > 0 &&
        !this.objectStore.configured
      ) {
        throw dependencyUnavailable(
          "Private campaign-asset storage is unavailable for workspace cleanup.",
        );
      }
      for (const objectName of requested.storage_objects) {
        const object = { bucket: ASSET_BUCKET, objectName } as const;
        await this.objectStore.delete(object);
        if ((await this.objectStore.stat(object)) !== null) {
          throw dependencyUnavailable(
            "Private campaign-asset storage could not verify workspace object deletion.",
          );
        }
      }
      try {
        await this.simulationQueue.removeForRuns(requested.run_ids);
      } catch {
        throw dependencyUnavailable(
          "The simulation queue could not verify workspace job deletion.",
        );
      }
      await this.rateLimiter.purgeOrganization(organizationId);
      const completed = await this.organizations.confirmOrganizationDeletion(
        identity,
        requested.request_id,
        organizationId,
      );
      response.setHeader("Idempotent-Replayed", String(requested.replayed));
      return {
        request_id: completed.request_id,
        organization_id: completed.organization_id,
        status: completed.status,
        requested_at: completed.requested_at,
        completed_at: completed.completed_at,
        replayed: completed.replayed,
      };
    } catch (error) {
      if (!accepted) {
        await rejectAdmissions(this.rateLimiter, [admission]);
      }
      throw error;
    }
  }

  @Get()
  @ApiOperation({ operationId: "listOrganizations" })
  @ApiOkResponse({ type: OrganizationPageDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async list(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query() query: OrganizationPageQueryDto,
  ): Promise<OrganizationPageDto> {
    const scope = `organizations:${identity.userId}`;
    const after = this.cursors.decode(query.cursor, scope);
    const records = await this.organizations.listOrganizations(
      identity,
      after,
      query.page_size + 1,
    );
    const visible = records.slice(0, query.page_size);
    const last = visible.at(-1);
    const nextCursor =
      records.length > query.page_size && last !== undefined
        ? this.cursors.encode(scope, {
            createdAt: last.created_at,
            resourceId: last.id,
          })
        : null;
    return {
      items: visible,
      next_cursor: nextCursor,
    };
  }
}
