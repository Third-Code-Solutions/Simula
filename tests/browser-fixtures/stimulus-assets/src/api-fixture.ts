export const STIMULUS_ASSET_MAX_BYTES = 16 * 1024 * 1024;
export const STIMULUS_ASSET_MEDIA_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
] as const;

export type StimulusAssetMediaType =
  (typeof STIMULUS_ASSET_MEDIA_TYPES)[number];

export type StimulusAsset = {
  asset_id: string;
  byte_size: number | null;
  content_sha256: string | null;
  created_at: string;
  expected_byte_size: number;
  expected_content_sha256: string;
  filename: string;
  media_type: StimulusAssetMediaType;
  organization_id: string;
  replayed: boolean;
  retention_until: string;
  status: "pending_upload" | "available" | "deletion_requested" | "deleted";
  stimulus_id: string;
};

export type StimulusAssetReserveInput = {
  byte_size: number;
  content_sha256: string;
  filename: string;
  media_type: StimulusAssetMediaType;
  retention_until: string;
};

export type StimulusAssetDownload = Readonly<{
  blob: Blob;
  filename: string;
}>;

export type VisualStimulusProfileRecord = Readonly<{
  analysis_id: string;
  asset_content_sha256: string;
  asset_id: string;
  created_at: string;
  organization_id: string;
  profile: Readonly<{
    analysis_id: string;
    analysis_scope: "technical_image_signals_only";
    asset: Readonly<{
      asset_id: string;
      byte_size: number;
      content_sha256: string;
      media_type: "image/jpeg" | "image/png" | "image/webp";
      organization_id: string;
      stimulus_id: string;
    }>;
    behavioral_interpretation: false;
    checksum_sha256: string;
    dimensions: Readonly<{
      aspect_ratio: number;
      height_px: number;
      orientation: "landscape" | "portrait" | "square";
      pixel_count: number;
      width_px: number;
    }>;
    limitations: readonly string[];
    methodology_version: "technical_image_signals_v1";
    population_inference: false;
    provider: Readonly<{
      analysis_kind: "image_signal_profile";
      model_id: "pillow-12.1.0" | "pillow-12.3.0";
      provider_id: "simula_technical_image_signals";
      provider_version: "1.0.0";
      template_id: "technical_image_signals_v1";
    }>;
    retained_embedded_metadata: false;
    sampling: Readonly<{
      algorithm: "exif_transpose_lanczos_rgba_v1";
      sample_height_px: number;
      sampled_pixel_count: number;
      sample_width_px: number;
    }>;
    schema_version: "1.0.0";
    signals: readonly Readonly<{
      key: string;
      kind: "measured_technical_signal" | "heuristic_technical_signal";
      method: string;
      unit: "normalized_0_1";
      value: number;
    }>[];
    validation_label: "experimental";
  }>;
  profile_checksum_sha256: string;
  replayed: boolean;
  stimulus_id: string;
}>;

export class ApiProblem extends Error {
  public readonly correlationId: string | undefined;

  public constructor(
    public readonly status: number,
    public readonly code: string,
    detail: string,
    correlationId?: string,
  ) {
    super(detail);
    this.correlationId = correlationId;
  }
}

function fixtureOnly(): never {
  throw new Error("browser fixture must inject its asset client");
}

export const deleteStimulusAsset = fixtureOnly;
export const createStimulusVisualProfile = fixtureOnly;
export const downloadStimulusAsset = fixtureOnly;
export const getStimulusVisualProfile = fixtureOnly;
export const listStimulusAssets = fixtureOnly;
export const reserveStimulusAsset = fixtureOnly;
export const uploadStimulusAsset = fixtureOnly;
