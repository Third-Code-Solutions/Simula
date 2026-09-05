import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BoundReport } from "./bound-report";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  comparisons: vi.fn(),
  history: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  review: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  listCampaignLabRuns: mocks.list,
  listCampaignLabBoundCalibrations: mocks.comparisons,
  listCampaignLabBoundReports: mocks.history,
  createCampaignLabBoundReport: mocks.create,
  getCampaignLabBoundReport: mocks.get,
  reviewCampaignLabBoundReport: mocks.review,
  exportCampaignLabBoundReport: mocks.download,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/");
});
const draft = {
  id: "report",
  campaign_id: "campaign",
  status: "succeeded",
  run_type: "report",
  result: {
    executive_summary: "Engineering fixture summary",
    evidence_status: "Synthetic-only",
  },
  review: null,
};
it("queues saved references with the same idempotency key after uncertain failure", async () => {
  mocks.list.mockResolvedValue({
    items: [
      {
        id: "simulation",
        run_type: "repeated_simulation",
        status: "succeeded",
        created_at: "2026-09-05",
      },
    ],
  });
  mocks.comparisons.mockResolvedValue({ items: [] });
  mocks.history.mockResolvedValue({ items: [] });
  mocks.create
    .mockRejectedValueOnce(new Error("Connection interrupted"))
    .mockResolvedValueOnce({ run_id: "report" });
  mocks.get.mockResolvedValue(draft);
  render(<BoundReport campaignId="campaign" />);
  expect(mocks.list).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Choose report evidence" }),
  );
  fireEvent.change(
    await screen.findByLabelText("Saved simulation for report"),
    { target: { value: "simulation" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Create report draft" }));
  await screen.findByText("Connection interrupted");
  fireEvent.click(screen.getByRole("button", { name: "Create report draft" }));
  await screen.findByText("Engineering fixture summary");
  expect(mocks.create.mock.calls[0]).toEqual(mocks.create.mock.calls[1]);
  expect(mocks.create).toHaveBeenCalledWith(
    "campaign",
    { simulation_run_id: "simulation" },
    expect.any(String),
  );
  expect(
    screen.queryByRole("button", {
      name: "Download approved experimental report",
    }),
  ).not.toBeInTheDocument();
});
it("restores a draft, records only a decision and rationale, then allows fresh server export", async () => {
  window.history.replaceState(null, "", "/?report=report");
  mocks.get.mockResolvedValue(draft);
  mocks.review.mockResolvedValue({ decision: "approved_experimental" });
  mocks.download.mockRejectedValue(new Error("Source rights were revoked"));
  const view = render(<BoundReport campaignId="campaign" />);
  await screen.findByText("Engineering fixture summary");
  const signal = mocks.get.mock.calls[0]?.[1];
  fireEvent.change(screen.getByLabelText("Review rationale"), {
    target: { value: "Reviewed engineering evidence only." },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Record independent review" }),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Download approved experimental report",
    }),
  );
  await screen.findByText("Source rights were revoked");
  expect(mocks.review).toHaveBeenCalledWith("report", {
    decision: "approved_experimental",
    rationale: "Reviewed engineering evidence only.",
  });
  expect(mocks.download).toHaveBeenCalledWith("report");
  view.unmount();
  expect(signal.aborted).toBe(true);
});
it("revokes an approved report without rendering its previous content", async () => {
  window.history.replaceState(null, "", "/?report=report");
  mocks.get.mockResolvedValue({
    ...draft,
    review: { decision: "approved_experimental" },
  });
  mocks.review.mockResolvedValue({ decision: "revoked" });
  render(<BoundReport campaignId="campaign" />);
  await screen.findByText("Engineering fixture summary");
  fireEvent.change(screen.getByLabelText("Review rationale"), {
    target: { value: "Source approval must be withdrawn." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Revoke approval" }));
  await screen.findByText("Report revoked. Export is now unavailable.");
  expect(mocks.review).toHaveBeenCalledWith("report", {
    decision: "revoked",
    rationale: "Source approval must be withdrawn.",
  });
  expect(
    screen.queryByText("Engineering fixture summary"),
  ).not.toBeInTheDocument();
});
it("rejects results from a different campaign", async () => {
  window.history.replaceState(null, "", "/?report=report");
  mocks.get.mockResolvedValue({ ...draft, campaign_id: "different" });
  render(<BoundReport campaignId="campaign" />);
  await screen.findByText("Report does not belong to this campaign.");
  await waitFor(() =>
    expect(
      screen.queryByText("Engineering fixture summary"),
    ).not.toBeInTheDocument(),
  );
});
