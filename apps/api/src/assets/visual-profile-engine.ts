import { Inject, Injectable } from "@nestjs/common";

import {
  DOMAIN_HTTP_FETCHER,
  DOMAIN_RUNTIME_CONFIG,
} from "../domain/domain.constants";
import type { EnabledDomainRuntime } from "../domain/domain-runtime";
import { AppProblem, dependencyUnavailable } from "../domain/problem";
import type {
  StimulusAssetRecord,
  VisualStimulusProfile,
} from "../organizations/organization-gateway.port";
import type { DomainHttpFetcher } from "../methodology/methodology-engine";

const PROFILE_PATH = "/internal/v1/visual-assets:profile";
const MAX_PROFILE_BYTES = 64_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SIGNAL_KEYS = Object.freeze([
  "alpha_coverage",
  "blue_mean",
  "edge_density",
  "green_mean",
  "luminance_contrast",
  "luminance_entropy",
  "luminance_mean",
  "red_mean",
  "saturation_mean",
] as const);
const LIMITATIONS = Object.freeze([
  "Measures technical image signals only; it does not identify objects, text, brand meaning, emotion, persuasion, or aesthetic quality.",
  "It is not observed human evidence or evidence of campaign performance.",
] as const);

export interface VisualProfileEngine {
  isReady(): Promise<boolean>;
  execute(
    analysisId: string,
    asset: StimulusAssetRecord,
    content: Buffer,
  ): Promise<VisualStimulusProfile>;
}

export type VisualProfileAssetBinding = Pick<
  StimulusAssetRecord,
  | "asset_id"
  | "organization_id"
  | "stimulus_id"
  | "media_type"
  | "byte_size"
  | "content_sha256"
>;

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`private visual engine returned invalid ${name}`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  name: string,
): void {
  const observed = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (
    observed.length !== canonical.length ||
    observed.some((key, index) => key !== canonical[index])
  ) {
    throw new Error(`private visual engine returned unexpected ${name} fields`);
  }
}

function exactString(value: unknown, expected: string, name: string): string {
  if (value !== expected) {
    throw new Error(`private visual engine returned invalid ${name}`);
  }
  return expected;
}

function boundedString(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`private visual engine returned invalid ${name}`);
  }
  return value;
}

function uuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`private visual engine returned invalid ${name}`);
  }
  return value;
}

function sha256(value: unknown, name: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`private visual engine returned invalid ${name}`);
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
    throw new Error(`private visual engine returned invalid ${name}`);
  }
  return value;
}

function normalized(value: unknown, name: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`private visual engine returned invalid ${name}`);
  }
  return value;
}

