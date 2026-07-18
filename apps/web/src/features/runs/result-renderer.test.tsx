import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { parseSimulationResult } from "./result-contract";
import { ResultRenderer } from "./result-renderer";

const RUN_ID = "00000000-0000-4000-8000-000000000001";

function unavailableResult() {
  return parseSimulationResult({
    run_id: RUN_ID,
    schema_version: 1,
    artifact_sha256: "a".repeat(64),
    created_at: "2026-07-18T00:00:00Z",
    result: {
      schema_version: "1.0.0",
      run_id: RUN_ID,
      validation_label: "experimental",
      outputs: [
        {
          output_id: "reaction_fixture",
          kind: "unavailable",
          label: "Pipeline demo values",
          availability: "suppressed",
          reason:
            "This output is unavailable. SIMULA will not substitute a value.",
          limitations: [
            "Estimates nobody and is not representative of any population.",
          ],
        },
      ],
      qualitative: [
        {
          kind: "generated_qualitative",
          synthetic: true,
          text: "A deterministic mock observation used only to test rendering.",
          source_output_ids: ["reaction_fixture"],
        },
      ],
      recommendations: [
        {
          kind: "recommendation",
          text: "Verify wording with appropriately recruited human participants before acting.",
          source_output_ids: ["reaction_fixture"],
        },
      ],
      provenance: {
        method_version: "phase2_demo_v1",
        provider_id: "deterministic_mock",
        provider_version: 1,
        frozen_manifest_sha256: "b".repeat(64),
        deterministic_seed: "7",
        output_schema_version: 1,
      },
      limitations: [
        "Estimates nobody and is not representative of any population.",
      ],
    },
  });
}

describe("ResultRenderer", () => {
  it("renders an explicit unavailable state without a substitute value", () => {
    render(<ResultRenderer result={unavailableResult()} />);

    expect(
      screen.getByRole("heading", { name: "Pipeline demo values unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Status: suppressed. This output is unavailable. SIMULA will not substitute a value.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Generated explanation" }),
    ).not.toBeInTheDocument();
  });
});
