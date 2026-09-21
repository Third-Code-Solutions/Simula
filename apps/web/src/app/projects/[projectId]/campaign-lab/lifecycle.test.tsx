import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProblem, type CampaignLabDurableRun } from "@/lib/api";
import { StrictMode } from "react";
import { CampaignLabWorkspace, useDurableRunPolling } from "./workspace";
import { StructuredEditor } from "./structured-editor";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  preview: vi.fn(),
  importSurvey: vi.fn(),
  list: vi.fn(),
  history: vi.fn(),
  status: vi.fn(),
  detail: vi.fn(),
  result: vi.fn(),
}));

vi.mock("@/app/workspace-sidebar", () => ({ WorkspaceSidebar: () => null }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getProject: vi.fn(async () => ({ organization_id: "org" })),
  getMethodologyRegistry: vi.fn(async () => ({ population_frames: [] })),
  listCampaignLabForecastDatasets: vi.fn(async () => ({ items: [] })),
  listCampaignLabRuns: mocks.history,
  getCampaignLabSimulationStatus: mocks.status,
  getCampaignLabCampaign: mocks.detail,
  getCampaignLabSimulationResults: mocks.result,
  getCampaignLabAudit: vi.fn(async () => ({ items: [] })),
  listCampaignLabCampaigns: mocks.list,
  createCampaignLabCampaign: mocks.create,
  previewCampaignLabSurveyImport: mocks.preview,
  createCampaignLabSurveyImport: mocks.importSurvey,
}));

