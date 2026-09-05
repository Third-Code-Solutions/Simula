import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BoundBacktest } from "./bound-backtest";
const mocks = vi.hoisted(() => ({
  inputs: vi.fn(),
  history: vi.fn(),
  sources: vi.fn(),
  create: vi.fn(),
  admit: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  listBoundBacktestInputs: mocks.inputs,
  listBoundBacktests: mocks.history,
  listBoundBacktestSources: mocks.sources,
  createBoundBacktestCommitment: mocks.create,
  admitBoundBacktestOutcomes: mocks.admit,
  getBoundBacktest: mocks.get,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/");
});
it("commits only saved run references and retains retry identity", async () => {
  mocks.inputs.mockResolvedValue({
    items: [
      {
        id: "dev",
        campaign_id: "other",
        campaign_name: "Development",
        created_at: "2026-09-05",
      },
      {
        id: "hold",
        campaign_id: "campaign",
        campaign_name: "Holdout",
        created_at: "2026-09-05",
      },
    ],
  });
  mocks.history.mockResolvedValue({ items: [] });
  mocks.sources.mockResolvedValue({ items: [] });
  mocks.create
    .mockRejectedValueOnce(new Error("Connection interrupted"))
    .mockResolvedValueOnce({ run_id: "commit" });
  mocks.get.mockResolvedValue({
    campaign_id: "campaign",
    status: "succeeded",
    result: { phase: "preregistered" },
  });
  render(<BoundBacktest campaignId="campaign" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Choose historical evidence" }),
  );
  fireEvent.change(
    await screen.findByLabelText(
      "Development simulation from another campaign",
    ),
    { target: { value: "dev" } },
  );
  fireEvent.change(screen.getByLabelText("Saved simulation to hold out"), {
    target: { value: "hold" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Record prediction commitment" }),
  );
  await screen.findByText("Connection interrupted");
  fireEvent.click(
    screen.getByRole("button", { name: "Record prediction commitment" }),
  );
  await screen.findByRole("heading", {
    name: "Prediction commitment recorded",
  });
  expect(mocks.create.mock.calls[0]).toEqual(mocks.create.mock.calls[1]);
  expect(mocks.create).toHaveBeenCalledWith(
    "campaign",
    {
      development_run_ids: ["dev"],
      holdout_run_ids: ["hold"],
      outcome_metric: "clarity",
      minimum_campaigns: 1,
    },
    expect.any(String),
  );
  expect(new URL(location.href).searchParams.get("backtest")).toBe("commit");
});
it("restores persisted comparisons and cancels reads on unmount", async () => {
  window.history.replaceState(null, "", "/?backtest=saved");
  mocks.get.mockResolvedValue({
    campaign_id: "campaign",
    status: "succeeded",
    result: { phase: "evaluated", mae: 3, campaign_count: 1 },
  });
  const view = render(<BoundBacktest campaignId="campaign" />);
  await screen.findByRole("heading", { name: "Historical comparison result" });
  const signal = mocks.get.mock.calls[0]?.[1];
  view.unmount();
  expect(signal.aborted).toBe(true);
});
it("keeps revoked or unavailable evidence content hidden", async () => {
  window.history.replaceState(null, "", "/?backtest=saved");
  mocks.get.mockRejectedValue(new Error("Source admission unavailable"));
  render(<BoundBacktest campaignId="campaign" />);
  await screen.findByText("Source admission unavailable");
  expect(
    screen.queryByRole("heading", { name: "Historical comparison result" }),
  ).not.toBeInTheDocument();
});
it("loads older evidence without losing current options", async () => {
  mocks.inputs
    .mockResolvedValueOnce({
      items: [
        {
          id: "new",
          campaign_id: "campaign",
          campaign_name: "New",
          created_at: "2026-09-05",
        },
      ],
      next_offset: 100,
    })
    .mockResolvedValueOnce({
      items: [
        {
          id: "old",
          campaign_id: "other",
          campaign_name: "Older development",
          created_at: "2026-09-01",
        },
      ],
      next_offset: null,
    });
  mocks.history.mockResolvedValue({ items: [] });
  mocks.sources.mockResolvedValue({ items: [] });
  render(<BoundBacktest campaignId="campaign" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Choose historical evidence" }),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Load older historical evidence",
    }),
  );
  await screen.findByRole("option", { name: /Older development/ });
  expect(mocks.inputs).toHaveBeenLastCalledWith(
    "campaign",
    expect.any(AbortSignal),
    100,
  );
  expect(screen.getByRole("option", { name: /New/ })).toBeInTheDocument();
});