export function parseVisualStimulusProfile(
  value: unknown,
  analysisId: string,
  expectedAsset: VisualProfileAssetBinding,
): VisualStimulusProfile {
  const profile = record(value, "profile");
  exactKeys(
    profile,
    [
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
    ],
    "profile",
  );
  exactString(profile.schema_version, "1.0.0", "profile schema");
  if (uuid(profile.analysis_id, "analysis id") !== analysisId) {
    throw new Error("private visual engine returned another analysis");
  }

  const asset = record(profile.asset, "asset");
  exactKeys(
    asset,
    [
      "asset_id",
      "organization_id",
      "stimulus_id",
      "media_type",
      "byte_size",
      "content_sha256",
    ],
    "asset",
  );
  if (
    uuid(asset.asset_id, "asset id") !== expectedAsset.asset_id ||
    uuid(asset.organization_id, "asset organization") !==
      expectedAsset.organization_id ||
    uuid(asset.stimulus_id, "asset stimulus") !== expectedAsset.stimulus_id ||
    asset.media_type !== expectedAsset.media_type ||
    positiveInteger(asset.byte_size, 16_777_216, "asset size") !==
      expectedAsset.byte_size ||
    sha256(asset.content_sha256, "asset checksum") !==
      expectedAsset.content_sha256
  ) {
    throw new Error("private visual engine returned an unbound asset");
  }

  const provider = record(profile.provider, "provider");
  exactKeys(
    provider,
    [
      "provider_id",
      "provider_version",
      "model_id",
      "template_id",
      "analysis_kind",
    ],
    "provider",
  );
  exactString(
    provider.provider_id,
    "simula_technical_image_signals",
    "provider id",
  );
  exactString(provider.provider_version, "1.0.0", "provider version");
  exactString(provider.model_id, "pillow-12.3.0", "model id");
  exactString(
    provider.template_id,
    "technical_image_signals_v1",
    "template id",
  );
  exactString(provider.analysis_kind, "image_signal_profile", "analysis kind");
  exactString(
    profile.methodology_version,
    "technical_image_signals_v1",
    "methodology version",
  );
  exactString(
    profile.analysis_scope,
    "technical_image_signals_only",
    "analysis scope",
  );
  exactString(profile.validation_label, "experimental", "validation label");

  const dimensions = record(profile.dimensions, "dimensions");
  exactKeys(
    dimensions,
    ["width_px", "height_px", "pixel_count", "aspect_ratio", "orientation"],
    "dimensions",
  );
  const width = positiveInteger(dimensions.width_px, 40_000_000, "width");
  const height = positiveInteger(dimensions.height_px, 40_000_000, "height");
  const pixelCount = positiveInteger(
    dimensions.pixel_count,
    40_000_000,
    "pixel count",
  );
  const aspectRatio = dimensions.aspect_ratio;
  const expectedOrientation =
    width === height ? "square" : width > height ? "landscape" : "portrait";
  if (
    pixelCount !== width * height ||
    typeof aspectRatio !== "number" ||
    !Number.isFinite(aspectRatio) ||
    aspectRatio !== Number((width / height).toFixed(6)) ||
    dimensions.orientation !== expectedOrientation
  ) {
    throw new Error("private visual engine returned inconsistent dimensions");
  }

  const sampling = record(profile.sampling, "sampling");
  exactKeys(
    sampling,
    ["algorithm", "sample_width_px", "sample_height_px", "sampled_pixel_count"],
    "sampling",
  );
  exactString(
    sampling.algorithm,
    "exif_transpose_lanczos_rgba_v1",
    "sampling algorithm",
  );
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
  if (
    positiveInteger(
      sampling.sampled_pixel_count,
      65_536,
      "sample pixel count",
    ) !==
    sampleWidth * sampleHeight
  ) {
    throw new Error("private visual engine returned inconsistent sampling");
  }

  if (!Array.isArray(profile.signals) || profile.signals.length !== 9) {
    throw new Error("private visual engine returned invalid signals");
  }
  profile.signals.forEach((rawSignal, index) => {
    const signal = record(rawSignal, "signal");
    exactKeys(signal, ["key", "value", "unit", "kind", "method"], "signal");
    const expectedKey = SIGNAL_KEYS[index];
    if (signal.key !== expectedKey) {
      throw new Error("private visual engine returned noncanonical signals");
    }
    normalized(signal.value, `${String(expectedKey)} value`);
    exactString(signal.unit, "normalized_0_1", "signal unit");
    exactString(
      signal.kind,
      expectedKey === "edge_density" || expectedKey === "luminance_entropy"
        ? "heuristic_technical_signal"
        : "measured_technical_signal",
      "signal kind",
    );
    boundedString(signal.method, "signal method");
  });

  if (
    profile.behavioral_interpretation !== false ||
    profile.population_inference !== false ||
    profile.retained_embedded_metadata !== false ||
    !Array.isArray(profile.limitations) ||
    profile.limitations.length !== 2 ||
    profile.limitations[0] !== LIMITATIONS[0] ||
    profile.limitations[1] !== LIMITATIONS[1]
  ) {
    throw new Error("private visual engine returned unsafe claims");
  }
  sha256(profile.checksum_sha256, "profile checksum");
  return profile as unknown as VisualStimulusProfile;
}

