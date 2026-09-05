import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BoundCalibration } from "./bound-calibration";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  history: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  listCampaignLabRuns: mocks.list,
  listCampaignLabBoundCalibrations: mocks.history,
  createCampaignLabCalibrationFromRuns: mocks.create,
  getCampaignLabCalibrationRun: mocks.get,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});
const row = {
  campaign_id: "campaign",
  status: "succeeded",
  created_at: "2026-09-05T00:00:00Z",
};
it("queues only selected saved references and retains the key after an uncertain failure", async () => {
  mocks.list.mockResolvedValue({
    items: [
      { ...row, id: "simulation", run_type: "repeated_simulation" },
      { ...row, id: "survey", run_type: "survey_import" },
    ],
  });
  mocks.history.mockResolvedValue({ items: [] });
  mocks.create
    .mockRejectedValueOnce(new Error("Network interrupted"))
    .mockResolvedValueOnce({ run_id: "comparison" });
  mocks.get.mockResolvedValue({
    ...row,
    id: "comparison",
    run_type: "survey_calibration",
    result: {
      matched_variants: 2,
      matched_observations: 2,
      aggregate_metric_mae: 7.2,
      evidence_binding: { version: "calibration_from_runs_v1" },
    },
  });
  render(<BoundCalibration campaignId="campaign" />);
  expect(mocks.list).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Choose saved evidence" }),
  );
  fireEvent.change(await screen.findByLabelText("Completed message test"), {
    target: { value: "simulation" },
  });
  fireEvent.change(screen.getByLabelText("Completed survey import"), {
    target: { value: "survey" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Compare saved evidence" }),
  );
  await screen.findByText("Network interrupted");
  fireEvent.click(
    screen.getByRole("button", { name: "Compare saved evidence" }),
  );
  await screen.findByRole("heading", { name: "Survey comparison result" });
  expect(mocks.create.mock.calls[0]).toEqual(mocks.create.mock.calls[1]);
  expect(mocks.create).toHaveBeenCalledWith(
    "campaign",
    {
      simulation_run_id: "simulation",
      survey_import_run_id: "survey",
      calibration_version: "calibration_v1",
    },
    expect.any(String),
  );
  expect(new URL(window.location.href).searchParams.get("calibration")).toBe(
    "comparison",
  );
});
it("restores a bound saved comparison and aborts on unmount", async () => {
  window.history.replaceState(
    null,
    "",
    "/?campaign=campaign&calibration=saved",
  );
  mocks.get.mockResolvedValue({
    ...row,
    id: "saved",
    run_type: "survey_calibration",
    result: { evidence_binding: { version: "calibration_from_runs_v1" } },
  });
  const view = render(<BoundCalibration campaignId="campaign" />);
  await screen.findByRole("heading", { name: "Survey comparison result" });
  const signal = mocks.get.mock.calls[0]?.[1] as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
});
it("refuses to display a legacy unbound comparison as verified evidence", async () => {
  window.history.replaceState(
    null,
    "",
    "/?campaign=campaign&calibration=legacy",
  );
  mocks.get.mockResolvedValue({
    ...row,
    id: "legacy",
    run_type: "survey_calibration",
    result: { matched_variants: 2 },
  });
  render(<BoundCalibration campaignId="campaign" />);
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "legacy comparison lacks verified input bindings",
    ),
  );
  expect(
    screen.queryByRole("heading", { name: "Survey comparison result" }),
  ).not.toBeInTheDocument();
});
