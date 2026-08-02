import { createHash } from "node:crypto";

import type { VerifiedIdentity } from "../auth/identity";
import type {
  OrganizationGateway,
  StimulusAssetRecord,
  VisualStimulusProfile,
} from "../organizations/organization-gateway.port";
import type { DomainRateLimiter } from "../rate-limits/domain-rate-limiter";
import type { AssetObjectStore } from "./asset-object-store";
import { StimulusVisualProfilesController } from "./stimulus-visual-profiles.controller";
import type { VisualProfileEngine } from "./visual-profile-engine";

const USER_ID = "018f274b-3c77-4b22-b749-c9274230ef90";
const ORGANIZATION_ID = "018f274b-3c77-4b22-b749-c9274230ef91";
const STIMULUS_ID = "018f274b-3c77-4b22-b749-c9274230ef92";
const ASSET_ID = "018f274b-3c77-4b22-b749-c9274230ef93";
const CORRELATION_ID = "018f274b-3c77-4b22-b749-c9274230ef94";
const IDEMPOTENCY_KEY = "visual-profile-key-0001";
const CONTENT = Buffer.from("verified-visual-content", "utf8");
const CHECKSUM = createHash("sha256").update(CONTENT).digest("hex");
const IDENTITY: VerifiedIdentity = {
  userId: USER_ID,
  issuer: "http://127.0.0.1:54321/auth/v1",
  expiresAt: 1_800_000_000,
  sessionId: "018f274b-3c77-4b22-b749-c9274230ef95",
};

function asset(
  mediaType: StimulusAssetRecord["media_type"] = "image/png",
): StimulusAssetRecord {
  return {
    asset_id: ASSET_ID,
    organization_id: ORGANIZATION_ID,
    stimulus_id: STIMULUS_ID,
    storage_bucket_id: "simula-private-assets",
    storage_object_name: `${ORGANIZATION_ID}/${STIMULUS_ID}/${ASSET_ID}/${CHECKSUM}`,
    filename: "concept.png",
    media_type: mediaType,
    expected_byte_size: CONTENT.length,
    expected_content_sha256: CHECKSUM,
    byte_size: CONTENT.length,
    content_sha256: CHECKSUM,
    status: "available",
    retention_until: "2026-08-15T00:00:00.000000Z",
    created_at: "2026-07-30T00:00:00.000000Z",
    replayed: false,
  };
}

function profile(analysisId: string): VisualStimulusProfile {
  const signalKeys = [
    "alpha_coverage",
    "blue_mean",
    "edge_density",
    "green_mean",
    "luminance_contrast",
    "luminance_entropy",
    "luminance_mean",
    "red_mean",
    "saturation_mean",
  ] as const;
  return {
    schema_version: "1.0.0",
    analysis_id: analysisId,
    asset: {
      asset_id: ASSET_ID,
      organization_id: ORGANIZATION_ID,
      stimulus_id: STIMULUS_ID,
      media_type: "image/png",
      byte_size: CONTENT.length,
      content_sha256: CHECKSUM,
    },
    provider: {
      provider_id: "simula_technical_image_signals",
      provider_version: "1.0.0",
      model_id: "pillow-12.3.0",
      template_id: "technical_image_signals_v1",
      analysis_kind: "image_signal_profile",
    },
    methodology_version: "technical_image_signals_v1",
    analysis_scope: "technical_image_signals_only",
    validation_label: "experimental",
    dimensions: {
      width_px: 4,
      height_px: 2,
      pixel_count: 8,
      aspect_ratio: 2,
      orientation: "landscape",
    },
    sampling: {
      algorithm: "exif_transpose_lanczos_rgba_v1",
      sample_width_px: 4,
      sample_height_px: 2,
      sampled_pixel_count: 8,
    },
    signals: signalKeys.map((key) => ({
      key,
      value: 0.5,
      unit: "normalized_0_1" as const,
      kind:
        key === "edge_density" || key === "luminance_entropy"
          ? ("heuristic_technical_signal" as const)
          : ("measured_technical_signal" as const),
      method: "bounded fixture",
    })),
    behavioral_interpretation: false,
    population_inference: false,
    retained_embedded_metadata: false,
    limitations: [
      "Measures technical image signals only; it does not identify objects, text, brand meaning, emotion, persuasion, or aesthetic quality.",
      "It is not observed human evidence or evidence of campaign performance.",
    ],
    checksum_sha256: "b".repeat(64),
  };
}

function request(key = IDEMPOTENCY_KEY) {
  return {
    rawHeaders: ["Idempotency-Key", key],
    simulaCorrelationId: CORRELATION_ID,
  };
}

function response() {
  return { setHeader: jest.fn() };
}

