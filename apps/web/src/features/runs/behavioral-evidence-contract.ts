import type { ControlPlaneComponents } from "@simula/contracts";
import { z } from "zod";

type BehavioralEvidenceAuthority =
  ControlPlaneComponents["schemas"]["BehavioralEvidenceResponseDto"];

const UUID = z.string().uuid();
const SHA256 = z.string().regex(/^[0-9a-f]{64}$/);
const KEY = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const TIMESTAMP = z.string().datetime({ offset: true });
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
const actionKindSchema = z.enum(ACTION_KINDS);

const provenanceSchema = z
  .object({
    source_id: KEY,
    source_version: z.string().min(1).max(120),
    owner: z.string().min(1).max(120),
    license: z.string().min(1).max(120),
    allowed_use: z.string().min(1).max(1000),
    collected_at: z.string().min(1).max(1000),
    transformation: z.string().min(1).max(1000),
    validation_status: z.enum(["experimental", "benchmarked"]),
  })
  .strict();

const nodeSchema = z
  .object({
    node_id: KEY,
    kind: z.enum([
      "stimulus_fact",
      "market_context",
      "cultural_context",
      "brand_constraint",
      "audience_evidence",
    ]),
    title: z.string().min(1).max(120),
    content: z.string().min(1).max(2000),
    content_sha256: SHA256,
    provenance: provenanceSchema,
  })
  .strict();

const edgeSchema = z
  .object({
    source_node_id: KEY,
    target_node_id: KEY,
    relationship: z.enum([
      "supports",
      "qualifies",
      "contradicts",
      "constrains",
      "applies_to",
    ]),
    evidence_strength: z.number().finite().min(0).max(1),
  })
  .strict();

const contextGraphSchema = z
  .object({
    graph_id: UUID,
    organization_id: UUID,
    version: z.number().int().positive(),
    nodes: z.array(nodeSchema).min(1).max(500),
    edges: z.array(edgeSchema).max(2000),
    checksum_sha256: SHA256.refine((value) => value !== "0".repeat(64)),
    limitations: z.array(z.string().min(1).max(1000)).min(1),
  })
  .strict()
  .superRefine((graph, context) => {
    const nodeIds = graph.nodes.map((node) => node.node_id);
    if (
      nodeIds.some(
        (nodeId, index) => index > 0 && nodeIds[index - 1]! >= nodeId,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "context graph nodes must be unique and ordered",
        path: ["nodes"],
      });
    }
    const nodeSet = new Set(nodeIds);
    const edgeKeys = graph.edges.map(
      (edge) =>
        `${edge.source_node_id}\u0000${edge.target_node_id}\u0000${edge.relationship}`,
    );
    if (
      edgeKeys.some(
        (edgeKey, index) => index > 0 && edgeKeys[index - 1]! >= edgeKey,
      ) ||
      graph.edges.some(
        (edge) =>
          edge.source_node_id === edge.target_node_id ||
          !nodeSet.has(edge.source_node_id) ||
          !nodeSet.has(edge.target_node_id),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "context graph edges must be valid, unique, and ordered",
        path: ["edges"],
      });
    }
  });

const evidenceSummarySchema = z
  .object({
    evidence_kind: z.enum(["finding", "score"]),
    evidence_key: KEY,
    output_type: z.enum(["heuristic", "qualitative", "recommendation"]),
    event_count: z.number().int().min(1).max(10_000),
    sample_event_ids: z.array(UUID).min(1).max(10),
  })
  .strict()
  .superRefine((summary, context) => {
    if (
      summary.evidence_kind === "score" &&
      summary.output_type !== "heuristic"
    ) {
      context.addIssue({
        code: "custom",
        message: "score evidence must remain heuristic",
        path: ["output_type"],
      });
    }
    if (
      summary.sample_event_ids.some(
        (eventId, index) =>
          index > 0 && summary.sample_event_ids[index - 1]! >= eventId,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "sample event identifiers must be unique and ordered",
        path: ["sample_event_ids"],
      });
    }
  });

const fleetSummarySchema = z
  .object({
    agent_count: z.number().int().min(10).max(2000),
    llm_agent_count: z.number().int().min(0).max(100),
    rule_agent_count: z.number().int().min(0).max(2000),
    cohort_count: z.number().int().min(1).max(2000),
    relationship_count: z.number().int().min(0).max(4_000_000),
    synthetic_identity: z.literal(true),
  })
  .strict()
  .superRefine((fleet, context) => {
    if (
      fleet.llm_agent_count + fleet.rule_agent_count !== fleet.agent_count ||
      fleet.cohort_count > fleet.agent_count ||
      fleet.relationship_count > fleet.agent_count * fleet.agent_count
    ) {
      context.addIssue({
        code: "custom",
        message: "behavioral fleet counts must bind",
      });
    }
  });

