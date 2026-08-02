import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { Equals, IsString, IsUUID, Matches } from "class-validator";

export class SimulationRunCreateDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  stimulus_version_id!: string;
}

export class BehavioralDemoRunCreateDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  stimulus_version_id!: string;

  @ApiProperty({
    pattern: "^[a-z][a-z0-9_]{0,63}$",
    example: "baseline",
  })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,63}$/)
  variant_key!: string;
}

export class SimulationRunCancelDto {
  @Equals(undefined)
  private readonly _empty?: never;
}

export class SimulationRunFailureDto {
  @ApiProperty({ pattern: "^[a-z][a-z0-9_]{0,63}$" })
  code!: string;

  @ApiProperty({ format: "uuid" })
  correlation_id!: string;

  @ApiProperty({
    enum: [
      "No substitute result was generated. Retry or use the correlation ID for support.",
    ],
  })
  guidance!: "No substitute result was generated. Retry or use the correlation ID for support.";
}

export class SimulationRunResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  organization_id!: string;

  @ApiProperty({ format: "uuid" })
  project_id!: string;

  @ApiProperty({ format: "uuid" })
  stimulus_version_id!: string;

  @ApiProperty({ format: "uuid" })
  audience_version_id!: string;

  @ApiProperty({
    enum: [
      "queued",
      "running",
      "retrying",
      "cancel_requested",
      "succeeded",
      "failed",
      "canceled",
    ],
  })
  state!:
    | "queued"
    | "running"
    | "retrying"
    | "cancel_requested"
    | "succeeded"
    | "failed"
    | "canceled";

  @ApiProperty({ enum: [1, 2] })
  schema_version!: 1 | 2;

  @ApiProperty({ minimum: 1, maximum: 3 })
  dispatch_generation!: number;

  @ApiProperty({
    oneOf: [
      {
        pattern:
          "^run:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:dispatch:[1-3]$",
      },
      {
        pattern:
          "^run-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-generation-[1-3]$",
      },
    ],
  })
  job_id!: string;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ format: "date-time" })
  created_at!: string;

  @ApiPropertyOptional({
    type: () => SimulationRunFailureDto,
    nullable: true,
  })
  failure!: SimulationRunFailureDto | null;
}

export class RunAuditEventDto {
  @ApiProperty({ format: "uuid" })
  event_id!: string;

  @ApiPropertyOptional({
    enum: [
      "queued",
      "running",
      "retrying",
      "cancel_requested",
      "succeeded",
      "failed",
      "canceled",
    ],
    nullable: true,
  })
  previous_state!:
    | "queued"
    | "running"
    | "retrying"
    | "cancel_requested"
    | "succeeded"
    | "failed"
    | "canceled"
    | null;

  @ApiProperty({
    enum: [
      "queued",
      "running",
      "retrying",
      "cancel_requested",
      "succeeded",
      "failed",
      "canceled",
    ],
  })
  new_state!:
    | "queued"
    | "running"
    | "retrying"
    | "cancel_requested"
    | "succeeded"
    | "failed"
    | "canceled";

  @ApiPropertyOptional({ minimum: 1, maximum: 3, nullable: true })
  attempt_number!: number | null;

  @ApiPropertyOptional({
    pattern: "^[a-z][a-z0-9_]{0,63}$",
    nullable: true,
  })
  safe_reason!: string | null;

  @ApiProperty({ enum: ["user", "worker", "system"] })
  actor_type!: "user" | "worker" | "system";

  @ApiProperty({ format: "uuid" })
  correlation_id!: string;

  @ApiProperty({ format: "date-time" })
  created_at!: string;
}

export class RunAuditHistoryResponseDto {
  @ApiProperty({ format: "uuid" })
  run_id!: string;

  @ApiProperty({
    type: () => [RunAuditEventDto],
    minItems: 1,
    maxItems: 50,
  })
  events!: readonly RunAuditEventDto[];