function dependencies() {
  const admission = {
    markerKey: "visual-marker",
    ownerToken: "visual-owner",
    acceptedReplay: false,
  };
  const gateway = {
    getStimulusAsset: jest.fn().mockResolvedValue(asset()),
    createVisualStimulusProfile: jest
      .fn()
      .mockImplementation(
        (
          _identity: VerifiedIdentity,
          _assetId: string,
          analysisId: string,
          result: VisualStimulusProfile,
        ) => ({
          value: {
            analysis_id: analysisId,
            asset_id: ASSET_ID,
            organization_id: ORGANIZATION_ID,
            stimulus_id: STIMULUS_ID,
            asset_content_sha256: CHECKSUM,
            profile_checksum_sha256: result.checksum_sha256,
            profile: result,
            created_at: "2026-07-30T01:00:00.000000Z",
            replayed: false,
          },
          replayed: false,
        }),
      ),
    getVisualStimulusProfile: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<OrganizationGateway>;
  const rateLimiter = {
    requireGeneral: jest.fn().mockResolvedValue(undefined),
    requireOrganizationMutation: jest.fn().mockResolvedValue(admission),
    acceptIdempotency: jest.fn().mockResolvedValue(undefined),
    rejectIdempotency: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<DomainRateLimiter>;
  const objectStore = {
    configured: true,
    isReady: jest.fn().mockResolvedValue(true),
    stat: jest.fn(),
    put: jest.fn(),
    get: jest.fn().mockResolvedValue({
      byteSize: CONTENT.length,
      contentSha256: CHECKSUM,
      mediaType: "image/png",
      content: CONTENT,
    }),
    delete: jest.fn(),
  } as jest.Mocked<AssetObjectStore>;
  const engine = {
    isReady: jest.fn().mockResolvedValue(true),
    execute: jest
      .fn()
      .mockImplementation((analysisId: string) => profile(analysisId)),
  } as jest.Mocked<VisualProfileEngine>;
  return {
    controller: new StimulusVisualProfilesController(
      gateway,
      rateLimiter,
      objectStore,
      engine,
    ),
    engine,
    gateway,
    objectStore,
    rateLimiter,
  };
}

describe("StimulusVisualProfilesController", () => {
  it("profiles only verified available bytes and persists the bound result", async () => {
    const { controller, engine, gateway, objectStore } = dependencies();

    const result = await controller.create(
      ASSET_ID,
      IDENTITY,
      { methodology_version: "technical_image_signals_v1" },
      request() as never,
      response() as never,
    );

    expect(objectStore.get).toHaveBeenCalledWith({
      bucket: "simula-private-assets",
      objectName: `${ORGANIZATION_ID}/${STIMULUS_ID}/${ASSET_ID}/${CHECKSUM}`,
    });
    expect(engine.execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      expect.objectContaining({ asset_id: ASSET_ID, status: "available" }),
      CONTENT,
    );
    expect(gateway.createVisualStimulusProfile).toHaveBeenCalledWith(
      IDENTITY,
      ASSET_ID,
      result.data.analysis_id,
      expect.objectContaining({
        analysis_scope: "technical_image_signals_only",
        behavioral_interpretation: false,
        population_inference: false,
      }),
      IDEMPOTENCY_KEY,
      expect.stringMatching(/^[0-9a-f]{64}$/),
      CORRELATION_ID,
    );
    expect(result.data.profile).not.toHaveProperty("content");
    expect(result.data.profile).not.toHaveProperty("storage_object_name");
  });

  it("keeps the immutable analysis identity stable across command keys", async () => {
    const { controller, engine } = dependencies();

    await controller.create(
      ASSET_ID,
      IDENTITY,
      { methodology_version: "technical_image_signals_v1" },
      request("visual-profile-key-0001") as never,
      response() as never,
    );
    await controller.create(
      ASSET_ID,
      IDENTITY,
      { methodology_version: "technical_image_signals_v1" },
      request("visual-profile-key-0002") as never,
      response() as never,
    );

    expect(engine.execute.mock.calls[0]?.[0]).toBe(
      engine.execute.mock.calls[1]?.[0],
    );
  });

  it("rejects storage bytes that no longer match immutable metadata", async () => {
    const { controller, engine, objectStore } = dependencies();
    objectStore.get.mockResolvedValue({
      byteSize: CONTENT.length,
      contentSha256: CHECKSUM,
      mediaType: "image/png",
      content: Buffer.from("tampered", "utf8"),
    });

    await expect(
      controller.create(
        ASSET_ID,
        IDENTITY,
        { methodology_version: "technical_image_signals_v1" },
        request() as never,
        response() as never,
      ),
    ).rejects.toMatchObject({
      code: "dependency_unavailable",
      status: 503,
    });
    expect(engine.execute).not.toHaveBeenCalled();
  });

  it("rejects PDF and video assets without pretending to understand them", async () => {
    const { controller, gateway, engine } = dependencies();
    gateway.getStimulusAsset.mockResolvedValue(asset("application/pdf"));

    await expect(
      controller.create(
        ASSET_ID,
        IDENTITY,
        { methodology_version: "technical_image_signals_v1" },
        request() as never,
        response() as never,
      ),
    ).rejects.toMatchObject({
      code: "version_conflict",
      status: 409,
    });
    expect(engine.execute).not.toHaveBeenCalled();
  });

  it("returns the durable profile or an explicit absence", async () => {
    const { controller, gateway } = dependencies();
    await expect(controller.get(ASSET_ID, IDENTITY)).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });

    const storedProfile = profile("018f274b-3c77-5b22-b749-c9274230ef99");
    gateway.getVisualStimulusProfile.mockResolvedValue({
      analysis_id: storedProfile.analysis_id,
      asset_id: ASSET_ID,
      organization_id: ORGANIZATION_ID,
      stimulus_id: STIMULUS_ID,
      asset_content_sha256: CHECKSUM,
      profile_checksum_sha256: storedProfile.checksum_sha256,
      profile: storedProfile,
      created_at: "2026-07-30T01:00:00.000000Z",
      replayed: false,
    });

    await expect(controller.get(ASSET_ID, IDENTITY)).resolves.toMatchObject({
      data: {
        asset_id: ASSET_ID,
        profile: {
          validation_label: "experimental",
          behavioral_interpretation: false,
        },
      },
    });
  });
});
