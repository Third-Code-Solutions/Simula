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
  ASSET_OBJECT_STORE,
  DOMAIN_RATE_LIMITER,
  ORGANIZATION_GATEWAY,
  VISUAL_PROFILE_ENGINE,
} from "../domain/domain.constants";
import { AppProblem, dependencyUnavailable } from "../domain/problem";
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
import type {
  OrganizationGateway,
  StimulusAssetRecord,
} from "../organizations/organization-gateway.port";
import type { DomainRateLimiter } from "../rate-limits/domain-rate-limiter";
import { ASSET_BUCKET, type AssetObjectStore } from "./asset-object-store";
import type { VisualProfileEngine } from "./visual-profile-engine";
import {
  VisualProfileCreateDto,
  VisualStimulusProfileResponseDto,
} from "./visual-profile.dto";

const IDEMPOTENCY_HEADER = {
  name: "Idempotency-Key",
  required: true,
  schema: { type: "string", minLength: 16, maxLength: 128 },
} as const;
const IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function analysisId(assetId: string): string {
  const bytes = createHash("sha256")
    .update("simula-technical-visual-profile-v1\u0000", "utf8")
    .update(assetId, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assertAvailableImage(
  asset: StimulusAssetRecord,
): asserts asset is StimulusAssetRecord & {
  media_type: "image/jpeg" | "image/png" | "image/webp";
  byte_size: number;
  content_sha256: string;
} {
  if (
    asset.status !== "available" ||
    !IMAGE_MEDIA_TYPES.has(asset.media_type) ||
    asset.byte_size === null ||
    asset.content_sha256 === null ||
    Date.parse(asset.retention_until) <= Date.now()
  ) {
    throw new AppProblem(
      409,
      "version_conflict",
      "Visual profile state conflict",
      "Only an available, retained JPEG, PNG, or WebP asset can be profiled.",
    );
  }
}

@ApiTags("stimulus-visual-profiles")
@ApiBearerAuth("supabase")
@UseGuards(SupabaseAuthGuard)
@Controller({ version: "2" })
export class StimulusVisualProfilesController {
  constructor(
    @Inject(ORGANIZATION_GATEWAY)
    private readonly gateway: OrganizationGateway,
    @Inject(DOMAIN_RATE_LIMITER)
    private readonly rateLimiter: DomainRateLimiter,
    @Inject(ASSET_OBJECT_STORE)
    private readonly objectStore: AssetObjectStore,
    @Inject(VISUAL_PROFILE_ENGINE)
    private readonly engine: VisualProfileEngine,
  ) {}

  @Post("stimulus-assets/:asset_id/visual-profile")
  @HttpCode(200)
  @ApiOperation({ operationId: "createStimulusVisualProfile" })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOkResponse({ type: VisualStimulusProfileResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async create(
    @Param("asset_id") rawAssetId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: VisualProfileCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<VisualStimulusProfileResponseDto> {
    if (!this.objectStore.configured) {
      throw dependencyUnavailable(
        "Private campaign-asset storage is not enabled in this environment.",
      );
    }
    const assetId = resourceId(rawAssetId, "asset_id");
    const asset = await this.gateway.getStimulusAsset(identity, assetId);
    assertAvailableImage(asset);
    const key = idempotencyKey(request);
    const admission = await this.rateLimiter.requireOrganizationMutation(
      identity.userId,
      asset.organization_id,
      {
        key,
        scope: "POST:/api/v2/stimulus-assets/{asset_id}/visual-profile",
        resourceId: assetId,
      },
    );
    try {
      const stored = await this.objectStore.get({
        bucket: ASSET_BUCKET,
        objectName: asset.storage_object_name,
      });
      if (
        stored === null ||
        stored.mediaType !== asset.media_type ||
        stored.byteSize !== asset.byte_size ||
        stored.contentSha256 !== asset.content_sha256 ||
        stored.content.length !== asset.byte_size ||
        createHash("sha256").update(stored.content).digest("hex") !==
          asset.content_sha256
      ) {
        throw dependencyUnavailable(
          "The verified private campaign asset is temporarily unavailable.",
        );
      }
      const requestedAnalysisId = analysisId(assetId);
      const profile = await this.engine.execute(
        requestedAnalysisId,
        asset,
        stored.content,
      );
      const command = await this.gateway.createVisualStimulusProfile(
        identity,
        assetId,
        requestedAnalysisId,
        profile,
        key,
        canonicalRequestSha256({
          asset_id: assetId,
          asset_content_sha256: asset.content_sha256,
          methodology_version: body.methodology_version,
          provider_id: "simula_technical_image_signals",
          provider_version: "1.0.0",
        }),
        requestCorrelationId(request),
      );
      await acceptAdmissions(this.rateLimiter, [admission]);
      response.setHeader("Idempotent-Replayed", String(command.replayed));
      return { data: command.value };
    } catch (error) {
      await rejectAdmissions(this.rateLimiter, [admission]);
      throw error;
    }
  }

  @Get("stimulus-assets/:asset_id/visual-profile")
  @ApiOperation({ operationId: "getStimulusVisualProfile" })
  @ApiOkResponse({ type: VisualStimulusProfileResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async get(
    @Param("asset_id") rawAssetId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<VisualStimulusProfileResponseDto> {
    await this.rateLimiter.requireGeneral(identity.userId);
    const assetId = resourceId(rawAssetId, "asset_id");
    const asset = await this.gateway.getStimulusAsset(identity, assetId);
    assertAvailableImage(asset);
    const profile = await this.gateway.getVisualStimulusProfile(
      identity,
      assetId,
    );
    if (profile === null) {
      throw new AppProblem(
        404,
        "not_found",
        "Visual profile not found",
        "No admitted visual profile exists for this campaign asset.",
      );
    }
    return { data: profile };
  }
}