  @ApiProperty({
    enum: [
      "Run state evidence only. Actor identities, payloads, prompts, agent memory, rationale, and free-form metadata are excluded.",
    ],
  })
  disclosure!: "Run state evidence only. Actor identities, payloads, prompts, agent memory, rationale, and free-form metadata are excluded.";
}

export class SimulationResultArtifactDto {
  @ApiProperty({ enum: ["1.0.0"] })
  schema_version!: "1.0.0";

  @ApiProperty({ format: "uuid" })
  run_id!: string;

  @ApiProperty({ enum: ["experimental"] })
  validation_label!: "experimental";

  @ApiProperty({
    type: "array",
    minItems: 1,
    maxItems: 1,
    items: {
      type: "object",
      description:
        "Runtime-validated against @simula/contracts/result.schema.json.",
    },
  })
  outputs!: readonly Readonly<Record<string, unknown>>[];

  @ApiProperty({ type: "array", items: { type: "object" } })
  qualitative!: readonly Readonly<Record<string, unknown>>[];

  @ApiProperty({ type: "array", items: { type: "object" } })
  recommendations!: readonly Readonly<Record<string, unknown>>[];

  @ApiProperty({ type: "object", additionalProperties: true })
  provenance!: Readonly<Record<string, unknown>>;

  @ApiProperty({ type: [String] })
  limitations!: readonly string[];
}

export class SimulationResultResponseDto {
  @ApiProperty({ format: "uuid" })
  run_id!: string;

  @ApiProperty({ enum: [1] })
  schema_version!: 1;

  @ApiProperty({ type: () => SimulationResultArtifactDto })
  result!: SimulationResultArtifactDto;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  artifact_sha256!: string;

  @ApiProperty({ format: "date-time" })
  created_at!: string;
}

export type BehavioralActionKind =
  | "attend"
  | "resonate"
  | "question"
  | "reject"
  | "share"
  | "discuss"
  | "reconsider"
  | "ignore";

export class BehavioralScoreDto {
  @ApiProperty({ enum: ["attention", "resonance", "trust"] })
  key!: "attention" | "resonance" | "trust";

  @ApiProperty({ enum: ["heuristic"] })
  score_type!: "heuristic";

  @ApiProperty({ minimum: 0, maximum: 100 })
  value!: number;

  @ApiProperty({ enum: ["synthetic_points"] })
  unit!: "synthetic_points";

  @ApiProperty({ enum: ["weighted_synthetic_agent_mean"] })
  method!: "weighted_synthetic_agent_mean";

  @ApiProperty({
    type: [String],
    format: "uuid",
    minItems: 1,
    maxItems: 2000,
  })
  evidence_event_ids!: readonly string[];
}

export class BehavioralUncertaintyDto {
  @ApiProperty({
    enum: ["synthetic_agent_dispersion_not_population_uncertainty"],
  })
  uncertainty_type!: "synthetic_agent_dispersion_not_population_uncertainty";

  @ApiProperty({ minimum: 1 })
  effective_agent_count!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  attention_weighted_standard_deviation!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  resonance_weighted_standard_deviation!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  trust_weighted_standard_deviation!: number;

  @ApiProperty({ type: [String], minItems: 1 })
  limitations!: readonly string[];
}

export class BehavioralFindingDto {
  @ApiProperty({ pattern: "^[a-z][a-z0-9_]{0,63}$" })
  finding_id!: string;

  @ApiProperty({
    enum: ["heuristic", "qualitative", "recommendation"],
  })
  output_type!: "heuristic" | "qualitative" | "recommendation";

  @ApiProperty({ minLength: 1, maxLength: 120 })
  title!: string;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  detail!: string;

  @ApiProperty({
    type: [String],
    format: "uuid",
    minItems: 1,
    maxItems: 100,
  })
  evidence_event_ids!: readonly string[];
}

export class BehavioralNarrativeSynthesisDto {
  @ApiProperty({ enum: ["qualitative"] })
  output_type!: "qualitative";

