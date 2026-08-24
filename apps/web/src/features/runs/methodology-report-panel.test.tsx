import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  BEHAVIORAL_ORGANIZATION_ID,
  BEHAVIORAL_PROJECT_ID,
  BEHAVIORAL_RUN_ID,
} from "@/test/behavioral-fixtures";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    downloadReportExport: vi.fn(),
    getRunReport: vi.fn(),
  };
});

import {
  downloadReportExport,
  getRunReport,
  type SimulationRun,
} from "@/lib/api";

import { MethodologyReportPanel } from "./methodology-report-panel";

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
} as SimulationRun;

describe("MethodologyReportPanel", () => {
  it("quarantines legacy artifacts and exposes no read, export, or create command", () => {
    render(<MethodologyReportPanel defaultVariantKey="baseline" run={RUN} />);

    expect(
      screen.getByText(/creation, legacy display, and export are unavailable/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/created before that binding/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(getRunReport).not.toHaveBeenCalled();
    expect(downloadReportExport).not.toHaveBeenCalled();
  });
});
