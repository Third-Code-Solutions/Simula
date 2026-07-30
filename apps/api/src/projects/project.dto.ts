import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

import { StimulusResponseDto } from "../stimuli/stimulus.dto";

const OBJECTIVE_PATTERN = /[^\s]/;

export class ProjectCreateDto {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @Length(1, 1000)
  @Matches(OBJECTIVE_PATTERN)
  objective!: string;

  @ApiProperty({ enum: ["philippines"] })
  @IsIn(["philippines"])
  market!: "philippines";

  @ApiProperty({ enum: ["en"] })
  @IsIn(["en"])
  language!: "en";

  @ApiProperty({ enum: ["campaign_message"] })
  @IsIn(["campaign_message"])
  category!: "campaign_message";
}

export class ProjectPatchDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 80, nullable: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(2, 80)
  name?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 1000, nullable: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 1000)
  @Matches(OBJECTIVE_PATTERN)
  objective?: string;

  @ApiPropertyOptional({ enum: ["philippines"], nullable: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(["philippines"])
  market?: "philippines";

  @ApiPropertyOptional({ enum: ["en"], nullable: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(["en"])
  language?: "en";

  @ApiPropertyOptional({ enum: ["campaign_message"], nullable: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(["campaign_message"])
  category?: "campaign_message";
}

export class ProjectResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  organization_id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  objective!: string;

  @ApiProperty({ enum: ["philippines"] })
  market!: "philippines";

  @ApiProperty({ enum: ["en"] })
  language!: "en";

  @ApiProperty({ enum: ["campaign_message"] })
  category!: "campaign_message";

  @ApiProperty({ enum: ["active", "archived", "deleted"] })
  status!: "active" | "archived" | "deleted";

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ format: "date-time" })
  created_at!: string;

  @ApiProperty({ format: "date-time" })
  updated_at!: string;
}

export class ProjectDetailDto extends ProjectResponseDto {
  @ApiProperty({ type: () => [StimulusResponseDto] })
  @ValidateNested({ each: true })
  @Type(() => StimulusResponseDto)
  stimuli!: readonly StimulusResponseDto[];
}

export class ProjectPageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 2048)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 25;
}

export class ProjectPageDto {
  @ApiProperty({ type: () => [ProjectResponseDto] })
  @ValidateNested({ each: true })
  @Type(() => ProjectResponseDto)
  items!: readonly ProjectResponseDto[];

  @ApiProperty({ nullable: true })
  next_cursor!: string | null;
}
