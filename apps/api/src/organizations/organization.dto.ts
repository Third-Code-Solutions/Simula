import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class OrganizationCreateDto {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(2, 80)
  name!: string;
}

export class OrganizationDeleteDto {
  @ApiProperty({
    description: "Exact workspace name required for irreversible deletion.",
    minLength: 2,
    maxLength: 80,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(2, 80)
  confirmation!: string;
}

export class OrganizationDeletionResponseDto {
  @ApiProperty({ format: "uuid" })
  request_id!: string;

  @ApiProperty({ format: "uuid" })
  organization_id!: string;

  @ApiProperty({ enum: ["pending", "completed"] })
  status!: "pending" | "completed";

  @ApiProperty({ format: "date-time" })
  requested_at!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  completed_at!: string | null;

  @ApiProperty()
  replayed!: boolean;
}

export class OrganizationPageQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 2048)
  cursor?: string;

  @ApiProperty({
    required: false,
    minimum: 1,
    maximum: 100,
    default: 25,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 25;
}

export class OrganizationResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ["owner", "editor", "viewer"] })
  role!: "owner" | "editor" | "viewer";

  @ApiProperty({ enum: ["active", "disabled", "deleted"] })
  status!: "active" | "disabled" | "deleted";

  @ApiProperty({ format: "date-time" })
  created_at!: string;
}

export class OrganizationDashboardPermissionsDto {
  @ApiProperty()
  can_create_projects!: boolean;

  @ApiProperty()
  can_create_runs!: boolean;

  @ApiProperty()
  can_manage_team!: boolean;

  @ApiProperty()
  can_manage_settings!: boolean;

  @ApiProperty()
  can_view_audit!: boolean;
}

export class OrganizationDashboardMetricsDto {
  @ApiProperty({ minimum: 0 })
  projects!: number;

  @ApiProperty({ minimum: 0 })
  audiences!: number;

  @ApiProperty({ minimum: 0 })
  runs!: number;

  @ApiProperty({ minimum: 0 })
  active_runs!: number;

  @ApiProperty({ minimum: 0 })
  succeeded_runs!: number;

  @ApiProperty({ minimum: 0 })
  failed_runs!: number;

  @ApiProperty({ minimum: 0 })
  reports!: number;

  @ApiProperty({ minimum: 0 })
  feedback_records!: number;
}

export class OrganizationDashboardProjectDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  objective!: string;

  @ApiProperty({ enum: ["active", "archived", "deleted"] })
  status!: "active" | "archived" | "deleted";

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ format: "date-time" })
  updated_at!: string;
}

export class OrganizationDashboardRunDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  project_id!: string;

  @ApiProperty()
  project_name!: string;

  @ApiProperty({
    enum: [
      "queued",
      "running",
      "retrying",
      "cancel_requested",
      "canceled",
      "succeeded",
      "failed",
    ],
  })
  state!:
    | "queued"
    | "running"
    | "retrying"
    | "cancel_requested"
    | "canceled"
    | "succeeded"
    | "failed";

  @ApiProperty({ format: "date-time" })
  created_at!: string;
}

export class OrganizationDashboardReportDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  run_id!: string;

  @ApiProperty({ format: "uuid" })
  project_id!: string;

  @ApiProperty()
  project_name!: string;

  @ApiProperty({ format: "date-time" })
  created_at!: string;
}

export class OrganizationDashboardResponseDto {
  @ApiProperty({ format: "uuid" })
  organization_id!: string;

  @ApiProperty()
  organization_name!: string;

  @ApiProperty({ enum: ["active", "disabled", "deleted"] })
  organization_status!: "active" | "disabled" | "deleted";

  @ApiProperty({ enum: ["owner", "editor", "viewer"] })
  role!: "owner" | "editor" | "viewer";

  @ApiProperty({ enum: ["superadmin"], nullable: true })
  platform_role!: "superadmin" | null;

  @ApiProperty({ type: () => OrganizationDashboardPermissionsDto })
  permissions!: OrganizationDashboardPermissionsDto;

  @ApiProperty({ type: () => OrganizationDashboardMetricsDto })
  metrics!: OrganizationDashboardMetricsDto;

  @ApiProperty({ type: () => [OrganizationDashboardProjectDto] })
  recent_projects!: readonly OrganizationDashboardProjectDto[];

  @ApiProperty({ type: () => [OrganizationDashboardRunDto] })
  recent_runs!: readonly OrganizationDashboardRunDto[];

  @ApiProperty({ type: () => [OrganizationDashboardReportDto] })
  recent_reports!: readonly OrganizationDashboardReportDto[];

  @ApiProperty({ format: "date-time" })
  generated_at!: string;
}

export class OrganizationPageDto {
  @ApiProperty({ type: () => [OrganizationResponseDto] })
  @ValidateNested({ each: true })
  @Type(() => OrganizationResponseDto)
  items!: readonly OrganizationResponseDto[];

  @ApiProperty({ nullable: true })
  next_cursor!: string | null;
}
