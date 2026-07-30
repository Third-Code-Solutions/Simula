import { ApiProperty } from "@nestjs/swagger";
import { Equals } from "class-validator";

import type {
  VisualStimulusProfile,
  VisualStimulusProfileRecord,
} from "../organizations/organization-gateway.port";

const UUID_EXAMPLE = "00000000-0000-4000-8000-000000000001";
const SHA256_PATTERN = "^[0-9a-f]{64}$";
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

export class VisualProfileCreateDto {
  @ApiProperty({ enum: ["technical_image_signals_v1"] })
  @Equals("technical_image_signals_v1")
  methodology_version!: "technical_image_signals_v1";
}

export class VisualProfileAssetDto {
  @ApiProperty({ format: "uuid", example: UUID_EXAMPLE })
  asset_id!: string;

  @ApiProperty({ format: "uuid", example: UUID_EXAMPLE })
  organization_id!: string;

  @ApiProperty({ format: "uuid", example: UUID_EXAMPLE })
  stimulus_id!: string;

  @ApiProperty({ enum: ["image/jpeg", "image/png", "image/webp"] })
  media_type!: "image/jpeg" | "image/png" | "image/webp";

  @ApiProperty({ type: "integer", minimum: 1, maximum: 16_777_216 })
  byte_size!: number;

  @ApiProperty({ pattern: SHA256_PATTERN })
  content_sha256!: string;
}

export class VisualProfileProviderDto {
  @ApiProperty({ enum: ["simula_technical_image_signals"] })
  provider_id!: "simula_technical_image_signals";

  @ApiProperty({ enum: ["1.0.0"] })
  provider_version!: "1.0.0";

  @ApiProperty({ enum: ["pillow-12.1.0", "pillow-12.3.0"] })
  model_id!: "pillow-12.1.0" | "pillow-12.3.0";

  @ApiProperty({ enum: ["technical_image_signals_v1"] })
  template_id!: "technical_image_signals_v1";

  @ApiProperty({ enum: ["image_signal_profile"] })
  analysis_kind!: "image_signal_profile";
}

export class VisualProfileDimensionsDto {
  @ApiProperty({ type: "integer", minimum: 1, maximum: 40_000_000 })
  width_px!: number;

  @ApiProperty({ type: "integer", minimum: 1, maximum: 40_000_000 })
  height_px!: number;

  @ApiProperty({ type: "integer", minimum: 1, maximum: 40_000_000 })
  pixel_count!: number;

  @ApiProperty({ type: "number", minimum: 0, exclusiveMinimum: true })
  aspect_ratio!: number;

  @ApiProperty({ enum: ["landscape", "portrait", "square"] })
  orientation!: "landscape" | "portrait" | "square";
}

export class VisualProfileSamplingDto {
  @ApiProperty({ enum: ["exif_transpose_lanczos_rgba_v1"] })
  algorithm!: "exif_transpose_lanczos_rgba_v1";

  @ApiProperty({ type: "integer", minimum: 1, maximum: 256 })
  sample_width_px!: number;

  @ApiProperty({ type: "integer", minimum: 1, maximum: 256 })
  sample_height_px!: number;

  @ApiProperty({ type: "integer", minimum: 1, maximum: 65_536 })
  sampled_pixel_count!: number;
}

export class VisualProfileSignalDto {
  @ApiProperty({ enum: SIGNAL_KEYS })
  key!: (typeof SIGNAL_KEYS)[number];

  @ApiProperty({ type: "number", minimum: 0, maximum: 1 })
  value!: number;

  @ApiProperty({ enum: ["normalized_0_1"] })
  unit!: "normalized_0_1";

  @ApiProperty({
    enum: ["measured_technical_signal", "heuristic_technical_signal"],
  })
  kind!: "measured_technical_signal" | "heuristic_technical_signal";

  @ApiProperty({ maxLength: 160 })
  method!: string;
}

export class VisualStimulusProfileDto implements VisualStimulusProfile {
  @ApiProperty({ enum: ["1.0.0"] })
  schema_version!: "1.0.0";

  @ApiProperty({ format: "uuid", example: UUID_EXAMPLE })
  analysis_id!: string;

  @ApiProperty({ type: VisualProfileAssetDto })
  asset!: VisualProfileAssetDto;

  @ApiProperty({ type: VisualProfileProviderDto })
  provider!: VisualProfileProviderDto;

  @ApiProperty({ enum: ["technical_image_signals_v1"] })
  methodology_version!: "technical_image_signals_v1";

  @ApiProperty({ enum: ["technical_image_signals_only"] })
  analysis_scope!: "technical_image_signals_only";

  @ApiProperty({ enum: ["experimental"] })
  validation_label!: "experimental";

  @ApiProperty({ type: VisualProfileDimensionsDto })
  dimensions!: VisualProfileDimensionsDto;

  @ApiProperty({ type: VisualProfileSamplingDto })
  sampling!: VisualProfileSamplingDto;

  @ApiProperty({
    type: VisualProfileSignalDto,
    isArray: true,
    minItems: 9,
    maxItems: 9,
  })
  signals!: readonly VisualProfileSignalDto[];

  @ApiProperty({ enum: [false] })
  behavioral_interpretation!: false;

  @ApiProperty({ enum: [false] })
  population_inference!: false;

  @ApiProperty({ enum: [false] })
  retained_embedded_metadata!: false;

  @ApiProperty({
    type: "array",
    items: { type: "string" },
    minItems: 2,
    maxItems: 2,
  })
  limitations!: readonly [
    "Measures technical image signals only; it does not identify objects, text, brand meaning, emotion, persuasion, or aesthetic quality.",
    "It is not observed human evidence or evidence of campaign performance.",
  ];

  @ApiProperty({ pattern: SHA256_PATTERN })
  checksum_sha256!: string;
}

export class VisualStimulusProfileRecordDto implements VisualStimulusProfileRecord {
  @ApiProperty({ format: "uuid", example: UUID_EXAMPLE })
  analysis_id!: string;

  @ApiProperty({ format: "uuid", example: UUID_EXAMPLE })
  asset_id!: string;

  @ApiProperty({ format: "uuid", example: UUID_EXAMPLE })
  organization_id!: string;

  @ApiProperty({ format: "uuid", example: UUID_EXAMPLE })
  stimulus_id!: string;

  @ApiProperty({ pattern: SHA256_PATTERN })
  asset_content_sha256!: string;

  @ApiProperty({ pattern: SHA256_PATTERN })
  profile_checksum_sha256!: string;

  @ApiProperty({ type: VisualStimulusProfileDto })
  profile!: VisualStimulusProfileDto;

  @ApiProperty({ format: "date-time" })
  created_at!: string;

  @ApiProperty()
  replayed!: boolean;
}

export class VisualStimulusProfileResponseDto {
  @ApiProperty({ type: VisualStimulusProfileRecordDto })
  data!: VisualStimulusProfileRecordDto;
}