const actionSharesSchema = z
  .array(z.tuple([actionKindSchema, z.number().finite().min(0).max(1)]))
  .length(8)
  .superRefine((shares, context) => {
    if (
      shares.some(([action], index) => action !== ACTION_KINDS[index]) ||
      Math.abs(shares.reduce((sum, share) => sum + share[1], 0) - 1) > 1e-9
    ) {
      context.addIssue({
        code: "custom",
        message: "behavioral action shares must be canonical and normalized",
      });
    }
  });

const roundSummarySchema = z
  .object({
    round_index: z.number().int().min(1).max(5),
    event_count: z.number().int().min(10).max(2000),
    action_shares: actionSharesSchema,
    mean_valence: z.number().finite().min(-1).max(1),
    mean_attention: z.number().finite().min(0).max(100),
    mean_resonance: z.number().finite().min(0).max(100),
    mean_trust: z.number().finite().min(0).max(100),
    evidence_node_ids: z.array(KEY).min(1).max(500),
    checksum_sha256: SHA256.refine((value) => value !== "0".repeat(64)),
  })
  .strict()
  .superRefine((round, context) => {
    if (
      round.evidence_node_ids.some(
        (nodeId, index) =>
          index > 0 && round.evidence_node_ids[index - 1]! >= nodeId,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "round evidence nodes must be unique and ordered",
        path: ["evidence_node_ids"],
      });
    }
  });

const syntheticInterviewSchema = z
  .object({
    interview_kind: z.literal("fixed_replay_summary"),
    synthetic_agent_id: UUID,
    tier: z.enum(["llm", "rule"]),
    round_count: z.number().int().min(1).max(5),
    latest_action: actionKindSchema,
    evidence_event_ids: z.array(UUID).min(1).max(5),
    prompt: z.literal(
      "What did this synthetic agent do in its final simulated round?",
    ),
    response_summary: z.string().min(1).max(300),
    disclosure: z.literal(
      "Generated from recorded synthetic actions; not a human statement or testimony.",
    ),
  })
  .strict()
  .superRefine((interview, context) => {
    const expectedSummary =
      `Across ${interview.round_count} simulated rounds, the final recorded ` +
      `action was "${interview.latest_action}".`;
    if (
      interview.evidence_event_ids.length !== interview.round_count ||
      new Set(interview.evidence_event_ids).size !==
        interview.evidence_event_ids.length ||
      interview.response_summary !== expectedSummary
    ) {
      context.addIssue({
        code: "custom",
        message: "synthetic interview replay must bind recorded actions",
      });
    }
  });

const behavioralEvidenceResponseSchema: z.ZodType<BehavioralEvidenceAuthority> =
  z
    .object({
      run_id: UUID,
      context_graph: contextGraphSchema,
      context_graph_created_at: TIMESTAMP,
      evidence_summary: z.array(evidenceSummarySchema).max(100),
      fleet_summary: fleetSummarySchema,
      rounds: z.array(roundSummarySchema).min(1).max(5),
      synthetic_interviews: z.array(syntheticInterviewSchema).length(10),
      public_summary_limitations: z.tuple([
        z.literal(
          "Fleet, round, and interview views describe synthetic agents only.",
        ),
        z.literal(
          "Synthetic interview responses are fixed replay summaries, not generated testimony.",
        ),
        z.literal(
          "No observed human behavior or campaign lift is represented.",
        ),
      ]),
    })
    .strict()
    .superRefine((evidence, context) => {
      const keys = evidence.evidence_summary.map(
        (summary) =>
          `${summary.evidence_kind}\u0000${summary.evidence_key}\u0000${summary.output_type}`,
      );
      if (keys.some((key, index) => index > 0 && keys[index - 1]! >= key)) {
        context.addIssue({
          code: "custom",
          message: "behavioral evidence groups must be unique and ordered",
          path: ["evidence_summary"],
        });
      }
      if (
        evidence.rounds.some(
          (round, index) =>
            round.round_index !== index + 1 ||
            round.event_count !== evidence.fleet_summary.agent_count ||
            round.evidence_node_ids.some(
              (nodeId) =>
                !evidence.context_graph.nodes.some(
                  (node) => node.node_id === nodeId,
                ),
            ),
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "behavioral rounds must bind to the fleet and context graph",
          path: ["rounds"],
        });
      }
      if (
        evidence.synthetic_interviews.some(
          (interview, index) =>
            interview.round_count !== evidence.rounds.length ||
            (index > 0 &&
              evidence.synthetic_interviews[index - 1]!.synthetic_agent_id >=
                interview.synthetic_agent_id),
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "synthetic interviews must bind to canonical run summaries",
          path: ["synthetic_interviews"],
        });
      }
    });

export type BehavioralEvidence = z.infer<
  typeof behavioralEvidenceResponseSchema
>;

export function parseBehavioralEvidence(
  value: unknown,
  expectedRunId?: string,
): BehavioralEvidence {
  const parsed = behavioralEvidenceResponseSchema.safeParse(value);
  if (
    !parsed.success ||
    (expectedRunId !== undefined && parsed.data.run_id !== expectedRunId)
  ) {
    throw new Error("invalid behavioral evidence API contract");
  }
  return parsed.data;
}
