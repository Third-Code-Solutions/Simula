import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

const ID_KEY_PATTERN = /^[a-z][a-z0-9_.]{0,63}$/;

export class RepeatedSimulationConfigurationDto {
  @ApiProperty({ minimum: 3, maximum: 10 })
  @IsInt()
  @Min(3)
  @Max(10)
  repetition_count!: number;

  @ApiProperty({
    minimum: -9_223_372_036_854_775_808,
    maximum: 9_223_372_036_854_775_807,
  })
  @IsInt()
  base_seed!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  stability_tolerance!: number;
}

export class SamplingConfigurationDto {
  @ApiProperty({ minimum: 10, maximum: 5000 })
  @IsInt()
  @Min(10)
  @Max(5000)
  sample_size!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  minimum_per_cell!: number;

  @ApiProperty({ minimum: 1, maximum: 500 })
  @IsInt()
  @Min(1)
  @Max(500)
  maximum_cells!: number;

  @ApiProperty()
  @IsInt()
  seed!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  sparse_cell_threshold!: number;
}

export class SimulationConfigurationCreateDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  audience_version_id!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  population_frame_version_id!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  methodology_version_id!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  provider_configuration_version_id!: string;

  @ApiProperty({ type: () => SamplingConfigurationDto })
  @ValidateNested()
  @Type(() => SamplingConfigurationDto)
  sampling_configuration!: SamplingConfigurationDto;

  @ApiProperty({ minimum: 0, maximum: 100_000_000 })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  cost_ceiling_microusd!: number;
}

export class SimulationConfigurationResponseDto {
  @ApiProperty({ format: "uuid" })
  configuration_id!: string;

  @ApiProperty({ format: "uuid" })
  configuration_version_id!: string;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: "uuid" })
  project_id!: string;

  @ApiProperty({ format: "uuid" })
  audience_version_id!: string;

  @ApiProperty({ format: "uuid" })
  population_frame_version_id!: string;

  @ApiProperty({ format: "uuid" })
  methodology_version_id!: string;

  @ApiProperty({ format: "uuid" })
  provider_configuration_version_id!: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  sampling_configuration!: Readonly<Record<string, unknown>>;

  @ApiProperty({ minimum: 0 })
  cost_ceiling_microusd!: number;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  checksum_sha256!: string;

  @ApiProperty({ format: "date-time" })
  created_at!: string;

  @ApiProperty()
  replayed!: boolean;
}

export class SimulationConfigurationRecordDto {
  @ApiProperty({ format: "uuid" })
  configuration_id!: string;

  @ApiProperty({ format: "uuid" })
  configuration_version_id!: string;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: "uuid" })
  project_id!: string;

  @ApiProperty({ format: "uuid" })
  audience_version_id!: string;

  @ApiProperty({ format: "uuid" })
  population_frame_version_id!: string;

  @ApiProperty({ format: "uuid" })
  methodology_version_id!: string;

  @ApiProperty({ format: "uuid" })
  provider_configuration_version_id!: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  sampling_configuration!: Readonly<Record<string, unknown>>;

  @ApiProperty({ minimum: 0 })
  cost_ceiling_microusd!: number;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  checksum_sha256!: string;

  @ApiProperty({ format: "date-time" })
  created_at!: string;
}

export class SimulationConfigurationCollectionResponseDto {
  @ApiProperty({ type: () => [SimulationConfigurationRecordDto] })
  items!: readonly SimulationConfigurationRecordDto[];
}

export class MethodologyPreviewCreateDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  configuration_version_id!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  stimulus_version_id!: string;

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

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  run_id?: string;

  @ApiPropertyOptional({ type: () => RepeatedSimulationConfigurationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RepeatedSimulationConfigurationDto)
  repetition_configuration?: RepeatedSimulationConfigurationDto;
}

export class ProductCommandResponseDto {
  @ApiProperty({ type: "object", additionalProperties: true })
  data!: Readonly<Record<string, unknown>>;
}

export class MethodologyRegistryResponseDto {
  @ApiProperty({
    type: "array",
    items: { type: "object", additionalProperties: true },
  })
  population_frames!: readonly Readonly<Record<string, unknown>>[];

  @ApiProperty({
    type: "array",
    items: { type: "object", additionalProperties: true },
  })
  methodologies!: readonly Readonly<Record<string, unknown>>[];

  @ApiProperty({
    type: "array",
    items: { type: "object", additionalProperties: true },
  })
  providers!: readonly Readonly<Record<string, unknown>>[];
}
