import { describe, expect, it } from "vitest";

import {
  parseSimulationProvenance,
  parseSimulationResult,
  parseSimulationRun,
} from "./result-contract";

const RUN_ID = "00000000-0000-4000-8000-000000000001";

function runFixture(state = "succeeded") {
  return {
    id: RUN_ID,
    organization_id: "00000000-0000-4000-8000-000000000002",
    project_id: "00000000-0000-4000-8000-000000000003",
    stimulus_version_id: "00000000-0000-4000-8000-000000000004",
    audience_version_id: "00000000-0000-4000-8000-000000000005",
    state,
    schema_version: 1,
    dispatch_generation: 1,
    job_id: `run:${RUN_ID}:dispatch:1`,
    version: 1,
    created_at: "2026-07-18T00:00:00Z",
    failure:
      state === "failed"
        ? {
            code: "execution_provider_failure",
            correlation_id: "018f0bf1-0b2a-7c91-9d8a-d1bd92d5a4f4",
            guidance:
              "No substitute result was generated. Retry or use the correlation ID for support.",
          }
        : null,
  };
}

describe("run/result browser contract decoder", () => {
  it.each([
    "queued",
    "running",
    "retrying",
    "cancel_requested",
    "succeeded",
    "failed",
    "canceled",
  ])("accepts the closed run state %s", (state) => {
    expect(parseSimulationRun(runFixture(state)).state).toBe(state);
  });

  it("accepts the exact BullMQ behavioral run identity", () => {
    expect(
      parseSimulationRun({
        ...runFixture(),
        schema_version: 2,
        job_id: `run-${RUN_ID}-generation-1`,
      }),
    ).toMatchObject({
      schema_version: 2,
      job_id: `run-${RUN_ID}-generation-1`,
    });
  });

  it("rejects a schema-v2 run with a legacy queue identity", () => {
    expect(() =>
      parseSimulationRun({ ...runFixture(), schema_version: 2 }),
    ).toThrow("invalid API contract");
  });

  it("fails closed on an unknown run state", () => {
    expect(() => parseSimulationRun(runFixture("invented"))).toThrow(
      "invalid API contract",
    );
  });

  it("rejects a failed run without its durable support correlation", () => {
    expect(() =>
      parseSimulationRun({ ...runFixture("failed"), failure: null }),
    ).toThrow("invalid API contract");
  });

  it("rejects a result whose wrapper and artifact identify different runs", () => {
    const response = {
      run_id: RUN_ID,
      schema_version: 1,
      artifact_sha256: "a".repeat(64),
      created_at: "2026-07-18T00:00:00Z",
      result: {
        schema_version: "1.0.0",
        run_id: "00000000-0000-4000-8000-000000000099",
        validation_label: "experimental",
        outputs: [
          {
            output_id: "reaction_fixture",
            kind: "demo_fixture_distribution",
            label: "Pipeline demo values",
            value: {
              unit: "share",
              categories: [
                { key: "clear", value: 0.4 },
                { key: "unclear", value: 0.35 },
                { key: "needs_human_review", value: 0.25 },
              ],
            },
            uncertainty: {
              status: "not_applicable",
              reason: "authored deterministic fixture",
            },
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
          code_release_sha: "a".repeat(40),
          configuration_sha256: "c".repeat(64),
          frozen_manifest_sha256: "b".repeat(64),
          deterministic_seed: "7",
          output_schema_version: 1,
        },
        limitations: [
          "Estimates nobody and is not representative of any population.",
        ],
      },
    };
    expect(() => parseSimulationResult(response)).toThrow(
      "invalid API contract",
    );
  });

  it("accepts escaped text only as data in authorized frozen provenance", () => {
    const provenance = parseSimulationProvenance({
      availability: "available",
      unavailable_reason: null,
      run_id: RUN_ID,
      created_at: "2026-07-18T00:00:00Z",
      terminal_at: null,
      result_created_at: null,
      frozen_manifest_sha256: "a".repeat(64),
      deterministic_seed: "7",
      stimulus: {
        version_id: "00000000-0000-4000-8000-000000000004",
        content: "<img src=x onerror=alert(1)>",
        content_sha256: "b".repeat(64),
      },
      audience: {
        version_id: "00000000-0000-4000-8000-000000000005",
        kind: "authored_demo",
        checksum_sha256: "c".repeat(64),
        cells: [{ key: "authored_demo", weight: 1 }],
        non_representative: true,
        limitations: [
          "Estimates nobody and is not representative of any population.",
        ],
      },
      execution: {
        method_version: "phase2_demo_v1",
        disclosure_version: "phase2_demo_v1",
        language: "en",
        output_schema_version: 1,
        provider_id: "deterministic_mock",
        provider_version: 1,
        pipeline_release_id: "phase2_deterministic_mock_v1",
        code_release_sha: "d".repeat(40),
        configuration_sha256: "e".repeat(64),
      },
      limits: {
        version: "phase2_2026_07_17",
        arq_job_timeout_seconds: 30,
        provider_cost_ceiling: 0,
        max_database_attempts: 3,
        max_dispatch_generations: 3,
        max_result_bytes: 131072,
      },
      provider_receipt: null,
    });
    expect(provenance.availability).toBe("available");
  });

  it("preserves an exact signed 64-bit deterministic seed as text", () => {
    const result = parseSimulationResult({
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
            kind: "demo_fixture_distribution",
            label: "Pipeline demo values",
            value: {
              unit: "share",
              categories: [
                { key: "clear", value: 0.4 },
                { key: "unclear", value: 0.35 },
                { key: "needs_human_review", value: 0.25 },
              ],
            },
            uncertainty: {
              status: "not_applicable",
              reason: "authored deterministic fixture",
            },
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
          code_release_sha: "a".repeat(40),
          configuration_sha256: "c".repeat(64),
          frozen_manifest_sha256: "b".repeat(64),
          deterministic_seed: "-4425823892900667840",
          output_schema_version: 1,
        },
        limitations: [
          "Estimates nobody and is not representative of any population.",
        ],
      },
    });

    expect(result.result.provenance.deterministic_seed).toBe(
      "-4425823892900667840",
    );
  });
});
