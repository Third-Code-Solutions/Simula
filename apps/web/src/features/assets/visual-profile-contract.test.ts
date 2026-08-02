import { describe, expect, it } from "vitest";

import {
  parseVisualStimulusProfileResponse,
  type VisualStimulusProfile,
} from "./visual-profile-contract";

const ANALYSIS_ID = "018f274b-3c77-5b22-b749-c9274230ef90";
const ASSET_ID = "018f274b-3c77-4b22-b749-c9274230ef91";
const ORGANIZATION_ID = "018f274b-3c77-4b22-b749-c9274230ef92";
const STIMULUS_ID = "018f274b-3c77-4b22-b749-c9274230ef93";
const ASSET_SHA = "a".repeat(64);
const PROFILE_SHA = "b".repeat(64);

function profile(): VisualStimulusProfile {
  const keys = [
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
    analysis_id: ANALYSIS_ID,
    asset: {
      asset_id: ASSET_ID,
      organization_id: ORGANIZATION_ID,
      stimulus_id: STIMULUS_ID,
      media_type: "image/png",
      byte_size: 8,
      content_sha256: ASSET_SHA,
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
    signals: keys.map((key) => ({
      key,
      value: 0.5,
      unit: "normalized_0_1",
      kind:
        key === "edge_density" || key === "luminance_entropy"
          ? "heuristic_technical_signal"
          : "measured_technical_signal",
      method: "bounded fixture",
    })),
    behavioral_interpretation: false,
    population_inference: false,
    retained_embedded_metadata: false,
    limitations: [
      "Measures technical image signals only; it does not identify objects, text, brand meaning, emotion, persuasion, or aesthetic quality.",
      "It is not observed human evidence or evidence of campaign performance.",
    ],
    checksum_sha256: PROFILE_SHA,
  };
}

function response() {
  return {
    data: {
      analysis_id: ANALYSIS_ID,
      asset_id: ASSET_ID,
      organization_id: ORGANIZATION_ID,
      stimulus_id: STIMULUS_ID,
      asset_content_sha256: ASSET_SHA,
      profile_checksum_sha256: PROFILE_SHA,
      profile: profile(),
      created_at: "2026-07-30T01:00:00.000Z",
      replayed: false,
    },
  };
}

describe("visual profile public contract", () => {
  it("accepts only the exact bound no-claim profile", () => {
    expect(parseVisualStimulusProfileResponse(response())).toMatchObject({
      asset_id: ASSET_ID,
      profile: {
        analysis_scope: "technical_image_signals_only",
        behavioral_interpretation: false,
        population_inference: false,
      },
    });
  });

  it("keeps historical Pillow 12.1.0 profiles readable", () => {
    const historical = structuredClone(response());
    historical.data.profile.provider.model_id = "pillow-12.1.0";

    expect(
      parseVisualStimulusProfileResponse(historical).profile.provider.model_id,
    ).toBe("pillow-12.1.0");
  });

  it("rejects private, unknown, or unbound fields", () => {
    const privateLeak = structuredClone(response());
    Object.assign(privateLeak.data, {
      storage_object_name: "private/path",
    });
    const unbound = structuredClone(response());
    unbound.data.profile.asset.asset_id = STIMULUS_ID;
    const claim = structuredClone(response()) as unknown as {
      data: { profile: { behavioral_interpretation: boolean } };
    };
    claim.data.profile.behavioral_interpretation = true;

    expect(() => parseVisualStimulusProfileResponse(privateLeak)).toThrow(
      "unexpected fields",
    );
    expect(() => parseVisualStimulusProfileResponse(unbound)).toThrow(
      "not bound",
    );
    expect(() => parseVisualStimulusProfileResponse(claim)).toThrow(
      "admitted contract",
    );
  });
});
