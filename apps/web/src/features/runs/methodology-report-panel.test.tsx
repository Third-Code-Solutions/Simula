import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BEHAVIORAL_ORGANIZATION_ID,
  BEHAVIORAL_PROJECT_ID,
  BEHAVIORAL_RUN_ID,
} from "@/test/behavioral-fixtures";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    createReportExport: vi.fn(),
    createRunMethodologyReport: vi.fn(),
    downloadReportExport: vi.fn(),
    getRunReport: vi.fn(),
    listSimulationConfigurations: vi.fn(),
  };
});

import {
  ApiProblem,
  createReportExport,
  createRunMethodologyReport,
  downloadReportExport,
  getRunReport,
  listSimulationConfigurations,
  type SimulationRun,
} from "@/lib/api";

import { MethodologyReportPanel } from "./methodology-report-panel";

const CONFIGURATION_ID = "018f274b-3c77-7b22-b749-c9274230efa4";
const REPORT_ID = "018f274b-3c77-7b22-b749-c9274230efa5";
const EXPORT_ID = "018f274b-3c77-7b22-b749-c9274230efa6";
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

function reportData() {
  return {
    report_id: REPORT_ID,
    run_id: BEHAVIORAL_RUN_ID,
    schema_version: "2.0.0",
    content_sha256: "a".repeat(64),
    created_at: "2026-07-29T06:00:00.123456Z",
    replayed: false,
    artifact: {
      schema_version: "2.0.0",
      identity: {
        report_id: REPORT_ID,
        run_id: BEHAVIORAL_RUN_ID,
      },
      experimental_notice:
        "Experimental synthetic-cohort rehearsal. No outcome claim is made.",
      transparency: {
        validation_label: "experimental",
        numerical_output_kind: "heuristic_score",
      },
    },
  };
}

describe("MethodologyReportPanel", () => {
  beforeEach(() => {
    vi.mocked(listSimulationConfigurations).mockReset();
    vi.mocked(getRunReport).mockReset();
    vi.mocked(createRunMethodologyReport).mockReset();
    vi.mocked(createReportExport).mockReset();
    vi.mocked(downloadReportExport).mockReset();
    vi.mocked(listSimulationConfigurations).mockResolvedValue({
      items: [
        {
          configuration_version_id: CONFIGURATION_ID,
          name: "Frozen rehearsal",
          version: 1,
        },
      ],
    });
    vi.mocked(getRunReport).mockRejectedValue(
      new ApiProblem(404, "not_found", "No report exists for this run."),
    );
    vi.mocked(createRunMethodologyReport).mockResolvedValue({
      data: reportData(),
    });
    vi.mocked(createReportExport).mockResolvedValue({
      data: {
        export_id: EXPORT_ID,
        report_id: REPORT_ID,
      },
    });
    vi.mocked(downloadReportExport).mockResolvedValue({
      blob: new Blob(["report"], { type: "application/json" }),
      filename: "simula-baseline.json",
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn().mockReturnValue("blob:simula-report"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
  });

  it("creates a bound durable report and downloads a safe export", async () => {
    const user = userEvent.setup();
    render(<MethodologyReportPanel defaultVariantKey="baseline" run={RUN} />);

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Frozen configuration" }),
      CONFIGURATION_ID,
    );
    expect(screen.getByRole("textbox", { name: "Variant key" })).toHaveValue(
      "baseline",
    );
    await user.click(
      screen.getByRole("button", { name: "Create durable report" }),
    );

    expect(createRunMethodologyReport).toHaveBeenCalledWith(BEHAVIORAL_RUN_ID, {
      configuration_version_id: CONFIGURATION_ID,
      variant_key: "baseline",
      variant_label: "Completed run variant",
    });
    expect(
      await screen.findByText(/No outcome claim is made/i),
    ).toBeInTheDocument();
    expect(screen.getByText("heuristic_score")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Download JSON" }));

    await waitFor(() => {
      expect(createReportExport).toHaveBeenCalledWith(
        REPORT_ID,
        expect.objectContaining({ format: "json" }),
      );
      expect(downloadReportExport).toHaveBeenCalledWith(EXPORT_ID);
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:simula-report");
    });
  });
});