  @ApiProperty({ enum: ["synthetic_agent_explanation"] })
  claim_scope!: "synthetic_agent_explanation";

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  summary!: string;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 50,
    pattern: "^[a-z][a-z0-9_]{0,63}$",
  })
  evidence_finding_ids!: readonly string[];

  @ApiProperty({ type: [String], minItems: 1 })
  limitations!: readonly string[];
}

export class BehavioralReportDto {
  @ApiProperty({
    type: "array",
    minItems: 8,
    maxItems: 8,
    items: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      prefixItems: [
        {
          type: "string",
          enum: [
            "attend",
            "resonate",
            "question",
            "reject",
            "share",
            "discuss",
            "reconsider",
            "ignore",
          ],
        },
        { type: "number", minimum: 0, maximum: 1 },
      ],
    } as never,
  })
  action_shares!: readonly (readonly [BehavioralActionKind, number])[];

  @ApiProperty({ minimum: 0, maximum: 100 })
  mean_attention!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  mean_resonance!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  mean_trust!: number;

  @ApiProperty({
    type: () => [BehavioralScoreDto],
    minItems: 3,
    maxItems: 3,
  })
  scores!: readonly [
    BehavioralScoreDto,
    BehavioralScoreDto,
    BehavioralScoreDto,
  ];

  @ApiProperty({ type: () => BehavioralUncertaintyDto })
  uncertainty!: BehavioralUncertaintyDto;

  @ApiProperty({ type: () => [BehavioralFindingDto] })
  findings!: readonly BehavioralFindingDto[];

  @ApiProperty({ type: () => BehavioralNarrativeSynthesisDto })
  synthesis!: BehavioralNarrativeSynthesisDto;

  @ApiProperty({ enum: ["experimental"] })
  validation_label!: "experimental";

  @ApiProperty({ type: [String], minItems: 1 })
  limitations!: readonly string[];
}

export class BehavioralResultResponseDto {
  @ApiProperty({ format: "uuid" })
  run_id!: string;

  @ApiProperty({ format: "uuid" })
  study_id!: string;

  @ApiProperty({ pattern: "^[a-z][a-z0-9_]{0,63}$" })
  variant_key!: string;

  @ApiProperty({ enum: [1] })
  schema_version!: 1;

  @ApiProperty({ pattern: "^[a-z][a-z0-9_]{0,63}$" })
  methodology_version!: string;

  @ApiProperty({ enum: ["experimental"] })
  validation_label!: "experimental";

  @ApiProperty({ enum: ["deterministic_tiered"] })
  provider_id!: "deterministic_tiered";

  @ApiProperty({ enum: ["1"] })
  provider_version!: "1";

  @ApiProperty({ enum: ["deterministic_behavior_fixture_v1"] })
  model_id!: "deterministic_behavior_fixture_v1";

  @ApiProperty({ enum: ["behavioral_action_v1"] })
  template_id!: "behavioral_action_v1";

  @ApiProperty({ minimum: 1, maximum: 10000 })
  provider_calls!: number;

  @ApiProperty({ pattern: "^(0|[1-9][0-9]*)$" })
  input_tokens!: string;

  @ApiProperty({ pattern: "^(0|[1-9][0-9]*)$" })
  output_tokens!: string;

  @ApiProperty({ pattern: "^(0|[1-9][0-9]*)$" })
  cost_microusd!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  context_graph_sha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  agent_fleet_sha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  input_sha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  stimulus_sha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  output_sha256!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  artifact_sha256!: string;

  @ApiProperty({ minimum: 1, maximum: 16000000 })
  artifact_size_bytes!: number;

  @ApiProperty({ type: () => BehavioralReportDto })
  report!: BehavioralReportDto;

  @ApiProperty({ format: "date-time" })
  created_at!: string;
}

export class EvidenceProvenanceDto {
  @ApiProperty({ pattern: "^[a-z][a-z0-9_]{0,63}$" })
  source_id!: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  source_version!: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  owner!: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  license!: string;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  allowed_use!: string;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  collected_at!: string;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  transformation!: string;

