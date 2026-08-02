import { ApiProperty } from "@nestjs/swagger";
import {
  Equals,
  IsIn,
  IsInt,
  IsISO8601,
  Matches,
  Max,
  Min,
} from "class-validator";

import { ASSET_MEDIA_TYPES, MAX_ASSET_BYTES } from "./asset-object-store";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_FILENAME_PATTERN = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9_. -]{0,119}$/;
const UUID_EXAMPLE = "00000000-0000-4000-8000-000000000001";

export class StimulusAssetReserveDto {
  @ApiProperty({ example: "campaign-concept.png", maxLength: 120 })
  @Matches(SAFE_FILENAME_PATTERN)
  filename!: string;

  @ApiProperty({ enum: ASSET_MEDIA_TYPES, example: "image/png" })
  @IsIn(ASSET_MEDIA_TYPES)
  media_type!: (typeof ASSET_MEDIA_TYPES)[number];

  @ApiProperty({
    type: "integer",
    minimum: 1,
    maximum: MAX_ASSET_BYTES,
    example: 24576,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_ASSET_BYTES)
  byte_size!: number;

  @ApiProperty({ pattern: SHA256_PATTERN.source })
  @Matches(SHA256_PATTERN)
  content_sha256!: string;

  @ApiProperty({
    format: "date-time",
    description:
      "Retention must be more than five minutes and no more than 90 days.",
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  retention_until!: string;
}

export class StimulusAssetResponseDto {
  @ApiProperty({ format: "uuid", example: UUID_EXAMPLE })
  asset_id!: string;

  @ApiProperty({ format: "uuid", example: UUID_EXAMPLE })
  organization_id!: string;

  @ApiProperty({ format: "uuid", example: UUID_EXAMPLE })
  stimulus_id!: string;

  @ApiProperty({ example: "campaign-concept.png" })
  filename!: string;

  @ApiProperty({ enum: ASSET_MEDIA_TYPES })
  media_type!: (typeof ASSET_MEDIA_TYPES)[number];

  @ApiProperty({
    type: "integer",
    minimum: 1,
    maximum: MAX_ASSET_BYTES,
  })
  expected_byte_size!: number;

  @ApiProperty({ pattern: SHA256_PATTERN.source })
  expected_content_sha256!: string;

  @ApiProperty({
    type: "integer",
    nullable: true,
    minimum: 1,
    maximum: MAX_ASSET_BYTES,
  })
  byte_size!: number | null;

  @ApiProperty({
    type: "string",
    nullable: true,
    pattern: SHA256_PATTERN.source,
  })
  content_sha256!: string | null;

  @ApiProperty({
    enum: ["pending_upload", "available", "deletion_requested", "deleted"],
  })
  status!: "pending_upload" | "available" | "deletion_requested" | "deleted";

  @ApiProperty({ format: "date-time" })
  retention_until!: string;

  @ApiProperty({ format: "date-time" })
  created_at!: string;

  @ApiProperty()
  replayed!: boolean;
}

export class StimulusAssetCommandResponseDto {
  @ApiProperty({ type: StimulusAssetResponseDto })
  data!: StimulusAssetResponseDto;
}

export class StimulusAssetCollectionResponseDto {
  @ApiProperty({ type: StimulusAssetResponseDto, isArray: true })
  items!: StimulusAssetResponseDto[];
}

export class StimulusAssetDeleteDto {
  @Equals(undefined)
  private readonly _empty?: never;
}
