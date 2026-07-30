import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
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
import {
  ASSET_BUCKET,
  ASSET_MEDIA_TYPES,
  type AssetObjectMetadata,
  type AssetObjectStore,
} from "./asset-object-store";
import {
  StimulusAssetCollectionResponseDto,
  StimulusAssetCommandResponseDto,
  StimulusAssetDeleteDto,
  StimulusAssetReserveDto,
  type StimulusAssetResponseDto,
} from "./stimulus-asset.dto";

const IDEMPOTENCY_HEADER = {
  name: "Idempotency-Key",
  required: true,
  schema: { type: "string", minLength: 16, maxLength: 128 },
} as const;

function publicAsset(asset: StimulusAssetRecord): StimulusAssetResponseDto {
  return {
    asset_id: asset.asset_id,
    organization_id: asset.organization_id,
    stimulus_id: asset.stimulus_id,
    filename: asset.filename,
    media_type: asset.media_type,
    expected_byte_size: asset.expected_byte_size,
    expected_content_sha256: asset.expected_content_sha256,
    byte_size: asset.byte_size,
    content_sha256: asset.content_sha256,
    status: asset.status,
    retention_until: asset.retention_until,
    created_at: asset.created_at,
    replayed: asset.replayed,
  };
}

function objectIdentity(asset: StimulusAssetRecord) {
  return {
    bucket: ASSET_BUCKET,
    objectName: asset.storage_object_name,
  } as const;
}

function expectedObject(asset: StimulusAssetRecord): AssetObjectMetadata {
  return {
    byteSize: asset.expected_byte_size,
    contentSha256: asset.expected_content_sha256,
    mediaType: asset.media_type,
  };
}

function metadataMatches(
  observed: AssetObjectMetadata,
  expected: AssetObjectMetadata,
): boolean {
  return (
    observed.byteSize === expected.byteSize &&
    observed.contentSha256 === expected.contentSha256 &&
    observed.mediaType === expected.mediaType
  );
}

function assetConflict(detail: string): AppProblem {
  return new AppProblem(
    409,
    "version_conflict",
    "Campaign asset state conflict",
    detail,
  );
}

function assertConfigured(store: AssetObjectStore): void {
  if (!store.configured) {
    throw dependencyUnavailable(
      "Private campaign-asset storage is not enabled in this environment.",
    );
  }
}

@ApiTags("stimulus-assets")
@ApiBearerAuth("supabase")
@UseGuards(SupabaseAuthGuard)
@Controller({ version: "2" })
export class StimulusAssetsController {
  constructor(
    @Inject(ORGANIZATION_GATEWAY)
    private readonly gateway: OrganizationGateway,
    @Inject(DOMAIN_RATE_LIMITER)
    private readonly rateLimiter: DomainRateLimiter,
    @Inject(ASSET_OBJECT_STORE)
    private readonly objectStore: AssetObjectStore,
  ) {}