  @ApiProperty({ enum: ["experimental", "benchmarked"] })
  validation_status!: "experimental" | "benchmarked";
}

export class BehavioralContextNodeDto {
  @ApiProperty({ pattern: "^[a-z][a-z0-9_]{0,63}$" })
  node_id!: string;

  @ApiProperty({
    enum: [
      "stimulus_fact",
      "market_context",
      "cultural_context",
      "brand_constraint",
      "audience_evidence",
    ],
  })
  kind!:
    | "stimulus_fact"
    | "market_context"
    | "cultural_context"
    | "brand_constraint"
    | "audience_evidence";

  @ApiProperty({ minLength: 1, maxLength: 120 })
  title!: string;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  content!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  content_sha256!: string;

  @ApiProperty({ type: () => EvidenceProvenanceDto })
  provenance!: EvidenceProvenanceDto;
}

export class BehavioralContextEdgeDto {
  @ApiProperty({ pattern: "^[a-z][a-z0-9_]{0,63}$" })
  source_node_id!: string;

  @ApiProperty({ pattern: "^[a-z][a-z0-9_]{0,63}$" })
  target_node_id!: string;

  @ApiProperty({
    enum: ["supports", "qualifies", "contradicts", "constrains", "applies_to"],
  })
  relationship!:
    "supports" | "qualifies" | "contradicts" | "constrains" | "applies_to";

  @ApiProperty({ minimum: 0, maximum: 1 })
  evidence_strength!: number;
}

export class BehavioralContextGraphDto {
  @ApiProperty({ format: "uuid" })
  graph_id!: string;

  @ApiProperty({ format: "uuid" })
  organization_id!: string;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({
    type: () => [BehavioralContextNodeDto],
    minItems: 1,
    maxItems: 500,
  })
  nodes!: readonly BehavioralContextNodeDto[];

  @ApiProperty({
    type: () => [BehavioralContextEdgeDto],
    maxItems: 2000,
  })
  edges!: readonly BehavioralContextEdgeDto[];

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  checksum_sha256!: string;

  @ApiProperty({ type: [String], minItems: 1 })
  limitations!: readonly string[];
}

export class BehavioralEvidenceSummaryDto {
  @ApiProperty({ enum: ["finding", "score"] })
  evidence_kind!: "finding" | "score";

  @ApiProperty({ pattern: "^[a-z][a-z0-9_]{0,63}$" })
  evidence_key!: string;

  @ApiProperty({
    enum: ["heuristic", "qualitative", "recommendation"],
  })
  output_type!: "heuristic" | "qualitative" | "recommendation";

  @ApiProperty({ minimum: 1, maximum: 10000 })
  event_count!: number;

  @ApiProperty({
    type: [String],
    format: "uuid",
    minItems: 1,
    maxItems: 10,
  })
  sample_event_ids!: readonly string[];
}

export class BehavioralFleetSummaryDto {
  @ApiProperty({ minimum: 10, maximum: 2000 })
  agent_count!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  llm_agent_count!: number;

  @ApiProperty({ minimum: 0, maximum: 2000 })
  rule_agent_count!: number;

  @ApiProperty({ minimum: 1, maximum: 2000 })
  cohort_count!: number;

  @ApiProperty({ minimum: 0, maximum: 4_000_000 })
  relationship_count!: number;

  @ApiProperty({ enum: [true] })
  synthetic_identity!: true;
}

export class BehavioralRoundSummaryDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  round_index!: number;

  @ApiProperty({ minimum: 10, maximum: 2000 })
  event_count!: number;

  @ApiProperty({
    type: "array",
    minItems: 8,
    maxItems: 8,
    items: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      prefixItems: [
        {
          type: "string",
          enum: [
            "attend",
            "resonate",
            "question",
            "reject",
            "share",
            "discuss",
            "reconsider",
            "ignore",
          ],
        },
        { type: "number", minimum: 0, maximum: 1 },
      ],
    } as never,
  })
  action_shares!: readonly (readonly [BehavioralActionKind, number])[];

  @ApiProperty({ minimum: -1, maximum: 1 })
  mean_valence!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  mean_attention!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  mean_resonance!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  mean_trust!: number;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 500,
    pattern: "^[a-z][a-z0-9_]{0,63}$",
  })
  evidence_node_ids!: readonly string[];

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  checksum_sha256!: string;
}

