import { validatedBehavioralComparison } from "./behavioral-comparison-validator";

const BASELINE_ID = "018f274b-3c77-7b22-b749-c9274230ef91";
const CANDIDATE_ID = "018f274b-3c77-7b22-b749-c9274230ef92";

function comparison(): Record<string, unknown> {
  return {
    study_id: "018f274b-3c77-7b22-b749-c9274230ef93",
    baseline_run_id: BASELINE_ID,
    candidate_run_id: CANDIDATE_ID,
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

describe("validatedBehavioralComparison", () => {
  it("accepts an exact matched synthetic difference", () => {
    expect(validatedBehavioralComparison(comparison())).toMatchObject({
      baseline_run_id: BASELINE_ID,
      candidate_run_id: CANDIDATE_ID,
      winner: null,
    });
  });

  it("rejects a winner claim", () => {
    expect(() =>
      validatedBehavioralComparison({
        ...comparison(),
        winner: "candidate",
      }),
    ).toThrow("invalid behavioral comparison");
  });

  it("rejects noncanonical metric order", () => {
    const value = comparison();
    (value.metric_deltas as unknown[]).reverse();

    expect(() => validatedBehavioralComparison(value)).toThrow(
      "invalid behavioral comparison",
    );
  });
});
