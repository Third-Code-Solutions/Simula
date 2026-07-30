import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BehavioralComparison } from "@/lib/api";

import { BehavioralComparisonPanel } from "./behavioral-comparison-panel";

const CANDIDATE_ID = "018f274b-3c77-7b22-b749-c9274230ef91";
const BASELINE_ID = "018f274b-3c77-7b22-b749-c9274230ef92";
const STUDY_ID = "018f274b-3c77-7b22-b749-c9274230ef93";

afterEach(cleanup);

function comparison(): BehavioralComparison {
  return {
    study_id: STUDY_ID,
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

describe("BehavioralComparisonPanel", () => {
  it("shows only verified matched differences and no winner", async () => {
    const loadComparison = vi.fn().mockResolvedValue(comparison());
    render(
      <BehavioralComparisonPanel
        candidateRunId={CANDIDATE_ID}
        expectedStudyId={STUDY_ID}
        loadComparison={loadComparison}
      />,
    );

    fireEvent.change(screen.getByLabelText("Baseline run ID"), {
      target: { value: BASELINE_ID },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Compare matched runs" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Matched synthetic differences" }),
      ).toBeInTheDocument(),
    );
    expect(loadComparison).toHaveBeenCalledWith(
      CANDIDATE_ID,
      BASELINE_ID,
      STUDY_ID,
    );
    expect(screen.getAllByText("No winner").length).toBeGreaterThan(0);
    expect(screen.getByText("+2.0")).toBeInTheDocument();
    expect(screen.getByText("+10.0 percentage points")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Export validated comparison JSON",
      }),
    ).toBeInTheDocument();
  });

  it("rejects using the candidate as its own baseline", () => {
    const loadComparison = vi.fn();
    render(
      <BehavioralComparisonPanel
        candidateRunId={CANDIDATE_ID}
        expectedStudyId={STUDY_ID}
        loadComparison={loadComparison}
      />,
    );

    fireEvent.change(screen.getByLabelText("Baseline run ID"), {
      target: { value: CANDIDATE_ID },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Compare matched runs" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a different, valid baseline run ID.",
    );
    expect(loadComparison).not.toHaveBeenCalled();
  });
});