@Injectable()
export class PrivateVisualProfileEngine implements VisualProfileEngine {
  constructor(
    @Inject(DOMAIN_RUNTIME_CONFIG)
    private readonly config: EnabledDomainRuntime,
    @Inject(DOMAIN_HTTP_FETCHER)
    private readonly fetcher: DomainHttpFetcher,
  ) {}

  async isReady(): Promise<boolean> {
    try {
      const response = await this.fetcher(
        `${this.config.behavioralEngineUrl}/health/ready`,
        {
          headers: { Accept: "application/json" },
          redirect: "manual",
          signal: AbortSignal.timeout(1_500),
        },
      );
      if (
        response.status !== 200 ||
        response.headers
          .get("content-type")
          ?.split(";", 1)[0]
          ?.toLowerCase() !== "application/json"
      ) {
        return false;
      }
      const body = record(await response.json(), "health");
      return (
        body.status === "ready" &&
        Number.isSafeInteger(body.admitted_visual_provider_count) &&
        (body.admitted_visual_provider_count as number) >= 1
      );
    } catch {
      return false;
    }
  }

  async execute(
    analysisId: string,
    asset: StimulusAssetRecord,
    content: Buffer,
  ): Promise<VisualStimulusProfile> {
    if (
      !UUID_PATTERN.test(analysisId) ||
      !IMAGE_MEDIA_TYPES.has(asset.media_type) ||
      asset.status !== "available" ||
      asset.byte_size === null ||
      asset.content_sha256 === null ||
      content.length !== asset.byte_size ||
      content.length > 16_777_216
    ) {
      throw new AppProblem(
        409,
        "version_conflict",
        "Visual profile state conflict",
        "Only an available, verified still-image asset can be profiled.",
      );
    }
    let response: Response;
    try {
      response = await this.fetcher(
        `${this.config.behavioralEngineUrl}${PROFILE_PATH}`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.config.behavioralEngineToken}`,
            "Content-Length": String(content.length),
            "Content-Type": asset.media_type,
            "X-Simula-Analysis-ID": analysisId,
            "X-Simula-Asset-ID": asset.asset_id,
            "X-Simula-Content-SHA256": asset.content_sha256,
            "X-Simula-Organization-ID": asset.organization_id,
            "X-Simula-Stimulus-ID": asset.stimulus_id,
          },
          body: new Uint8Array(content),
          redirect: "manual",
          signal: AbortSignal.timeout(7_500),
        },
      );
    } catch {
      throw dependencyUnavailable(
        "The private visual analysis engine is temporarily unavailable.",
      );
    }
    if (response.status === 422) {
      throw new AppProblem(
        422,
        "validation_error",
        "Visual profile rejected",
        "The verified image does not match the admitted visual methodology.",
      );
    }
    if (response.status !== 200) {
      throw dependencyUnavailable(
        "The private visual analysis engine is temporarily unavailable.",
      );
    }
    const mediaType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.toLowerCase();
    const rawLength = response.headers.get("content-length");
    if (
      mediaType !== "application/json" ||
      response.headers.get("content-encoding") !== null ||
      (rawLength !== null &&
        (!/^[0-9]+$/.test(rawLength) || Number(rawLength) > MAX_PROFILE_BYTES))
    ) {
      throw dependencyUnavailable(
        "The private visual analysis engine returned an unsafe response.",
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_PROFILE_BYTES) {
      throw dependencyUnavailable(
        "The private visual analysis engine returned an unsafe response.",
      );
    }
    try {
      return parseVisualStimulusProfile(
        JSON.parse(new TextDecoder().decode(bytes)),
        analysisId,
        asset,
      );
    } catch {
      throw dependencyUnavailable(
        "The private visual analysis engine returned an invalid profile.",
      );
    }
  }
}

@Injectable()
export class UnavailableVisualProfileEngine implements VisualProfileEngine {
  async isReady(): Promise<boolean> {
    return true;
  }

  async execute(
    _analysisId: string,
    _asset: StimulusAssetRecord,
    _content: Buffer,
  ): Promise<VisualStimulusProfile> {
    throw dependencyUnavailable(
      "Technical visual profiling is disabled in this environment.",
    );
  }
}
