import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsString,
  Length,
  Matches,
  registerDecorator,
  type ValidationArguments,
  ValidateNested,
} from "class-validator";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function MaxUtf8Bytes(limit: number): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: "maxUtf8Bytes",
      target: target.constructor,
      propertyName: String(propertyName),
      constraints: [limit],
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const maximum = args.constraints[0] as number;
          return (
            typeof value === "string" &&
            Buffer.byteLength(value, "utf8") <= maximum
          );
        },
      },
    });
  };
}

export class StimulusCreateDto {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @IsString()
  @Length(1, 5000)
  @MaxUtf8Bytes(16_384)
  content!: string;
}

export class StimulusVersionAppendDto {
  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @IsString()
  @Length(1, 5000)
  @MaxUtf8Bytes(16_384)
  content!: string;
}

export class StimulusVersionResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  organization_id!: string;

  @ApiProperty({ format: "uuid" })
  stimulus_id!: string;

  @ApiProperty({ minimum: 1, maximum: 20 })
  version!: number;

  @ApiProperty()
  content!: string;

  @ApiProperty({ pattern: SHA256_PATTERN.source })
  @Matches(SHA256_PATTERN)
  content_sha256!: string;

  @ApiProperty({ format: "date-time" })
  created_at!: string;
}

export class StimulusResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  organization_id!: string;

  @ApiProperty({ format: "uuid" })
  project_id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ["active", "retired", "deleted"] })
  status!: "active" | "retired" | "deleted";

  @ApiProperty({ format: "date-time" })
  created_at!: string;

  @ApiProperty({ type: () => [StimulusVersionResponseDto] })
  @ValidateNested({ each: true })
  @Type(() => StimulusVersionResponseDto)
  versions!: readonly StimulusVersionResponseDto[];
}
