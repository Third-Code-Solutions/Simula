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
});