  @Post("stimuli/:stimulus_id/assets")
  @HttpCode(201)
  @ApiOperation({ operationId: "reserveStimulusAsset" })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiCreatedResponse({ type: StimulusAssetCommandResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async reserve(
    @Param("stimulus_id") rawStimulusId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: StimulusAssetReserveDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StimulusAssetCommandResponseDto> {
    assertConfigured(this.objectStore);
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
        scope: "POST:/api/v2/stimuli/{stimulus_id}/assets",
        resourceId: stimulusId,
      },
    );
    try {
      const command = await this.gateway.createStimulusAsset(
        identity,
        stimulusId,
        body,
        key,
        canonicalRequestSha256({ stimulus_id: stimulusId, ...body }),
        requestCorrelationId(request),
      );
      await acceptAdmissions(this.rateLimiter, [admission]);
      response.setHeader("Idempotent-Replayed", String(command.replayed));
      if (command.replayed) response.status(200);
      return { data: publicAsset(command.value) };
    } catch (error) {
      await rejectAdmissions(this.rateLimiter, [admission]);
      throw error;
    }
  }

  @Get("stimuli/:stimulus_id/assets")
  @ApiOperation({ operationId: "listStimulusAssets" })
  @ApiOkResponse({ type: StimulusAssetCollectionResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async list(
    @Param("stimulus_id") rawStimulusId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<StimulusAssetCollectionResponseDto> {
    await this.rateLimiter.requireGeneral(identity.userId);
    return {
      items: (
        await this.gateway.listStimulusAssets(
          identity,
          resourceId(rawStimulusId, "stimulus_id"),
        )
      ).map(publicAsset),
    };
  }

  @Put("stimulus-assets/:asset_id/content")
  @HttpCode(200)
  @ApiOperation({ operationId: "uploadStimulusAssetContent" })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiConsumes(...ASSET_MEDIA_TYPES)
  @ApiBody({
    schema: { type: "string", format: "binary" },
  })
  @ApiOkResponse({ type: StimulusAssetCommandResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async upload(
    @Param("asset_id") rawAssetId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() body: Buffer,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StimulusAssetCommandResponseDto> {
    assertConfigured(this.objectStore);
    const assetId = resourceId(rawAssetId, "asset_id");
    const asset = await this.gateway.getStimulusAsset(identity, assetId);
    const key = idempotencyKey(request);
    const admission = await this.rateLimiter.requireOrganizationMutation(
      identity.userId,
      asset.organization_id,
      {
        key,
        scope: "PUT:/api/v2/stimulus-assets/{asset_id}/content",
        resourceId: assetId,
      },
    );
    try {
      if (
        asset.status === "deletion_requested" ||
        asset.status === "deleted" ||
        Date.parse(asset.retention_until) <= Date.now()
      ) {
        throw assetConflict(
          "The campaign asset is unavailable or its retention window has ended.",
        );
      }
      if (!Buffer.isBuffer(body)) {
        throw new AppProblem(
          422,
          "validation_error",
          "Request validation failed",
          "Provide one supported binary campaign asset.",
        );
      }
      const checksum = createHash("sha256").update(body).digest("hex");
      const expected = expectedObject(asset);
      if (
        body.length !== expected.byteSize ||
        checksum !== expected.contentSha256 ||
        request.header("content-type")?.toLowerCase() !== expected.mediaType
      ) {
        throw assetConflict(
          "The uploaded bytes do not match the reserved media type, size, and SHA-256.",
        );
      }
      const identityKey = objectIdentity(asset);
      const existing = await this.objectStore.stat(identityKey);
      if (existing === null) {
        await this.objectStore.put(
          identityKey,
          { ...expected, filename: asset.filename },
          body,
        );
      } else if (!metadataMatches(existing, expected)) {
        throw dependencyUnavailable(
          "Private campaign-asset storage returned conflicting object metadata.",
        );
      }
      const verified = await this.objectStore.stat(identityKey);
      if (verified === null || !metadataMatches(verified, expected)) {
        await this.objectStore.delete(identityKey);
        throw dependencyUnavailable(
          "Private campaign-asset storage could not verify the uploaded object.",
        );
      }
      const confirmed = await this.gateway.confirmStimulusAssetUpload(
        identity,
        assetId,
        body.length,
        checksum,
        requestCorrelationId(request),
      );
      await acceptAdmissions(this.rateLimiter, [admission]);
      response.setHeader("Idempotent-Replayed", String(confirmed.replayed));
      return { data: publicAsset(confirmed) };
    } catch (error) {
      await rejectAdmissions(this.rateLimiter, [admission]);
      throw error;
    }
  }

  @Get("stimulus-assets/:asset_id/content")
  @ApiOperation({ operationId: "downloadStimulusAssetContent" })
  @ApiProduces(...ASSET_MEDIA_TYPES)
  @ApiOkResponse({
    description: "Verified private stimulus asset.",
    schema: { type: "string", format: "binary" },
  })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async download(
    @Param("asset_id") rawAssetId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Res() response: Response,
  ): Promise<void> {
    assertConfigured(this.objectStore);
    await this.rateLimiter.requireGeneral(identity.userId);
    const asset = await this.gateway.getStimulusAsset(
      identity,
      resourceId(rawAssetId, "asset_id"),
    );
    if (
      asset.status !== "available" ||
      asset.byte_size === null ||
      asset.content_sha256 === null ||
      Date.parse(asset.retention_until) <= Date.now()
    ) {
      throw new AppProblem(
        404,
        "not_found",
        "Resource not found",
        "The requested resource was not found.",
      );
    }
    const stored = await this.objectStore.get(objectIdentity(asset));
    const expected = expectedObject(asset);
    if (
      stored === null ||
      !metadataMatches(stored, expected) ||
      stored.content.length !== expected.byteSize ||
      createHash("sha256").update(stored.content).digest("hex") !==
        expected.contentSha256
    ) {
      throw dependencyUnavailable(
        "Private campaign-asset storage could not verify the requested object.",
      );
    }
    response.setHeader("Content-Type", asset.media_type);
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${asset.filename}"`,
    );
    response.setHeader("Content-Length", String(stored.content.length));
    response.setHeader("ETag", `"${expected.contentSha256}"`);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Security-Policy", "sandbox");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.status(200).send(stored.content);
  }

  @Post("stimulus-assets/:asset_id/deletion")
  @HttpCode(200)
  @ApiOperation({ operationId: "deleteStimulusAsset" })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiBody({ type: StimulusAssetDeleteDto })
  @ApiOkResponse({ type: StimulusAssetCommandResponseDto })
  @ApiAuthenticatedDomainProblems()
  @ApiValidationProblem()
  async delete(
    @Param("asset_id") rawAssetId: string,
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() _body: StimulusAssetDeleteDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StimulusAssetCommandResponseDto> {
    assertConfigured(this.objectStore);
    const assetId = resourceId(rawAssetId, "asset_id");
    const asset = await this.gateway.getStimulusAsset(identity, assetId);
    const key = idempotencyKey(request);
    const admission = await this.rateLimiter.requireOrganizationMutation(
      identity.userId,
      asset.organization_id,
      {
        key,
        scope: "POST:/api/v2/stimulus-assets/{asset_id}/deletion",
        resourceId: assetId,
      },
    );
    try {
      const requested = await this.gateway.requestStimulusAssetDeletion(
        identity,
        assetId,
        key,
        canonicalRequestSha256({ asset_id: assetId }),
        requestCorrelationId(request),
      );
      const identityKey = objectIdentity(requested.value);
      await this.objectStore.delete(identityKey);
      if ((await this.objectStore.stat(identityKey)) !== null) {
        throw dependencyUnavailable(
          "Private campaign-asset storage could not verify object deletion.",
        );
      }
      const confirmed = await this.gateway.confirmStimulusAssetDeletion(
        identity,
        assetId,
        requestCorrelationId(request),
      );
      await acceptAdmissions(this.rateLimiter, [admission]);
      response.setHeader("Idempotent-Replayed", String(requested.replayed));
      return { data: publicAsset(confirmed) };
    } catch (error) {
      await rejectAdmissions(this.rateLimiter, [admission]);
      throw error;
    }
  }
}
