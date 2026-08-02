import { validatedBehavioralReport } from "./behavioral-report-validator";

const EVENT_ID = "018f274b-3c77-7b22-b749-c9274230ef9a";

function report(): Record<string, unknown> {
  return {
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
        evidence_event_ids: [EVENT_ID],
      },
      {
        key: "resonance",
        score_type: "heuristic",
        value: 61,
        unit: "synthetic_points",
        method: "weighted_synthetic_agent_mean",
        evidence_event_ids: [EVENT_ID],
      },
      {
        key: "trust",
        score_type: "heuristic",
        value: 58,
        unit: "synthetic_points",
        method: "weighted_synthetic_agent_mean",
        evidence_event_ids: [EVENT_ID],
      },
    ],
    uncertainty: {
      uncertainty_type: "synthetic_agent_dispersion_not_population_uncertainty",
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
        evidence_event_ids: [EVENT_ID],
      },
    ],
    synthesis: {
      output_type: "qualitative",
      claim_scope: "synthetic_agent_explanation",
      summary: "Synthetic explanation.",
      evidence_finding_ids: ["resonance_signal"],
      limitations: ["Not human testimony."],
    },
    validation_label: "experimental",
    limitations: ["Not observed human evidence."],
  };
}

describe("validatedBehavioralReport", () => {
  it("accepts the complete governed report projection", () => {
    expect(validatedBehavioralReport(report())).toMatchObject({
      validation_label: "experimental",
      mean_attention: 72,
    });
  });

  it("rejects properties outside the generated authority", () => {
    expect(() =>
      validatedBehavioralReport({ ...report(), guaranteed_lift: 42 }),
    ).toThrow("invalid behavioral report");
  });

  it("rejects a noncanonical action order", () => {
    const value = report();
    const actions = value.action_shares as unknown[];
    [actions[0], actions[1]] = [actions[1], actions[0]];

    expect(() => validatedBehavioralReport(value)).toThrow(
      "invalid behavioral report",
    );
  });

  it("rejects score aggregates without exact evidence binding", () => {
    const value = report();
    (
      value.scores as {
        value: number;
      }[]
    )[0]!.value = 71;

    expect(() => validatedBehavioralReport(value)).toThrow(
      "invalid behavioral report",
    );
  });
});
