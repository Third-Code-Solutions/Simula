export const BEHAVIORAL_RUN_ID = "018f274b-3c77-7b22-b749-c9274230ef91";
export const BEHAVIORAL_PROJECT_ID = "018f274b-3c77-7b22-b749-c9274230ef92";
export const BEHAVIORAL_ORGANIZATION_ID =
  "018f274b-3c77-7b22-b749-c9274230ef93";
export const BEHAVIORAL_EVENT_ID = "018f274b-3c77-7b22-b749-c9274230ef94";
export const BEHAVIORAL_BASELINE_RUN_ID =
  "018f274b-3c77-7b22-b749-c9274230ef90";

export function behavioralResultFixture(): Record<string, unknown> {
  return {
    run_id: BEHAVIORAL_RUN_ID,
    study_id: BEHAVIORAL_PROJECT_ID,
    variant_key: "baseline",
    schema_version: 1,
    methodology_version: "behavioral_demo_v1",
    validation_label: "experimental",
    provider_id: "deterministic_tiered",
    provider_version: "1",
    model_id: "deterministic_behavior_fixture_v1",
    template_id: "behavioral_action_v1",
    provider_calls: 20,
    input_tokens: "0",
    output_tokens: "0",
    cost_microusd: "0",
    context_graph_sha256: "a".repeat(64),
    agent_fleet_sha256: "b".repeat(64),
    input_sha256: "c".repeat(64),
    stimulus_sha256: "d".repeat(64),
    output_sha256: "e".repeat(64),
    artifact_sha256: "f".repeat(64),
    artifact_size_bytes: 4096,
    report: {
      action_shares: [
        ["attend", 0.2],
        ["resonate", 0.2],
        ["question", 0.1],
        ["reject", 0.1],
        ["share", 0.1],
        ["discuss", 0.1],
        ["reconsider", 0.1],
        ["ignore", 0.1],
      ],
      mean_attention: 72,
      mean_resonance: 61,
      mean_trust: 58,
      scores: [
        {
          key: "attention",
          score_type: "heuristic",
          value: 72,
          unit: "synthetic_points",
          method: "weighted_synthetic_agent_mean",
          evidence_event_ids: [BEHAVIORAL_EVENT_ID],
        },
        {
          key: "resonance",
          score_type: "heuristic",
          value: 61,
          unit: "synthetic_points",
          method: "weighted_synthetic_agent_mean",
          evidence_event_ids: [BEHAVIORAL_EVENT_ID],
        },
        {
          key: "trust",
          score_type: "heuristic",
          value: 58,
          unit: "synthetic_points",
          method: "weighted_synthetic_agent_mean",
          evidence_event_ids: [BEHAVIORAL_EVENT_ID],
        },
      ],
      uncertainty: {
        uncertainty_type:
          "synthetic_agent_dispersion_not_population_uncertainty",
        effective_agent_count: 20,
        attention_weighted_standard_deviation: 5,
        resonance_weighted_standard_deviation: 6,
        trust_weighted_standard_deviation: 7,
        limitations: ["Synthetic dispersion only."],
      },
      findings: [
        {
          finding_id: "resonance_signal",
          output_type: "heuristic",
          title: "Synthetic resonance signal",
          detail: "Replayable synthetic evidence.",
          evidence_event_ids: [BEHAVIORAL_EVENT_ID],
        },
      ],
      synthesis: {
        output_type: "qualitative",
        claim_scope: "synthetic_agent_explanation",
        summary: "Synthetic explanation for research planning.",
        evidence_finding_ids: ["resonance_signal"],
        limitations: ["Not human testimony."],
      },
      validation_label: "experimental",
      limitations: ["Not observed human evidence."],
    },
    created_at: "2026-07-29T06:00:00.123456Z",
  };
}

