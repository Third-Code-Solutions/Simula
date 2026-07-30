import { validatedResultArtifact } from "./result-validator";

const RUN_ID = "018f274b-3c77-7b22-b749-c9274230ef9a";
const LIMITATION =
  "Estimates nobody and is not representative of any population.";

function artifact() {
  return {
    schema_version: "1.0.0",
    run_id: RUN_ID,
    validation_label: "experimental",
    outputs: [
      {
        output_id: "reaction_fixture",
        kind: "demo_fixture_distribution",
        label: "Pipeline demo values",
        value: {
          unit: "share",
          categories: [
            { key: "clear", value: 0.5 },
            { key: "unclear", value: 0.3 },
            { key: "needs_human_review", value: 0.2 },
          ],
        },
        uncertainty: {
          status: "not_applicable",
          reason: "authored deterministic fixture",
        },
        limitations: [LIMITATION],
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
      code_release_sha: "a".repeat(40),
      configuration_sha256: "b".repeat(64),
      frozen_manifest_sha256: "c".repeat(64),
      deterministic_seed: "42",
      output_schema_version: 1,
    },
    limitations: [LIMITATION],
  };
}

describe("validatedResultArtifact", () => {
  it("admits the generated experimental result contract", () => {
    const value = artifact();
    expect(validatedResultArtifact(value)).toBe(value);
  });

  it("rejects extra or scientifically stronger output fields", () => {
    expect(() =>
      validatedResultArtifact({
        ...artifact(),
        predicted_sales_lift: 0.92,
      }),
    ).toThrow("invalid simulation result");
  });
});
