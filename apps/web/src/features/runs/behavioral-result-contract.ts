import type { ControlPlaneComponents } from "@simula/contracts";
import { z } from "zod";

type BehavioralResultAuthority =
  ControlPlaneComponents["schemas"]["BehavioralResultResponseDto"];

const UUID = z.string().uuid();
const SHA256 = z.string().regex(/^[0-9a-f]{64}$/);
const KEY = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const TIMESTAMP = z.string().datetime({ offset: true });
const SCORE = z.number().finite().min(0).max(100);
const EVENT_IDS = z.array(UUID).min(1).max(2000);

const scoreSchema = z
  .object({
    key: z.enum(["attention", "resonance", "trust"]),
    score_type: z.literal("heuristic"),
    value: SCORE,
    unit: z.literal("synthetic_points"),
    method: z.literal("weighted_synthetic_agent_mean"),
    evidence_event_ids: EVENT_IDS,
  })
  .strict();

const findingSchema = z
  .object({
    finding_id: KEY,
    output_type: z.enum(["heuristic", "qualitative", "recommendation"]),
    title: z.string().min(1).max(120),
    detail: z.string().min(1).max(1000),
    evidence_event_ids: z.array(UUID).min(1).max(100),
  })
  .strict();

const behavioralReportSchema = z
  .object({
    action_shares: z.tuple([
      z.tuple([z.literal("attend"), z.number().finite().min(0).max(1)]),
      z.tuple([z.literal("resonate"), z.number().finite().min(0).max(1)]),
      z.tuple([z.literal("question"), z.number().finite().min(0).max(1)]),
      z.tuple([z.literal("reject"), z.number().finite().min(0).max(1)]),
      z.tuple([z.literal("share"), z.number().finite().min(0).max(1)]),
      z.tuple([z.literal("discuss"), z.number().finite().min(0).max(1)]),
      z.tuple([z.literal("reconsider"), z.number().finite().min(0).max(1)]),
      z.tuple([z.literal("ignore"), z.number().finite().min(0).max(1)]),
    ]),
    mean_attention: SCORE,
    mean_resonance: SCORE,
    mean_trust: SCORE,
    scores: z.tuple([scoreSchema, scoreSchema, scoreSchema]),
    uncertainty: z
      .object({
        uncertainty_type: z.literal(
          "synthetic_agent_dispersion_not_population_uncertainty",
        ),
        effective_agent_count: z.number().int().positive(),
        attention_weighted_standard_deviation: SCORE,
        resonance_weighted_standard_deviation: SCORE,
        trust_weighted_standard_deviation: SCORE,
        limitations: z.array(z.string().min(1).max(1000)).min(1),
      })
      .strict(),
    findings: z.array(findingSchema).min(1),
    synthesis: z
      .object({
        output_type: z.literal("qualitative"),
        claim_scope: z.literal("synthetic_agent_explanation"),
        summary: z.string().min(1).max(1000),
        evidence_finding_ids: z.array(KEY).min(1).max(50),
        limitations: z.array(z.string().min(1).max(1000)).min(1),
      })
      .strict(),
    validation_label: z.literal("experimental"),
    limitations: z.array(z.string().min(1).max(1000)).min(1),
  })
  .strict()
  .superRefine((report, context) => {
    const actionTotal = report.action_shares.reduce(
      (total, [, share]) => total + share,
      0,
    );
    if (Math.abs(actionTotal - 1) > 1e-9) {
      context.addIssue({
        code: "custom",
        message: "behavioral action shares must total one",
        path: ["action_shares"],
      });
    }
    const scoreKeys = ["attention", "resonance", "trust"] as const;
    const aggregates = [
      report.mean_attention,
      report.mean_resonance,
      report.mean_trust,
    ] as const;
    report.scores.forEach((score, index) => {
      if (score.key !== scoreKeys[index] || score.value !== aggregates[index]) {
        context.addIssue({
          code: "custom",
          message: "behavioral scores must bind their ordered aggregates",
          path: ["scores", index],
        });
      }
    });
    const findingIds = report.findings.map((finding) => finding.finding_id);
    if (
      report.synthesis.evidence_finding_ids.length !== findingIds.length ||
      !report.synthesis.evidence_finding_ids.every(
        (findingId, index) => findingId === findingIds[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "behavioral synthesis must bind every ordered finding",
        path: ["synthesis", "evidence_finding_ids"],
      });
    }
  });

const behavioralResultResponseSchema: z.ZodType<BehavioralResultAuthority> = z
  .object({
    run_id: UUID,
    study_id: UUID,
    variant_key: KEY,
    schema_version: z.literal(1),
    methodology_version: KEY,
    validation_label: z.literal("experimental"),
    provider_id: z.literal("deterministic_tiered"),
    provider_version: z.literal("1"),
    model_id: z.literal("deterministic_behavior_fixture_v1"),
    template_id: z.literal("behavioral_action_v1"),
    provider_calls: z.number().int().min(1).max(10_000),
    input_tokens: z.string().regex(/^(0|[1-9][0-9]*)$/),
    output_tokens: z.string().regex(/^(0|[1-9][0-9]*)$/),
    cost_microusd: z.string().regex(/^(0|[1-9][0-9]*)$/),
    context_graph_sha256: SHA256,
    agent_fleet_sha256: SHA256,
    input_sha256: SHA256,
    stimulus_sha256: SHA256,
    output_sha256: SHA256,
    artifact_sha256: SHA256,
    artifact_size_bytes: z.number().int().min(1).max(16_000_000),
    report: behavioralReportSchema,
    created_at: TIMESTAMP,
  })
  .strict();

export type BehavioralResult = z.infer<typeof behavioralResultResponseSchema>;

export function parseBehavioralResult(
  value: unknown,
  expectedRunId?: string,
): BehavioralResult {
  const parsed = behavioralResultResponseSchema.safeParse(value);
  if (
    !parsed.success ||
    (expectedRunId !== undefined && parsed.data.run_id !== expectedRunId)
  ) {
    throw new Error("invalid behavioral result API contract");
  }
  return parsed.data;
}