beforeEach(() => {
  mocks.history.mockResolvedValue({ items: [] });
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const queued: CampaignLabDurableRun = {
  id: "run-one",
  campaign_id: "campaign-one",
  run_type: "survey_import",
  status: "queued",
  stage: "queued",
  progress: 0,
  attempt_count: 0,
  created_at: "2026-09-05T00:00:00Z",
  started_at: null,
  completed_at: null,
  last_error_code: null,
  retention_until: null,
};

describe("Campaign Lab request lifecycle", () => {
  it("waits between polls, keeps one request in flight and stops on completion", async () => {
    vi.useFakeTimers();
    let resolvePoll: ((value: CampaignLabDurableRun) => void) | undefined;
    const fetchRun = vi.fn(
      () =>
        new Promise<CampaignLabDurableRun>((resolve) => {
          resolvePoll = resolve;
        }),
    );
    const update = vi.fn();
    const { rerender } = renderHook(
      ({ run }) => useDurableRunPolling(run, fetchRun, update, vi.fn()),
      { initialProps: { run: queued } },
    );
    expect(fetchRun).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchRun).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fetchRun).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolvePoll?.({ ...queued, status: "running" });
    });
    rerender({ run: { ...queued, status: "running", progress: 10 } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(fetchRun).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchRun).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolvePoll?.({ ...queued, status: "succeeded" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fetchRun).toHaveBeenCalledTimes(2);
  });

  it("ignores a late response after campaign state unmounts", async () => {
    vi.useFakeTimers();
    let resolvePoll: ((value: CampaignLabDurableRun) => void) | undefined;
    const fetchRun = vi.fn(
      () =>
        new Promise<CampaignLabDurableRun>((resolve) => {
          resolvePoll = resolve;
        }),
    );
    const update = vi.fn();
    const { unmount } = renderHook(() =>
      useDurableRunPolling(queued, fetchRun, update, vi.fn()),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    unmount();
    await act(async () => {
      resolvePoll?.({ ...queued, status: "succeeded" });
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("creates once, resets the captured form and selects the saved campaign", async () => {
    mocks.list.mockResolvedValue({ items: [] });
    mocks.create.mockImplementation(async () => {
      mocks.list.mockResolvedValue({
        items: [
          { id: "new-campaign", name: "Message comparison", status: "draft" },
        ],
      });
      return { campaign_id: "new-campaign", status: "draft" };
    });
    render(<CampaignLabWorkspace projectId="project" />);
    await screen.findByText(/No Campaign Lab workspace yet/);
    fireEvent.change(screen.getByLabelText("Campaign name"), {
      target: { value: "Message comparison" },
    });
    fireEvent.change(screen.getByLabelText("Decision objective"), {
      target: { value: "Compare message clarity" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create message test" }),
    );
    expect(
      await screen.findByRole("button", { name: "Message comparison · draft" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Campaign name")).toHaveValue("");
  });

  it("reuses the logical key after an uncertain creation failure", async () => {
    mocks.list.mockResolvedValue({ items: [] });
    mocks.create.mockRejectedValue(new Error("connection interrupted"));
    render(<CampaignLabWorkspace projectId="project" />);
    await screen.findByText(/No Campaign Lab workspace yet/);
    fireEvent.change(screen.getByLabelText("Campaign name"), {
      target: { value: "Message comparison" },
    });
    fireEvent.change(screen.getByLabelText("Decision objective"), {
      target: { value: "Compare message clarity" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create message test" }),
    );
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Create message test" }),
    );
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[0]?.[1]).toEqual(
      mocks.create.mock.calls[1]?.[1],
    );
    expect(mocks.create.mock.calls[0]?.[1]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("discards previous campaign form state when switching", async () => {
    mocks.list.mockResolvedValue({
      items: [
        { id: "one", name: "First campaign", status: "draft" },
        { id: "two", name: "Second campaign", status: "draft" },
      ],
    });
    render(<CampaignLabWorkspace projectId="project" />);
    await screen.findByRole("button", { name: "First campaign · draft" });
    fireEvent.change(screen.getByLabelText("Research source JSON"), {
      target: { value: '{"title":"Private first campaign source"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: /Second campaign/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Second campaign/ }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByLabelText("Research source JSON")).not.toHaveValue(
      '{"title":"Private first campaign source"}',
    );
  });
  it("restores the selected campaign and active run after a refresh", async () => {
    window.history.replaceState(
      null,
      "",
      "/?campaign=two&simulation=saved-two#agent-activity",
    );
    mocks.list.mockResolvedValue({
      items: [
        { id: "one", name: "First campaign", status: "draft" },
        { id: "two", name: "Second campaign", status: "draft" },
      ],
    });
    mocks.status.mockResolvedValue({
      ...queued,
      id: "saved-two",
      campaign_id: "two",
      status: "running",
    });
    render(<CampaignLabWorkspace projectId="project" />);
    expect(await screen.findByText("saved-two")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Second campaign/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(mocks.status).toHaveBeenCalledWith(
      "saved-two",
      expect.any(AbortSignal),
    );
  });

  it("reopens a saved run from server history without creating another command", async () => {
    mocks.list.mockResolvedValue({
      items: [{ id: "one", name: "First campaign", status: "draft" }],
    });
    mocks.history.mockResolvedValue({
      items: [
        {
          ...queued,
          id: "saved-one",
          campaign_id: "one",
          run_type: "repeated_simulation",
        },
      ],
    });
    mocks.status.mockResolvedValue({
      ...queued,
      id: "saved-one",
      campaign_id: "one",
      status: "running",
    });
    render(<CampaignLabWorkspace projectId="project" />);
    fireEvent.click(await screen.findByText("Saved runs"));
    fireEvent.click(await screen.findByRole("button", { name: /Open run/ }));
    await waitFor(() =>
      expect(new URL(window.location.href).searchParams.get("simulation")).toBe(
        "saved-one",
      ),
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "2. Test messages" }),
    ).toHaveAttribute("aria-current", "page");
  });
  it("restores a saved campaign outside the first list page", async () => {
    window.history.replaceState(null, "", "/?campaign=older");
    mocks.list.mockResolvedValue({
      items: [{ id: "recent", name: "Recent campaign", status: "draft" }],
      pagination: { limit: 50, offset: 0 },
    });
    mocks.detail.mockResolvedValue({
      campaign: {
        id: "older",
        name: "Older saved campaign",
        project_id: "project",
        status: "draft",
      },
    });
    render(<CampaignLabWorkspace projectId="project" />);
    expect(
      await screen.findByRole("button", { name: /Older saved campaign/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(mocks.detail).toHaveBeenCalledWith("older", expect.any(AbortSignal));
    expect(
      screen.getByRole("button", { name: /Recent campaign/ }),
    ).toHaveAttribute("aria-pressed", "false");
  });
  it("keeps completed results available when reopening the same saved run twice", async () => {
    mocks.list.mockResolvedValue({
      items: [{ id: "one", name: "First campaign", status: "draft" }],
    });
    const saved = {
      ...queued,
      id: "completed-one",
      campaign_id: "one",
      run_type: "repeated_simulation",
      status: "succeeded",
    };
    mocks.history.mockResolvedValue({ items: [saved] });
    mocks.status.mockResolvedValue(saved);
    mocks.result.mockResolvedValue({
      run_id: saved.id,
      evidence_status: "Synthetic-only",
      result: {
        sample_size: 10,
        repetitions: 3,
        overall_component_rankings: {},
        cohort_findings: [],
        synthetic_observations: [],
      },
    });
    render(<CampaignLabWorkspace projectId="project" />);
    fireEvent.click(await screen.findByText("Saved runs"));
    fireEvent.click(await screen.findByRole("button", { name: /Open run/ }));
    await screen.findByRole("heading", { name: "Repeated component findings" });
    fireEvent.click(screen.getByRole("button", { name: /Open run/ }));
    await waitFor(() => expect(mocks.result).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("heading", {
        name: "Repeated component findings",
      }),
    ).toBeInTheDocument();
  });
  it("shares initialization across StrictMode effect replay", async () => {
    mocks.list.mockResolvedValue({
      items: [{ id: "one", name: "First campaign", status: "draft" }],
    });
    render(
      <StrictMode>
        <CampaignLabWorkspace projectId="project" />
      </StrictMode>,
    );
    await screen.findByRole("button", { name: /First campaign/ });
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After when restoring completed results is rate limited", async () => {
    window.history.replaceState(
      null,
      "",
      "/?campaign=one&simulation=completed-one#results",
    );
    mocks.list.mockResolvedValue({
      items: [{ id: "one", name: "First campaign", status: "draft" }],
    });
    mocks.status.mockResolvedValue({
      ...queued,
      id: "completed-one",
      campaign_id: "one",
      status: "succeeded",
    });
    mocks.result
      .mockRejectedValueOnce(
        new ApiProblem(429, "rate_limited", "Wait", undefined, 1),
      )
      .mockResolvedValue({
        run_id: "completed-one",
        evidence_status: "Synthetic-only",
        result: {
          sample_size: 10,
          repetitions: 3,
          overall_component_rankings: {},
          cohort_findings: [],
          synthetic_observations: [],
        },
      });
    render(<CampaignLabWorkspace projectId="project" />);
    expect(
      await screen.findByRole(
        "heading",
        { name: "Repeated component findings" },
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(mocks.result).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Structured evidence inputs", () => {
  it("updates typed fields without requiring JSON and preserves unexposed fields", () => {
    const change = vi.fn();
    render(
      <StructuredEditor
        id="metadata"
        label="Source"
        value='{"owner":"","consent_recorded":false,"version":2}'
        onChange={change}
      />,
    );
    fireEvent.change(screen.getByLabelText("Owner"), {
      target: { value: "Research team" },
    });
    expect(JSON.parse(change.mock.calls[0]?.[0])).toEqual({
      owner: "Research team",
      consent_recorded: false,
      version: 2,
    });
    fireEvent.click(screen.getByLabelText("Consent recorded"));
    expect(JSON.parse(change.mock.calls[1]?.[0]).consent_recorded).toBe(true);
    expect(
      screen.getByText("Advanced: edit source as JSON").parentElement,
    ).not.toHaveAttribute("open");
  });
});

it("requires a fresh preview after mapping changes before queueing a survey", async () => {
  window.history.replaceState(null, "", "/?campaign=one#surveys");
  mocks.list.mockResolvedValue({
    items: [{ id: "one", name: "Survey campaign", status: "draft" }],
  });
  mocks.preview.mockResolvedValue({
    summary: {
      input_response_count: 10,
      accepted_response_count: 8,
      duplicate_response_count: 1,
      low_quality_response_count: 1,
      bot_response_count: 0,
      malformed_response_count: 0,
    },
    aggregate_group_count: 2,
    evidence_binding: { raw_payload_sha256: "abc" },
    disclosure: "Preview only. Requires separate rights admission.",
  });
  mocks.importSurvey.mockResolvedValue({ run_id: "survey-run" });
  render(<CampaignLabWorkspace projectId="project" />);
  const upload = await screen.findByLabelText("Survey export");
  const file = new File(["sample"], "survey.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", { value: async () => "sample" });
  fireEvent.change(upload, { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText("Adapter"), {
    target: { value: "csv" },
  });
  fireEvent.submit(upload.closest("form")!);
  expect(
    await screen.findByRole("status", { name: "Survey import preview" }),
  ).toHaveTextContent("8 accepted of 10");
  expect(mocks.importSurvey).not.toHaveBeenCalled();
  fireEvent.change(
    screen.getByLabelText("Approved survey source version ID (production)"),
    { target: { value: "changed-source" } },
  );
  expect(
    screen.queryByRole("status", { name: "Survey import preview" }),
  ).not.toBeInTheDocument();
  fireEvent.submit(upload.closest("form")!);
  await screen.findByRole("button", {
    name: "Confirm and queue survey import",
  });
  expect(mocks.preview).toHaveBeenCalledTimes(2);
  fireEvent.submit(upload.closest("form")!);
  await waitFor(() => expect(mocks.importSurvey).toHaveBeenCalledTimes(1));
  expect(mocks.importSurvey).toHaveBeenCalledWith(
    "one",
    expect.objectContaining({ source_version_id: "changed-source" }),
    expect.any(String),
  );
});
