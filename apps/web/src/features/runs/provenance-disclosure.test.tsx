import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseSimulationProvenance } from "./result-contract";

const mocks = vi.hoisted(() => ({ getSimulationProvenance: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getSimulationProvenance: mocks.getSimulationProvenance };
});

import { ProvenanceDisclosure } from "./provenance-disclosure";

const RUN_ID = "00000000-0000-4000-8000-000000000001";
const hostileStimulus = "<img src=x onerror=alert(1)>";

describe("ProvenanceDisclosure", () => {
  beforeEach(() => {
    mocks.getSimulationProvenance.mockReset();
    mocks.getSimulationProvenance.mockResolvedValue(
      parseSimulationProvenance({
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
          content: hostileStimulus,
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
        },
        limits: {
          version: "phase2_2026_07_17",
          arq_job_timeout_seconds: 30,
          provider_cost_ceiling: 0,
          max_database_attempts: 3,
          max_dispatch_generations: 3,
          max_result_bytes: 131072,
        },
      }),
    );
  });

  it("renders frozen user text as text, never generated markup", async () => {
    const { container } = render(<ProvenanceDisclosure runId={RUN_ID} />);
    const details = container.querySelector("details");
    if (!details) {
      throw new Error("provenance disclosure is absent");
    }
    details.open = true;
    fireEvent(details, new Event("toggle"));

    expect(await screen.findByText(hostileStimulus)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });
});
