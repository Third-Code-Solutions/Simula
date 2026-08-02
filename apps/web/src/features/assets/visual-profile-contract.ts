import type { ControlPlaneComponents } from "@simula/contracts";

type Schemas = ControlPlaneComponents["schemas"];

export type VisualStimulusProfileRecord =
  Schemas["VisualStimulusProfileRecordDto"];
export type VisualStimulusProfile = Schemas["VisualStimulusProfileDto"];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PROFILE_KEYS = new Set([
  "schema_version",
  "analysis_id",
  "asset",
  "provider",
  "methodology_version",
  "analysis_scope",
  "validation_label",
  "dimensions",
  "sampling",
  "signals",
  "behavioral_interpretation",
  "population_inference",
  "retained_embedded_metadata",
  "limitations",
  "checksum_sha256",
]);
const RECORD_KEYS = new Set([
  "analysis_id",
  "asset_id",
  "organization_id",
  "stimulus_id",
  "asset_content_sha256",
  "profile_checksum_sha256",
  "profile",
  "created_at",
  "replayed",
]);
const SIGNAL_KEYS = [
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
const LIMITATIONS = [
  "Measures technical image signals only; it does not identify objects, text, brand meaning, emotion, persuasion, or aesthetic quality.",
  "It is not observed human evidence or evidence of campaign performance.",
] as const;

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
  name: string,
): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    throw new Error(`${name} has unexpected fields`);
  }
}

function uuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function sha256(value: unknown, name: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function positiveInteger(
  value: unknown,
  maximum: number,
  name: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

export function parseVisualStimulusProfile(
  value: unknown,
): VisualStimulusProfile {
  const profile = record(value, "visual profile");
  exactKeys(profile, PROFILE_KEYS, "visual profile");
  const asset = record(profile.asset, "visual profile asset");
  const provider = record(profile.provider, "visual profile provider");
  const dimensions = record(profile.dimensions, "visual profile dimensions");
  const sampling = record(profile.sampling, "visual profile sampling");
  if (
    profile.schema_version !== "1.0.0" ||
    !UUID_PATTERN.test(String(profile.analysis_id)) ||
    Object.keys(asset).length !== 6 ||
    uuid(asset.asset_id, "visual asset id") === "" ||
    uuid(asset.organization_id, "visual organization id") === "" ||
    uuid(asset.stimulus_id, "visual stimulus id") === "" ||
    !["image/jpeg", "image/png", "image/webp"].includes(
      String(asset.media_type),
    ) ||
    positiveInteger(asset.byte_size, 16_777_216, "visual asset size") < 1 ||
    sha256(asset.content_sha256, "visual asset checksum") === "" ||
    Object.keys(provider).length !== 5 ||
    provider.provider_id !== "simula_technical_image_signals" ||
    provider.provider_version !== "1.0.0" ||
    (provider.model_id !== "pillow-12.1.0" &&
      provider.model_id !== "pillow-12.3.0") ||
    provider.template_id !== "technical_image_signals_v1" ||
    provider.analysis_kind !== "image_signal_profile" ||
    profile.methodology_version !== "technical_image_signals_v1" ||
    profile.analysis_scope !== "technical_image_signals_only" ||
    profile.validation_label !== "experimental" ||
    profile.behavioral_interpretation !== false ||
    profile.population_inference !== false ||
    profile.retained_embedded_metadata !== false ||
    !Array.isArray(profile.limitations) ||
    profile.limitations.length !== 2 ||
    profile.limitations[0] !== LIMITATIONS[0] ||
    profile.limitations[1] !== LIMITATIONS[1] ||
    !SHA256_PATTERN.test(String(profile.checksum_sha256))
  ) {
    throw new Error("visual profile violates its admitted contract");
  }

  const width = positiveInteger(dimensions.width_px, 40_000_000, "width");
  const height = positiveInteger(dimensions.height_px, 40_000_000, "height");
  const sampleWidth = positiveInteger(
    sampling.sample_width_px,
    256,
    "sample width",
  );
  const sampleHeight = positiveInteger(
    sampling.sample_height_px,
    256,
    "sample height",
  );
  const expectedOrientation =
    width === height ? "square" : width > height ? "landscape" : "portrait";
  if (
    Object.keys(dimensions).length !== 5 ||
    positiveInteger(dimensions.pixel_count, 40_000_000, "pixel count") !==
      width * height ||
    dimensions.aspect_ratio !== Number((width / height).toFixed(6)) ||
    dimensions.orientation !== expectedOrientation ||
    Object.keys(sampling).length !== 4 ||
    sampling.algorithm !== "exif_transpose_lanczos_rgba_v1" ||
    positiveInteger(
      sampling.sampled_pixel_count,
      65_536,
      "sample pixel count",
    ) !==
      sampleWidth * sampleHeight ||
    !Array.isArray(profile.signals) ||
    profile.signals.length !== SIGNAL_KEYS.length
  ) {
    throw new Error("visual profile dimensions or sampling are inconsistent");
  }
  profile.signals.forEach((rawSignal, index) => {
    const signal = record(rawSignal, "visual signal");
    const key = SIGNAL_KEYS[index];
    if (
      Object.keys(signal).length !== 5 ||
      signal.key !== key ||
      typeof signal.value !== "number" ||
      !Number.isFinite(signal.value) ||
      signal.value < 0 ||
      signal.value > 1 ||
      signal.unit !== "normalized_0_1" ||
      signal.kind !==
        (key === "edge_density" || key === "luminance_entropy"
          ? "heuristic_technical_signal"
          : "measured_technical_signal") ||
      typeof signal.method !== "string" ||
      signal.method.length < 1 ||
      signal.method.length > 160
    ) {
      throw new Error("visual profile signal is invalid");
    }
  });
  return profile as unknown as VisualStimulusProfile;
}

export function parseVisualStimulusProfileRecord(
  value: unknown,
): VisualStimulusProfileRecord {
  const stored = record(value, "visual profile record");
  exactKeys(stored, RECORD_KEYS, "visual profile record");
  const profile = parseVisualStimulusProfile(stored.profile);
  const analysisId = uuid(stored.analysis_id, "analysis id");
  const assetId = uuid(stored.asset_id, "profile asset id");
  const organizationId = uuid(
    stored.organization_id,
    "profile organization id",
  );
  const stimulusId = uuid(stored.stimulus_id, "profile stimulus id");
  const assetChecksum = sha256(
    stored.asset_content_sha256,
    "profile asset checksum",
  );
  const profileChecksum = sha256(
    stored.profile_checksum_sha256,
    "profile checksum",
  );
  if (
    analysisId !== profile.analysis_id ||
    assetId !== profile.asset.asset_id ||
    organizationId !== profile.asset.organization_id ||
    stimulusId !== profile.asset.stimulus_id ||
    assetChecksum !== profile.asset.content_sha256 ||
    profileChecksum !== profile.checksum_sha256 ||
    typeof stored.created_at !== "string" ||
    !Number.isFinite(Date.parse(stored.created_at)) ||
    typeof stored.replayed !== "boolean"
  ) {
    throw new Error("visual profile record is not bound to its profile");
  }
  return Object.freeze({
    analysis_id: analysisId,
    asset_content_sha256: assetChecksum,
    asset_id: assetId,
    created_at: stored.created_at,
    organization_id: organizationId,
    profile,
    profile_checksum_sha256: profileChecksum,
    replayed: stored.replayed,
    stimulus_id: stimulusId,
  });
}

export function parseVisualStimulusProfileResponse(
  value: unknown,
): VisualStimulusProfileRecord {
  const response = record(value, "visual profile response");
  if (Object.keys(response).length !== 1 || !("data" in response)) {
    throw new Error("visual profile response is invalid");
  }
  return parseVisualStimulusProfileRecord(response.data);
}
