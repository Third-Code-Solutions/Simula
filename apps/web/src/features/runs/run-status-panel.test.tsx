import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SimulationRun } from "./result-contract";
import { RunStatusPanel } from "./run-status-panel";

const RUN_ID = "00000000-0000-4000-8000-000000000001";

function runFixture(state: SimulationRun["state"]): SimulationRun {
  return {
    id: RUN_ID,
    organization_id: "00000000-0000-4000-8000-000000000002",
    project_id: "00000000-0000-4000-8000-000000000003",
    stimulus_version_id: "00000000-0000-4000-8000-000000000004",
    audience_version_id: "00000000-0000-4000-8000-000000000005",
    state,
    schema_version: 1 as const,
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

describe("RunStatusPanel", () => {
  it("has an explicit status for every closed run state", () => {
    const expected: ReadonlyArray<readonly [SimulationRun["state"], string]> = [
      ["queued", "Queued"],
      ["running", "Running"],
      ["retrying", "Retrying"],
      ["cancel_requested", "Cancellation requested"],
      ["succeeded", "Complete"],
      ["failed", "Failed"],
      ["canceled", "Canceled"],
    ];

    for (const [state, label] of expected) {
      const { unmount } = render(
        <RunStatusPanel isSlow={false} run={runFixture(state)} />,
      );
      expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
      unmount();
    }
  });

  it("makes loading and slow-running states explicit", () => {
    const { rerender } = render(
      <RunStatusPanel isSlow={false} run={undefined} />,
    );
    expect(
      screen.getByRole("heading", { name: "Loading run status" }),
    ).toBeInTheDocument();

    rerender(<RunStatusPanel isSlow run={runFixture("running")} />);
    expect(screen.getByText(/Taking longer than expected/)).toBeInTheDocument();
  });

  it("describes schema-v2 work as synthetic-agent execution", () => {
    render(
      <RunStatusPanel
        isSlow={false}
        run={{
          ...runFixture("running"),
          schema_version: 2,
          job_id: `run-${RUN_ID}-generation-1`,
        }}
      />,
    );

    expect(
      screen.getByText(/governed behavioral engine.*synthetic-agent rounds/i),
    ).toBeInTheDocument();
  });

  it("explains failed runs without presenting a substitute result", () => {
    render(<RunStatusPanel isSlow={false} run={runFixture("failed")} />);

    expect(
      screen.getByText(/SIMULA will not substitute a result/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/018f0bf1-0b2a-7c91-9d8a-d1bd92d5a4f4/),
    ).toBeInTheDocument();
  });
});
