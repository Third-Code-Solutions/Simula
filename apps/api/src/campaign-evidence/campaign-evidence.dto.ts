import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from "class-validator";

const EVIDENCE_STATUSES = [
  "queued",
  "running",
  "retrying",
  "completed",
  "failed",
  "cancel_requested",
  "canceled",
] as const;

const EVIDENCE_STAGES = [
  "admitted",
  "executing",
  "validating",
  "evaluating",
  "persisting",
  "retrying",
  "completed",
  "failed",
  "cancel_requested",
  "canceled",
] as const;

export class SurveyCalibrationCreateDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  source_version_id!: string;

  @ApiProperty({ type: "array", minItems: 1, maxItems: 10000 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10000)
  synthetic_observations!: readonly Readonly<Record<string, unknown>>[];

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  survey?: Readonly<Record<string, unknown>>;

  @ApiPropertyOptional({
    type: "object",
    additionalProperties: true,
    description:
      "Optional CSV, Formbricks, ODK, or generic JSON aggregate-only import request.",
  })
  @IsOptional()
  @IsObject()
  survey_import?: Readonly<Record<string, unknown>>;
}

export class HistoricalBacktestCreateDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  outcome_set_id!: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  @IsObject()
  protocol!: Readonly<Record<string, unknown>>;

  @ApiProperty({ type: "object", additionalProperties: true })
  @IsObject()
  prediction_set!: Readonly<Record<string, unknown>>;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  baseline_prediction_set?: Readonly<Record<string, unknown>>;

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description:
      "Held-out outcomes are accepted for the blind evaluator and are never returned by the API.",
  })
  @IsObject()
  outcomes!: Readonly<Record<string, unknown>>;
}

export class CampaignEvidenceRunResponseDto {
  @ApiProperty({ format: "uuid" })
  evidence_id!: string;

  @ApiProperty({ format: "uuid" })
  organization_id!: string;

  @ApiProperty({ format: "uuid" })
  project_id!: string;

  @ApiProperty({ enum: ["survey_calibration", "historical_backtest"] })
  kind!: "survey_calibration" | "historical_backtest";

  @ApiProperty({ enum: EVIDENCE_STATUSES })
  status!: (typeof EVIDENCE_STATUSES)[number];

  @ApiProperty({ enum: EVIDENCE_STAGES })
  stage!: (typeof EVIDENCE_STAGES)[number];

  @ApiProperty({ minimum: 0, maximum: 100 })
  progress!: number;

  @ApiPropertyOptional({ format: "uuid" })
  source_version_id!: string | null;

  @ApiPropertyOptional({ format: "uuid" })
  outcome_set_id!: string | null;

  @ApiProperty({ format: "date-time" })
  @IsISO8601()
  created_at!: string;

  @ApiProperty({ format: "date-time" })
  @IsISO8601()
  retention_until!: string;

  @ApiPropertyOptional({ format: "date-time" })
  started_at!: string | null;

  @ApiPropertyOptional({ format: "date-time" })
  completed_at!: string | null;

  @ApiProperty({ minimum: 0, maximum: 10 })
  @IsInt()
  @Min(0)
  @Max(10)
  attempt_count!: number;

  @ApiPropertyOptional()
  last_error_code!: string | null;

  @ApiPropertyOptional()
  last_error_detail!: string | null;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  result!: Readonly<Record<string, unknown>> | null;

  @ApiProperty()
  replayed!: boolean;
}

export class CampaignEvidenceEventDto {
  @ApiProperty({ format: "uuid" })
  event_id!: string;

  @ApiProperty({ format: "uuid" })
  evidence_id!: string;

  @ApiProperty({ enum: EVIDENCE_STAGES })
  stage!: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  progress!: number;

  @ApiProperty({
    enum: [
      "queued",
      "started",
      "progress",
      "completed",
      "retrying",
      "failed",
      "canceled",
    ],
  })
  event_kind!: string;

  @ApiPropertyOptional()
  message!: string | null;

  @ApiProperty({ format: "date-time" })
  created_at!: string;
}

export class CampaignEvidenceEventCollectionDto {
  @ApiProperty({ type: () => [CampaignEvidenceEventDto] })
  items!: readonly CampaignEvidenceEventDto[];
}