export class BehavioralSyntheticInterviewDto {
  @ApiProperty({ enum: ["fixed_replay_summary"] })
  interview_kind!: "fixed_replay_summary";

  @ApiProperty({ format: "uuid" })
  synthetic_agent_id!: string;

  @ApiProperty({ enum: ["llm", "rule"] })
  tier!: "llm" | "rule";

  @ApiProperty({ minimum: 1, maximum: 5 })
  round_count!: number;

  @ApiProperty({
    enum: [
      "attend",
      "resonate",
      "question",
      "reject",
      "share",
      "discuss",
      "reconsider",
      "ignore",
    ],
  })
  latest_action!: BehavioralActionKind;

  @ApiProperty({
    type: [String],
    format: "uuid",
    minItems: 1,
    maxItems: 5,
  })
  evidence_event_ids!: readonly string[];

  @ApiProperty({
    enum: ["What did this synthetic agent do in its final simulated round?"],
  })
  prompt!: "What did this synthetic agent do in its final simulated round?";

  @ApiProperty({ minLength: 1, maxLength: 300 })
  response_summary!: string;

  @ApiProperty({
    enum: [
      "Generated from recorded synthetic actions; not a human statement or testimony.",
    ],
  })
  disclosure!: "Generated from recorded synthetic actions; not a human statement or testimony.";
}

export class BehavioralEvidenceResponseDto {
  @ApiProperty({ format: "uuid" })
  run_id!: string;

  @ApiProperty({ type: () => BehavioralContextGraphDto })
  context_graph!: BehavioralContextGraphDto;

  @ApiProperty({ format: "date-time" })
  context_graph_created_at!: string;

  @ApiProperty({
    type: () => [BehavioralEvidenceSummaryDto],
    maxItems: 100,
  })
  evidence_summary!: readonly BehavioralEvidenceSummaryDto[];

  @ApiProperty({ type: () => BehavioralFleetSummaryDto })
  fleet_summary!: BehavioralFleetSummaryDto;

  @ApiProperty({
    type: () => [BehavioralRoundSummaryDto],
    minItems: 1,
    maxItems: 5,
  })
  rounds!: readonly BehavioralRoundSummaryDto[];

  @ApiProperty({
    type: () => [BehavioralSyntheticInterviewDto],
    maxItems: 10,
  })
  synthetic_interviews!: readonly BehavioralSyntheticInterviewDto[];

  @ApiProperty({ type: [String], minItems: 3, maxItems: 3 })
  public_summary_limitations!: readonly [string, string, string];
}

export class BehavioralMetricDeltaDto {
  @ApiProperty({ enum: ["attention", "resonance", "trust"] })
  key!: "attention" | "resonance" | "trust";

  @ApiProperty({ minimum: -100, maximum: 100 })
  candidate_minus_baseline!: number;
}

export class BehavioralActionShareDeltaDto {
  @ApiProperty({
    enum: [
      "attend",
      "resonate",
      "question",
      "reject",
      "share",
      "discuss",
      "reconsider",
      "ignore",
    ],
  })
  key!: BehavioralActionKind;

  @ApiProperty({ minimum: -1, maximum: 1 })
  candidate_minus_baseline!: number;
}

export class BehavioralComparisonResponseDto {
  @ApiProperty({ format: "uuid" })
  study_id!: string;

  @ApiProperty({ format: "uuid" })
  baseline_run_id!: string;

  @ApiProperty({ format: "uuid" })
  candidate_run_id!: string;

  @ApiProperty({ minimum: 10, maximum: 2000 })
  paired_agents!: number;

