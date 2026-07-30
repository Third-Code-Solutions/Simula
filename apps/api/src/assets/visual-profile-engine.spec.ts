import type { EnabledDomainRuntime } from "../domain/domain-runtime";
import { REQUIRED_DATABASE_MIGRATION_HEAD } from "../config/production-admission";
import type {
  StimulusAssetRecord,
  VisualStimulusProfile,
} from "../organizations/organization-gateway.port";
import {
  parseVisualStimulusProfile,
  PrivateVisualProfileEngine,
} from "./visual-profile-engine";

const ANALYSIS_ID = "018f274b-3c77-5b22-b749-c9274230ef90";
const ASSET_ID = "018f274b-3c77-4b22-b749-c9274230ef91";
const ORGANIZATION_ID = "018f274b-3c77-4b22-b749-c9274230ef92";
const STIMULUS_ID = "018f274b-3c77-4b22-b749-c9274230ef93";
const CONTENT = Buffer.from("verified-image-fixture", "utf8");
const CHECKSUM = "a".repeat(64);
const CONFIG: EnabledDomainRuntime = {
  enabled: true,
  environment: "test",
  releaseSha: "b".repeat(40),
  migrationHead: REQUIRED_DATABASE_MIGRATION_HEAD,
  databaseUrl: "postgresql://simula_api:password@127.0.0.1:54322/postgres",
  databaseCaPem: null,
  supabaseIssuer: "http://127.0.0.1:54321/auth/v1",
  supabaseJwksUrl: "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json",
  supabasePublishableKey: "sb_publishable_test",
  cursorSecret: "0123456789abcdef0123456789abcdef",
  redisConnection: {
    db: 14,
    enableOfflineQueue: false,
    host: "127.0.0.1",
    maxRetriesPerRequest: 1,
    port: 6379,
  },
  rateLimitKeyPrefix: "simula:test:visual",
  behavioralEngineUrl: "http://127.0.0.1:8010",
  behavioralEngineToken: "t".repeat(32),
  visualProfileEnabled: true,
};

function asset(): StimulusAssetRecord {
  return {
    asset_id: ASSET_ID,
    organization_id: ORGANIZATION_ID,
    stimulus_id: STIMULUS_ID,
    storage_bucket_id: "simula-private-assets",
    storage_object_name: `${ORGANIZATION_ID}/${STIMULUS_ID}/${ASSET_ID}/${CHECKSUM}`,
    filename: "concept.png",
    media_type: "image/png",
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

function profile(analysisId = ANALYSIS_ID): VisualStimulusProfile {
  const signals = [
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
    signals: signals.map((key) => ({
      key,
      value: 0.5,
      unit: "normalized_0_1" as const,
      kind:
        key === "edge_density" || key === "luminance_entropy"
          ? ("heuristic_technical_signal" as const)
          : ("measured_technical_signal" as const),
      method: "bounded fixture method",
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

describe("PrivateVisualProfileEngine", () => {
  it("sends exact bound bytes and validates the complete private profile", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(profile()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const engine = new PrivateVisualProfileEngine(CONFIG, fetcher);

    await expect(
      engine.execute(ANALYSIS_ID, asset(), CONTENT),
    ).resolves.toEqual(profile());
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:8010/internal/v1/visual-assets:profile",
      expect.objectContaining({
        method: "POST",
        redirect: "manual",
      }),
    );
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${"t".repeat(32)}`,
      "Content-Length": String(CONTENT.length),
      "Content-Type": "image/png",
      "X-Simula-Analysis-ID": ANALYSIS_ID,
      "X-Simula-Asset-ID": ASSET_ID,
      "X-Simula-Content-SHA256": CHECKSUM,
    });
  });

  it("requires the private engine to report an admitted visual provider", async () => {
    const ready = new PrivateVisualProfileEngine(
      CONFIG,
      jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "ready",
            admitted_visual_provider_count: 1,
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const notReady = new PrivateVisualProfileEngine(
      CONFIG,
      jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "ready",
            admitted_visual_provider_count: 0,
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(ready.isReady()).resolves.toBe(true);
    await expect(notReady.isReady()).resolves.toBe(false);
  });

  it("rejects unbound, unknown, or claim-unsafe profile fields", () => {
    const wrongAsset = structuredClone(profile()) as unknown as Record<
      string,
      unknown
    >;
    (wrongAsset.asset as Record<string, unknown>).asset_id = STIMULUS_ID;
    const unknown = {
      ...profile(),
      invented_prediction: 0.99,
    };
    const claimed = {
      ...profile(),
      behavioral_interpretation: true,
    };

    expect(() =>
      parseVisualStimulusProfile(wrongAsset, ANALYSIS_ID, asset()),
    ).toThrow("unbound asset");
    expect(() =>
      parseVisualStimulusProfile(unknown, ANALYSIS_ID, asset()),
    ).toThrow("unexpected profile fields");
    expect(() =>
      parseVisualStimulusProfile(claimed, ANALYSIS_ID, asset()),
    ).toThrow("unsafe claims");
  });

  it("fails closed on oversized or non-JSON engine responses", async () => {
    const engine = new PrivateVisualProfileEngine(
      CONFIG,
      jest.fn().mockResolvedValue(
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );

    await expect(
      engine.execute(ANALYSIS_ID, asset(), CONTENT),
    ).rejects.toMatchObject({
      code: "dependency_unavailable",
      status: 503,
    });
  });
});
