import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  Length,
  Matches,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from "class-validator";

const AUDIENCE_ATTRIBUTE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

@ValidatorConstraint({ name: "audienceCriterionValue", async: false })
class AudienceCriterionValueConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === "string" ||
      (Array.isArray(value) && value.every((item) => typeof item === "string"))
    );
  }

  defaultMessage(): string {
    return "value must be a string or an array of strings";
  }
}

export class AudienceCriterionDto {
  @ApiProperty({ pattern: "^[a-z][a-z0-9_]{0,63}$" })
  @IsString()
  @Matches(AUDIENCE_ATTRIBUTE_PATTERN)
  attribute!: string;

  @ApiProperty({ enum: ["equals", "in", "not_equals"] })
  @IsIn(["equals", "in", "not_equals"])
  operator!: "equals" | "in" | "not_equals";

  @ApiProperty({
    oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
  })
  @Validate(AudienceCriterionValueConstraint)
  value!: string | string[];
}

export class AudienceManifestDto {
  @ApiProperty({ enum: [1], default: 1 })
  @IsIn([1])
  schema_version: 1 = 1;

  @ApiProperty({ type: () => [AudienceCriterionDto], maxItems: 20 })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AudienceCriterionDto)
  criteria!: AudienceCriterionDto[];

  @ApiProperty({ enum: ["demo", "verified"] })
  @IsIn(["demo", "verified"])
  provenance_status!: "demo" | "verified";

  @ApiProperty()
  @IsBoolean()
  non_representative!: boolean;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @Length(1, 500)
  target_population!: string;
}

export class AudienceCreateDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ type: () => AudienceManifestDto })
  @ValidateNested()
  @Type(() => AudienceManifestDto)
  manifest!: AudienceManifestDto;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @Length(1, 1000)
  limitations!: string;
}

export class AudienceCommandResponseDto {
  @ApiProperty({ format: "uuid" })
  audience_id!: string;

  @ApiProperty({ format: "uuid" })
  audience_version_id!: string;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ["synthetic_cohort"] })
  kind!: "synthetic_cohort";

  @ApiProperty({ enum: ["approved_experimental"] })
  admission_status!: "approved_experimental";

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  checksum_sha256!: string;

  @ApiProperty({ format: "date-time" })
  created_at!: string;

  @ApiProperty()
  replayed!: boolean;
}

export class AudienceRecordDto {
  @ApiProperty({ format: "uuid" })
  audience_id!: string;

  @ApiProperty({ format: "uuid" })
  audience_version_id!: string;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ["synthetic_cohort"] })
  kind!: "synthetic_cohort";

  @ApiProperty({ enum: ["approved_experimental"] })
  admission_status!: "approved_experimental";

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  checksum_sha256!: string;

  @ApiProperty({ format: "date-time" })
  created_at!: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  manifest!: Readonly<Record<string, unknown>>;

  @ApiProperty()
  is_non_representative!: boolean;

  @ApiProperty()
  limitations!: string;
}

export class AudienceCollectionResponseDto {
  @ApiProperty({ type: () => [AudienceRecordDto] })
  items!: readonly AudienceRecordDto[];
}

export class AudienceDisclosureResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ enum: ["authored_demo"] })
  kind!: "authored_demo";

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  checksum_sha256!: string;

  @ApiProperty({ enum: [true] })
  non_representative!: true;

  @ApiProperty({
    type: [String],
    enum: ["Estimates nobody and is not representative of any population."],
  })
  limitations!: readonly [
    "Estimates nobody and is not representative of any population.",
  ];

  @ApiProperty({ enum: ["phase2_demo_v1"] })
  disclosure_version!: "phase2_demo_v1";

  @ApiProperty()
  purpose!: string;

  @ApiProperty({ type: [String], minItems: 1 })
  prohibited_uses!: readonly string[];

  @ApiProperty()
  owner!: string;

  @ApiProperty()
  source!: string;

  @ApiProperty({ type: [String], minItems: 1 })
  dependencies!: readonly string[];

  @ApiProperty()
  transformation!: string;

  @ApiProperty()
  scope!: string;

  @ApiProperty()
  lifecycle!: string;
}
