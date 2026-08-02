import type { ControlPlaneComponents } from "@simula/contracts";
import { z } from "zod";

type BehavioralComparisonAuthority =
  ControlPlaneComponents["schemas"]["BehavioralComparisonResponseDto"];

const UUID = z.string().uuid();
const METRIC_KEYS = ["attention", "resonance", "trust"] as const;
const ACTION_KINDS = [
  "attend",
  "resonate",
  "question",
  "reject",
  "share",
  "discuss",
  "reconsider",
  "ignore",
] as const;

const metricDeltaSchema = z
  .object({
    key: z.enum(METRIC_KEYS),
    candidate_minus_baseline: z.number().finite().min(-100).max(100),
  })
  .strict();

const actionDeltaSchema = z
  .object({
    key: z.enum(ACTION_KINDS),
    candidate_minus_baseline: z.number().finite().min(-1).max(1),
  })
  .strict();

const comparisonSchema: z.ZodType<BehavioralComparisonAuthority> = z
  .object({
    study_id: UUID,
    baseline_run_id: UUID,
    candidate_run_id: UUID,
    paired_agents: z.number().int().min(10).max(2000),
    metric_deltas: z.array(metricDeltaSchema).length(3),
    action_share_deltas: z.array(actionDeltaSchema).length(8),
    interpretation: z.literal("experimental_matched_synthetic_difference"),
    winner: z.null(),
    limitations: z.tuple([
      z.literal(
        "No variant winner, lift, causal effect, or human preference is established.",
      ),
      z.literal(
        "Synthetic-agent diagnostic only. It is not observed human evidence or a population estimate.",
      ),
    ]),
  })
  .strict()
  .superRefine((comparison, context) => {
    if (
      comparison.baseline_run_id === comparison.candidate_run_id ||
      comparison.metric_deltas.some(
        (metric, index) => metric.key !== METRIC_KEYS[index],
      ) ||
      comparison.action_share_deltas.some(
        (action, index) => action.key !== ACTION_KINDS[index],
      ) ||
      Math.abs(
        comparison.action_share_deltas.reduce(
          (sum, action) => sum + action.candidate_minus_baseline,
          0,
        ),
      ) > 1e-9
    ) {
      context.addIssue({
        code: "custom",
        message: "matched behavioral comparison must be canonical",
      });
    }
  });

export type BehavioralComparison = z.infer<typeof comparisonSchema>;

export function parseBehavioralComparison(
  value: unknown,
  expected?: Readonly<{
    baselineRunId?: string;
    candidateRunId?: string;
    studyId?: string;
  }>,
): BehavioralComparison {
  const parsed = comparisonSchema.safeParse(value);
  if (
    !parsed.success ||
    (expected?.baselineRunId !== undefined &&
      parsed.data.baseline_run_id !== expected.baselineRunId) ||
    (expected?.candidateRunId !== undefined &&
      parsed.data.candidate_run_id !== expected.candidateRunId) ||
    (expected?.studyId !== undefined &&
      parsed.data.study_id !== expected.studyId)
  ) {
    throw new Error("invalid behavioral comparison API contract");
  }
  return parsed.data;
}
