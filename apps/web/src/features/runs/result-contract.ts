import { z } from "zod";

const SHA256 = z.string().regex(/^[0-9a-f]{64}$/);
const UUID = z.string().uuid();
const TIMESTAMP = z.string().datetime({ offset: true });

export const runStateSchema = z.enum([
  "queued",
  "running",
  "retrying",
  "cancel_requested",
  "succeeded",
  "failed",
  "canceled",
]);

export type SimulationRun = z.infer<typeof simulationRunSchema>;
export type SimulationResult = z.infer<typeof simulationResultResponseSchema>;
export type SimulationProvenance = z.infer<typeof simulationProvenanceSchema>;

export const terminalRunStates = new Set<SimulationRun["state"]>([
  "succeeded",
  "failed",
  "canceled",
]);

const runFailureSchema = z
  .object({
    code: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    correlation_id: UUID,
    guidance: z.literal(
      "No substitute result was generated. Retry or use the correlation ID for support.",
    ),
  })
  .strict();

export const simulationRunSchema = z
  .object({
    id: UUID,
    organization_id: UUID,
    project_id: UUID,
    stimulus_version_id: UUID,
    audience_version_id: UUID,
    state: runStateSchema,
    schema_version: z.literal(1),
    dispatch_generation: z.number().int().min(1).max(3),
    job_id: z.string().regex(/^run:[0-9a-f-]{36}:dispatch:[1-3]$/),
    version: z.number().int().positive(),
    created_at: TIMESTAMP,
    failure: runFailureSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.state === "failed" && value.failure === null) {
      context.addIssue({
        code: "custom",
        message: "failed run requires support context",
        path: ["failure"],
      });
    }
    if (value.state !== "failed" && value.failure !== null) {
      context.addIssue({
        code: "custom",
        message: "non-failed run cannot expose failure context",
        path: ["failure"],
      });
    }
  });

const fixtureDistributionSchema = z
  .object({
    unit: z.literal("share"),
    categories: z.tuple([
      z
        .object({
          key: z.literal("clear"),
          value: z.number().finite().min(0).max(1),
        })
        .strict(),
      z
        .object({
          key: z.literal("unclear"),
          value: z.number().finite().min(0).max(1),
        })
        .strict(),
      z
        .object({
          key: z.literal("needs_human_review"),
          value: z.number().finite().min(0).max(1),
        })
        .strict(),
    ]),
  })
  .strict()
  .superRefine((value, context) => {
    const total = value.categories.reduce(
      (sum, category) => sum + category.value,
      0,
    );
    if (Math.abs(total - 1) > 0.000000001) {
      context.addIssue({
        code: "custom",
        message: "distribution must total one",
      });
    }
  });

const limitation =
  "Estimates nobody and is not representative of any population.";
const recommendation =
  "Verify wording with appropriately recruited human participants before acting.";
const outputLimitations = z.tuple([z.literal(limitation)]);

const fixtureResultOutputSchema = z
  .object({
    output_id: z.literal("reaction_fixture"),
    kind: z.literal("demo_fixture_distribution"),
    label: z.literal("Pipeline demo values"),
    value: fixtureDistributionSchema,
    uncertainty: z
      .object({
        status: z.literal("not_applicable"),
        reason: z.literal("authored deterministic fixture"),
      })
      .strict(),
    limitations: outputLimitations,
  })
  .strict();

const unavailableResultOutputSchema = z
  .object({
    output_id: z.literal("reaction_fixture"),
    kind: z.literal("unavailable"),
    label: z.literal("Pipeline demo values"),
    availability: z.enum(["unsupported", "suppressed"]),
    reason: z.literal(
      "This output is unavailable. SIMULA will not substitute a value.",
    ),
    limitations: outputLimitations,
  })
  .strict();

const resultOutputSchema = z.discriminatedUnion("kind", [
  fixtureResultOutputSchema,
  unavailableResultOutputSchema,
]);

export const simulationResultSchema = z
  .object({
    schema_version: z.literal("1.0.0"),
    run_id: UUID,
    validation_label: z.literal("experimental"),
    outputs: z.tuple([resultOutputSchema]),
    qualitative: z.tuple([
      z
        .object({
          kind: z.literal("generated_qualitative"),
          synthetic: z.literal(true),
          text: z.literal(
            "A deterministic mock observation used only to test rendering.",
          ),
          source_output_ids: z.tuple([z.literal("reaction_fixture")]),
        })
        .strict(),
    ]),
    recommendations: z.tuple([
      z
        .object({
          kind: z.literal("recommendation"),
          text: z.literal(recommendation),
          source_output_ids: z.tuple([z.literal("reaction_fixture")]),
        })
        .strict(),
    ]),
    provenance: z
      .object({
        method_version: z.literal("phase2_demo_v1"),
        provider_id: z.literal("deterministic_mock"),
        provider_version: z.literal(1),
        code_release_sha: z.string().regex(/^[0-9a-f]{40}$/),
        configuration_sha256: SHA256,
        frozen_manifest_sha256: SHA256,
        deterministic_seed: z.string().regex(/^-?[0-9]{1,19}$/),
        output_schema_version: z.literal(1),
      })
      .strict(),
    limitations: z.tuple([z.literal(limitation)]),
  })
  .strict();