  @ApiProperty({
    type: () => [BehavioralMetricDeltaDto],
    minItems: 3,
    maxItems: 3,
  })
  metric_deltas!: readonly [
    BehavioralMetricDeltaDto,
    BehavioralMetricDeltaDto,
    BehavioralMetricDeltaDto,
  ];

  @ApiProperty({
    type: () => [BehavioralActionShareDeltaDto],
    minItems: 8,
    maxItems: 8,
  })
  action_share_deltas!: readonly [
    BehavioralActionShareDeltaDto,
    BehavioralActionShareDeltaDto,
    BehavioralActionShareDeltaDto,
    BehavioralActionShareDeltaDto,
    BehavioralActionShareDeltaDto,
    BehavioralActionShareDeltaDto,
    BehavioralActionShareDeltaDto,
    BehavioralActionShareDeltaDto,
  ];

  @ApiProperty({ enum: ["experimental_matched_synthetic_difference"] })
  interpretation!: "experimental_matched_synthetic_difference";

  @ApiProperty({ nullable: true, enum: [null] })
  winner!: null;

  @ApiProperty({ type: [String], minItems: 2, maxItems: 2 })
  limitations!: readonly [string, string];
}

export class ProvenanceStimulusDto {
  @ApiProperty({ format: "uuid" })
  version_id!: string;

  @ApiProperty({ minLength: 1, maxLength: 5000 })
  content!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  content_sha256!: string;
}

export class ProvenanceAudienceCellDto {
  @ApiProperty({ enum: ["authored_demo"] })
  key!: "authored_demo";

  @ApiProperty({
    minimum: 0,
    maximum: 1,
    description: "Strictly greater than zero.",
  })
  weight!: number;
}

export class ProvenanceAudienceDto {
  @ApiProperty({ format: "uuid" })
  version_id!: string;

  @ApiProperty({ enum: ["authored_demo"] })
  kind!: "authored_demo";

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  checksum_sha256!: string;

  @ApiProperty({ type: () => [ProvenanceAudienceCellDto], minItems: 1 })
  cells!: readonly ProvenanceAudienceCellDto[];

  @ApiProperty({ enum: [true] })
  non_representative!: true;

  @ApiProperty({
    type: [String],
    enum: ["Estimates nobody and is not representative of any population."],
  })
  limitations!: readonly string[];
}

export class ProvenanceExecutionDto {
  @ApiProperty({ enum: ["phase2_demo_v1"] })
  method_version!: "phase2_demo_v1";

  @ApiProperty({ enum: ["phase2_demo_v1"] })
  disclosure_version!: "phase2_demo_v1";

  @ApiProperty({ enum: ["en"] })
  language!: "en";

  @ApiProperty({ enum: [1] })
  output_schema_version!: 1;

  @ApiProperty({ enum: ["deterministic_mock"] })
  provider_id!: "deterministic_mock";

  @ApiProperty({ enum: [1] })
  provider_version!: 1;

  @ApiProperty({ enum: ["phase2_deterministic_mock_v1"] })
  pipeline_release_id!: "phase2_deterministic_mock_v1";

  @ApiProperty({ pattern: "^[0-9a-f]{40}$" })
  code_release_sha!: string;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  configuration_sha256!: string;
}

export class ProvenanceExecutionLimitsDto {
  @ApiProperty({ enum: ["phase2_2026_07_17"] })
  version!: "phase2_2026_07_17";

  @ApiProperty({ enum: [30] })
  arq_job_timeout_seconds!: 30;

  @ApiProperty({ enum: [0] })
  provider_cost_ceiling!: 0;

  @ApiProperty({ enum: [3] })
  max_database_attempts!: 3;

  @ApiProperty({ enum: [3] })
  max_dispatch_generations!: 3;

  @ApiProperty({ enum: [131072] })
  max_result_bytes!: 131072;
}

export class ProvenanceProviderUsageDto {
  @ApiProperty({ enum: [0] })
  input_tokens!: 0;

