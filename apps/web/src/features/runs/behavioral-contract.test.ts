import { describe, expect, it } from "vitest";

import {
  BEHAVIORAL_BASELINE_RUN_ID,
  BEHAVIORAL_PROJECT_ID,
  BEHAVIORAL_RUN_ID,
  behavioralComparisonFixture,
  behavioralEvidenceFixture,
  behavioralResultFixture,
} from "@/test/behavioral-fixtures";

import { parseBehavioralComparison } from "./behavioral-comparison-contract";
import { parseBehavioralEvidence } from "./behavioral-evidence-contract";
import { parseBehavioralResult } from "./behavioral-result-contract";

describe("behavioral browser contracts", () => {
  it("accepts the governed result and evidence projections", () => {
    expect(
      parseBehavioralResult(behavioralResultFixture(), BEHAVIORAL_RUN_ID),
    ).toMatchObject({
      run_id: BEHAVIORAL_RUN_ID,
      validation_label: "experimental",
    });
    expect(
      parseBehavioralEvidence(behavioralEvidenceFixture(), BEHAVIORAL_RUN_ID),
    ).toMatchObject({
      run_id: BEHAVIORAL_RUN_ID,
      context_graph: { checksum_sha256: "a".repeat(64) },
    });
  });

  it("rejects behavioral aggregates that do not bind their scores", () => {
    const value = behavioralResultFixture();
    (
      (value.report as { scores: { value: number }[] }).scores[0] as {
        value: number;
      }
    ).value = 71;

    expect(() => parseBehavioralResult(value)).toThrow(
      "invalid behavioral result API contract",
    );
  });

  it("rejects an evidence wrapper for a different run", () => {
    expect(() =>
      parseBehavioralEvidence(
        behavioralEvidenceFixture(),
        "018f274b-3c77-7b22-b749-c9274230ef99",
      ),
    ).toThrow("invalid behavioral evidence API contract");
  });

  it("rejects noncanonical evidence group order", () => {
    const value = behavioralEvidenceFixture();
    (
      value.evidence_summary as {
        evidence_kind: string;
      }[]
    ).reverse();

    expect(() => parseBehavioralEvidence(value)).toThrow(
      "invalid behavioral evidence API contract",
    );
  });

  it("rejects synthetic interview testimony that is not a fixed replay", () => {
    const value = behavioralEvidenceFixture();
    (
      value.synthetic_interviews as {
        response_summary: string;
      }[]
    )[0]!.response_summary = "I loved this campaign.";

    expect(() => parseBehavioralEvidence(value)).toThrow(
      "invalid behavioral evidence API contract",
    );
  });

  it("rejects timeline shares that are not canonical", () => {
    const value = behavioralEvidenceFixture();
    (
      value.rounds as {
        action_shares: [string, number][];
      }[]
    )[0]!.action_shares.reverse();

    expect(() => parseBehavioralEvidence(value)).toThrow(
      "invalid behavioral evidence API contract",
    );
  });

  it("accepts only a bound, no-winner matched comparison", () => {
    expect(
      parseBehavioralComparison(behavioralComparisonFixture(), {
        baselineRunId: BEHAVIORAL_BASELINE_RUN_ID,
        candidateRunId: BEHAVIORAL_RUN_ID,
        studyId: BEHAVIORAL_PROJECT_ID,
      }),
    ).toMatchObject({
      paired_agents: 20,
      winner: null,
    });
  });

  it("rejects a comparison that declares a winner", () => {
    const value = behavioralComparisonFixture();
    value.winner = "candidate";

    expect(() => parseBehavioralComparison(value)).toThrow(
      "invalid behavioral comparison API contract",
    );
  });
});