export const simulationResultResponseSchema = z
  .object({
    run_id: UUID,
    schema_version: z.literal(1),
    result: simulationResultSchema,
    artifact_sha256: SHA256,
    created_at: TIMESTAMP,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.run_id !== value.result.run_id) {
      context.addIssue({
        code: "custom",
        message: "result run identity mismatches its wrapper",
      });
    }
  });

const providerReceiptAvailableSchema = z
  .object({
    availability: z.literal("available"),
    schema_version: z.literal(1),
    receipt_kind: z.literal("successful_result"),
    provider_id: z.literal("deterministic_mock"),
    provider_version: z.literal(1),
    model_id: z.literal("deterministic_fixture_v1"),
    template_id: z.literal("phase2_deterministic_mock_v1"),
    response_schema_version: z.literal(1),
    finish_status: z.literal("completed"),
    usage: z
      .object({
        input_tokens: z.literal(0),
        output_tokens: z.literal(0),
        cost_microusd: z.literal(0),
      })
      .strict(),
    started_at: TIMESTAMP,
    ended_at: TIMESTAMP,
    safe_error_class: z.null(),
  })
  .strict()
  .superRefine((value, context) => {
    const duration = Date.parse(value.ended_at) - Date.parse(value.started_at);
    if (duration < 0 || duration > 30_000) {
      context.addIssue({
        code: "custom",
        message: "provider receipt duration is invalid",
      });
    }
  });

const providerReceiptLegacyUnavailableSchema = z
  .object({
    availability: z.literal("legacy_unavailable"),
    unavailable_reason: z.literal("successful_result_receipt_not_captured"),
  })
  .strict();

const providerReceiptSchema = z.discriminatedUnion("availability", [
  providerReceiptAvailableSchema,
  providerReceiptLegacyUnavailableSchema,
]);

const provenanceAvailableSchema = z
  .object({
    availability: z.literal("available"),
    unavailable_reason: z.null(),
    run_id: UUID,
    created_at: TIMESTAMP,
    terminal_at: TIMESTAMP.nullable(),
    result_created_at: TIMESTAMP.nullable(),
    frozen_manifest_sha256: SHA256,
    deterministic_seed: z.string().regex(/^-?[0-9]{1,19}$/),
    stimulus: z
      .object({
        version_id: UUID,
        content: z.string().min(1).max(5000),
        content_sha256: SHA256,
      })
      .strict(),
    audience: z
      .object({
        version_id: UUID,
        kind: z.literal("authored_demo"),
        checksum_sha256: SHA256,
        cells: z.tuple([
          z
            .object({ key: z.literal("authored_demo"), weight: z.literal(1) })
            .strict(),
        ]),
        non_representative: z.literal(true),
        limitations: z.tuple([z.literal(limitation)]),
      })
      .strict(),
    execution: z
      .object({
        method_version: z.literal("phase2_demo_v1"),
        disclosure_version: z.literal("phase2_demo_v1"),
        language: z.literal("en"),
        output_schema_version: z.literal(1),
        provider_id: z.literal("deterministic_mock"),
        provider_version: z.literal(1),
        pipeline_release_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
        code_release_sha: z.string().regex(/^[0-9a-f]{40}$/),
        configuration_sha256: SHA256,
      })
      .strict(),
    limits: z
      .object({
        version: z.literal("phase2_2026_07_17"),
        arq_job_timeout_seconds: z.literal(30),
        provider_cost_ceiling: z.literal(0),
        max_database_attempts: z.literal(3),
        max_dispatch_generations: z.literal(3),
        max_result_bytes: z.literal(131072),
      })
      .strict(),
    provider_receipt: providerReceiptSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.result_created_at === null) !==
      (value.provider_receipt === null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "completed provenance must disclose provider receipt availability",
      });
    }
  });

const provenanceUnavailableSchema = z
  .object({
    availability: z.literal("legacy_unavailable"),
    unavailable_reason: z.literal("frozen_provenance_not_captured"),
    run_id: UUID,
    created_at: TIMESTAMP,
    terminal_at: TIMESTAMP.nullable(),
    result_created_at: TIMESTAMP.nullable(),
    frozen_manifest_sha256: SHA256,
    deterministic_seed: z.string().regex(/^-?[0-9]{1,19}$/),
    stimulus: z.null(),
    audience: z.null(),
    execution: z.null(),
    limits: z.null(),
    provider_receipt: z.null(),
  })
  .strict();

export const simulationProvenanceSchema = z.discriminatedUnion("availability", [
  provenanceAvailableSchema,
  provenanceUnavailableSchema,
]);

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error("invalid API contract");
  }
  return parsed.data;
}

export function parseSimulationRun(value: unknown): SimulationRun {
  return parseOrThrow(simulationRunSchema, value);
}

export function parseSimulationResult(
  value: unknown,
): z.infer<typeof simulationResultResponseSchema> {
  return parseOrThrow(simulationResultResponseSchema, value);
}

export function parseSimulationProvenance(
  value: unknown,
): SimulationProvenance {
  return parseOrThrow(simulationProvenanceSchema, value);
}

export function isTerminalRunState(state: SimulationRun["state"]): boolean {
  return terminalRunStates.has(state);
}