  @ApiProperty({ enum: [0] })
  output_tokens!: 0;

  @ApiProperty({ enum: [0] })
  cost_microusd!: 0;
}

export class ProvenanceProviderReceiptAvailableDto {
  @ApiProperty({ enum: ["available"] })
  availability!: "available";

  @ApiProperty({ enum: [1] })
  schema_version!: 1;

  @ApiProperty({ enum: ["successful_result"] })
  receipt_kind!: "successful_result";

  @ApiProperty({ enum: ["deterministic_mock"] })
  provider_id!: "deterministic_mock";

  @ApiProperty({ enum: [1] })
  provider_version!: 1;

  @ApiProperty({ enum: ["deterministic_fixture_v1"] })
  model_id!: "deterministic_fixture_v1";

  @ApiProperty({ enum: ["phase2_deterministic_mock_v1"] })
  template_id!: "phase2_deterministic_mock_v1";

  @ApiProperty({ enum: [1] })
  response_schema_version!: 1;

  @ApiProperty({ enum: ["completed"] })
  finish_status!: "completed";

  @ApiProperty({ type: () => ProvenanceProviderUsageDto })
  usage!: ProvenanceProviderUsageDto;

  @ApiProperty({ format: "date-time" })
  started_at!: string;

  @ApiProperty({ format: "date-time" })
  ended_at!: string;

  @ApiProperty({ nullable: true, enum: [null] })
  safe_error_class!: null;
}

export class ProvenanceProviderReceiptLegacyDto {
  @ApiProperty({ enum: ["legacy_unavailable"] })
  availability!: "legacy_unavailable";

  @ApiProperty({
    enum: ["successful_result_receipt_not_captured"],
  })
  unavailable_reason!: "successful_result_receipt_not_captured";
}

export type ProvenanceProviderReceiptDto =
  ProvenanceProviderReceiptAvailableDto | ProvenanceProviderReceiptLegacyDto;

@ApiExtraModels(
  ProvenanceProviderReceiptAvailableDto,
  ProvenanceProviderReceiptLegacyDto,
)
export class SimulationProvenanceResponseDto {
  @ApiProperty({ enum: ["available", "legacy_unavailable"] })
  availability!: "available" | "legacy_unavailable";

  @ApiPropertyOptional({
    nullable: true,
    enum: ["frozen_provenance_not_captured", null],
  })
  unavailable_reason!: "frozen_provenance_not_captured" | null;

  @ApiProperty({ format: "uuid" })
  run_id!: string;

  @ApiProperty({ format: "date-time" })
  created_at!: string;

  @ApiProperty({ format: "date-time", nullable: true })
  terminal_at!: string | null;

  @ApiProperty({ format: "date-time", nullable: true })
  result_created_at!: string | null;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  frozen_manifest_sha256!: string;

  @ApiProperty({ pattern: "^-?[0-9]{1,19}$" })
  deterministic_seed!: string;

  @ApiPropertyOptional({ type: () => ProvenanceStimulusDto, nullable: true })
  stimulus!: ProvenanceStimulusDto | null;

  @ApiPropertyOptional({ type: () => ProvenanceAudienceDto, nullable: true })
  audience!: ProvenanceAudienceDto | null;

  @ApiPropertyOptional({ type: () => ProvenanceExecutionDto, nullable: true })
  execution!: ProvenanceExecutionDto | null;

  @ApiPropertyOptional({
    type: () => ProvenanceExecutionLimitsDto,
    nullable: true,
  })
  limits!: ProvenanceExecutionLimitsDto | null;

  @ApiPropertyOptional({
    nullable: true,
    oneOf: [
      { $ref: getSchemaPath(ProvenanceProviderReceiptAvailableDto) },
      { $ref: getSchemaPath(ProvenanceProviderReceiptLegacyDto) },
    ],
    discriminator: { propertyName: "availability" },
  })
  provider_receipt!: ProvenanceProviderReceiptDto | null;
}
