import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BEHAVIORAL_EVENT_ID,
  BEHAVIORAL_ORGANIZATION_ID,
  BEHAVIORAL_PROJECT_ID,
  BEHAVIORAL_RUN_ID,
  behavioralEvidenceFixture,
  behavioralResultFixture,
} from "@/test/behavioral-fixtures";

import { parseBehavioralEvidence } from "./behavioral-evidence-contract";
import { parseBehavioralResult } from "./behavioral-result-contract";
import { RunPollerRegistry } from "./run-poller";
import { RunWorkspace } from "./run-workspace";
import { parseRunAuditHistory } from "./run-audit-history-contract";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getBehavioralEvidence: vi.fn(),
    getBehavioralResult: vi.fn(),
    getOrganizationDashboard: vi.fn(),
    getRunAuditHistory: vi.fn(),
    getRunReport: vi.fn(),
    listSimulationConfigurations: vi.fn(),
  };
});

import {
  ApiProblem,
  getBehavioralEvidence,
  getBehavioralResult,
  getOrganizationDashboard,
  getRunAuditHistory,
  getRunReport,
  listSimulationConfigurations,
} from "@/lib/api";

const RUN = {
  id: BEHAVIORAL_RUN_ID,
  organization_id: BEHAVIORAL_ORGANIZATION_ID,
  project_id: BEHAVIORAL_PROJECT_ID,
  stimulus_version_id: "018f274b-3c77-7b22-b749-c9274230ef98",
  audience_version_id: "018f274b-3c77-7b22-b749-c9274230ef99",
  state: "succeeded",
  schema_version: 2,
  dispatch_generation: 1,
  job_id: `run-${BEHAVIORAL_RUN_ID}-generation-1`,
  version: 4,
  created_at: "2026-07-29T06:00:00.123456Z",
  failure: null,
} as const;

describe("RunWorkspace behavioral workflow", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(getBehavioralResult).mockResolvedValue(
      parseBehavioralResult(behavioralResultFixture(), BEHAVIORAL_RUN_ID),
    );
    vi.mocked(getBehavioralEvidence).mockResolvedValue(
      parseBehavioralEvidence(behavioralEvidenceFixture(), BEHAVIORAL_RUN_ID),
    );
    vi.mocked(getRunAuditHistory).mockResolvedValue(
      parseRunAuditHistory(
        {
          run_id: BEHAVIORAL_RUN_ID,
          events: [
            {
              event_id: BEHAVIORAL_EVENT_ID,
              previous_state: null,
              new_state: "queued",
              attempt_number: null,
              safe_reason: null,
              actor_type: "user",
              correlation_id: "018f274b-3c77-7b22-b749-c9274230efa1",
              created_at: "2026-07-29T06:00:00.123456Z",
            },
          ],
          disclosure:
            "Run state evidence only. Actor identities, payloads, prompts, agent memory, rationale, and free-form metadata are excluded.",
        },
        BEHAVIORAL_RUN_ID,
      ),
    );
    vi.mocked(getOrganizationDashboard).mockResolvedValue({
      permissions: {
        can_create_projects: true,
        can_create_runs: true,
      },
    } as never);
    vi.mocked(listSimulationConfigurations).mockResolvedValue({ items: [] });
    vi.mocked(getRunReport).mockRejectedValue(
      new ApiProblem(404, "not_found", "No report exists for this run."),
    );
  });

  it("binds report, evidence, audit history, and refinement in one succeeded run", async () => {
    const pollers = new RunPollerRegistry(
      vi.fn().mockResolvedValue(RUN),
      undefined,
      vi.fn(),
    );
    render(
      <RunWorkspace
        behavioralExperienceEnabled
        pollers={pollers}
        runId={BEHAVIORAL_RUN_ID}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Behavioral pressure-test report",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Run audit history" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Refine and retest" }),
    ).toBeInTheDocument();
    expect(getRunAuditHistory).toHaveBeenCalledWith(BEHAVIORAL_RUN_ID);
    expect(getOrganizationDashboard).toHaveBeenCalledWith(
      BEHAVIORAL_ORGANIZATION_ID,
    );
  });
});