export function behavioralEvidenceFixture(): Record<string, unknown> {
  return {
    run_id: BEHAVIORAL_RUN_ID,
    context_graph: {
      graph_id: "018f274b-3c77-7b22-b749-c9274230ef95",
      organization_id: BEHAVIORAL_ORGANIZATION_ID,
      version: 1,
      nodes: [
        {
          node_id: "a_stimulus",
          kind: "stimulus_fact",
          title: "Authored stimulus",
          content: "<img src=x onerror=alert(1)>",
          content_sha256: "1".repeat(64),
          provenance: {
            source_id: "authored_stimulus",
            source_version: "1",
            owner: "SIMULA fixture",
            license: "authored",
            allowed_use: "Synthetic behavioral demo.",
            collected_at: "2026-07-29",
            transformation: "No transformation.",
            validation_status: "experimental",
          },
        },
      ],
      edges: [],
      checksum_sha256: "a".repeat(64),
      limitations: ["Synthetic context only."],
    },
    context_graph_created_at: "2026-07-29T06:00:00.123456Z",
    evidence_summary: [
      {
        evidence_kind: "finding",
        evidence_key: "resonance_signal",
        output_type: "heuristic",
        event_count: 1,
        sample_event_ids: [BEHAVIORAL_EVENT_ID],
      },
      {
        evidence_kind: "score",
        evidence_key: "attention",
        output_type: "heuristic",
        event_count: 1,
        sample_event_ids: [BEHAVIORAL_EVENT_ID],
      },
    ],
    fleet_summary: {
      agent_count: 20,
      llm_agent_count: 4,
      rule_agent_count: 16,
      cohort_count: 2,
      relationship_count: 20,
      synthetic_identity: true,
    },
    rounds: [1, 2].map((roundIndex) => ({
      round_index: roundIndex,
      event_count: 20,
      action_shares: [
        ["attend", 0.2],
        ["resonate", 0.2],
        ["question", 0.1],
        ["reject", 0.1],
        ["share", 0.1],
        ["discuss", 0.1],
        ["reconsider", 0.1],
        ["ignore", 0.1],
      ],
      mean_valence: 0.1,
      mean_attention: 72,
      mean_resonance: 61,
      mean_trust: 58,
      evidence_node_ids: ["a_stimulus"],
      checksum_sha256: String(roundIndex).repeat(64),
    })),
    synthetic_interviews: Array.from({ length: 10 }, (_, index) => {
      const suffix = index.toString(16).padStart(2, "0");
      return {
        interview_kind: "fixed_replay_summary",
        synthetic_agent_id: `018f274b-3c77-7b22-b749-c9274230e1${suffix}`,
        tier: index < 2 ? "llm" : "rule",
        round_count: 2,
        latest_action: "attend",
        evidence_event_ids: [
          `018f274b-3c77-7b22-b749-c9274230e2${suffix}`,
          `018f274b-3c77-7b22-b749-c9274230e3${suffix}`,
        ],
        prompt:
          "What did this synthetic agent do in its final simulated round?",
        response_summary:
          'Across 2 simulated rounds, the final recorded action was "attend".',
        disclosure:
          "Generated from recorded synthetic actions; not a human statement or testimony.",
      };
    }),
    public_summary_limitations: [
      "Fleet, round, and interview views describe synthetic agents only.",
      "Synthetic interview responses are fixed replay summaries, not generated testimony.",
      "No observed human behavior or campaign lift is represented.",
    ],
  };
}

export function behavioralComparisonFixture(): Record<string, unknown> {
  return {
    study_id: BEHAVIORAL_PROJECT_ID,
    baseline_run_id: BEHAVIORAL_BASELINE_RUN_ID,
    candidate_run_id: BEHAVIORAL_RUN_ID,
    paired_agents: 20,
    metric_deltas: [
      { key: "attention", candidate_minus_baseline: 2 },
      { key: "resonance", candidate_minus_baseline: -1 },
      { key: "trust", candidate_minus_baseline: 0 },
    ],
    action_share_deltas: [
      { key: "attend", candidate_minus_baseline: 0.1 },
      { key: "resonate", candidate_minus_baseline: 0 },
      { key: "question", candidate_minus_baseline: -0.1 },
      { key: "reject", candidate_minus_baseline: 0 },
      { key: "share", candidate_minus_baseline: 0 },
      { key: "discuss", candidate_minus_baseline: 0 },
      { key: "reconsider", candidate_minus_baseline: 0 },
      { key: "ignore", candidate_minus_baseline: 0 },
    ],
    interpretation: "experimental_matched_synthetic_difference",
    winner: null,
    limitations: [
      "No variant winner, lift, causal effect, or human preference is established.",
      "Synthetic-agent diagnostic only. It is not observed human evidence or a population estimate.",
    ],
  };
}
