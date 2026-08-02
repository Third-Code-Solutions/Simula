import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";

import { RepeatedSimulationConfigurationDto } from "./methodology.dto";

const ID_KEY_PATTERN = /^[a-z][a-z0-9_.]{0,63}$/;
const VARIANT_KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const TIMEZONE_SUFFIX_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;

export class RunMethodologyReportCreateDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  configuration_version_id!: string;

  @ApiProperty({ pattern: "^[a-z][a-z0-9_.]{0,63}$" })
  @IsString()
  @Matches(ID_KEY_PATTERN)
  variant_key!: string;

  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(2, 120)
  variant_label!: string;

  @ApiPropertyOptional({ type: () => RepeatedSimulationConfigurationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RepeatedSimulationConfigurationDto)
  repetition_configuration?: RepeatedSimulationConfigurationDto;
}

export class VariantMemberInputDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  stimulus_version_id!: string;

  @ApiProperty({ pattern: "^[a-z][a-z0-9_]{0,31}$" })
  @IsString()
  @Matches(VARIANT_KEY_PATTERN)
  variant_key!: string;

  @ApiProperty({ minLength: 2, maxLength: 80 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(2, 80)
  label!: string;
}

export class VariantGroupCreateDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({
    type: () => [VariantMemberInputDto],
    minItems: 2,
    maxItems: 8,
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => VariantMemberInputDto)
  members!: VariantMemberInputDto[];
}

export class ReportExportCreateDto {
  @ApiProperty({ enum: ["json", "csv"] })
  @IsString()
  @IsIn(["json", "csv"])
  format!: "json" | "csv";

  @ApiProperty({ format: "date-time" })
  @IsString()
  @IsISO8601({ strict: true })
  @Matches(TIMEZONE_SUFFIX_PATTERN)
  expires_at!: string;
}

export class ProductCollectionResponseDto {
  @ApiProperty({
    type: "array",
    items: { type: "object", additionalProperties: true },
  })
  items!: readonly Readonly<Record<string, unknown>>[];
}
