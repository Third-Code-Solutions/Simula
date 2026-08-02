import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

vi.mock("@/app/workspace-sidebar", () => ({
  WorkspaceSidebar: () => <aside>Navigation</aside>,
}));

vi.mock("@/lib/api", () => ({
  ApiProblem: class ApiProblem extends Error {},
  compareVariantReports: vi.fn(),
  createAudienceDefinition: vi.fn(),
  createMethodologyPreview: vi.fn(),
  createSimulationConfiguration: vi.fn(),
  createVariantGroup: vi.fn(),
  getMethodologyRegistry: vi.fn(),
  getOrganizationAdminSummary: vi.fn(),
  getOrganizationAudit: vi.fn(),
  getOrganizationDashboard: vi.fn(),
  getProject: vi.fn(),
  listAudienceDefinitions: vi.fn(),
  listSimulationConfigurations: vi.fn(),
  listVariantGroups: vi.fn(),
}));

import {
  compareVariantReports,
  getMethodologyRegistry,
  getOrganizationDashboard,
  getProject,
  listAudienceDefinitions,
  listSimulationConfigurations,
  listVariantGroups,
} from "@/lib/api";

import { MethodologyWorkspace } from "./workspace";

const PROJECT_ID = "018f274b-3c77-7b22-b749-c9274230efa0";
const ORGANIZATION_ID = "018f274b-3c77-7b22-b749-c9274230efa1";
const GROUP_ID = "018f274b-3c77-7b22-b749-c9274230efa2";

describe("MethodologyWorkspace durable comparison", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProject).mockResolvedValue({
      id: PROJECT_ID,
      organization_id: ORGANIZATION_ID,
      stimuli: [
        {
          id: "018f274b-3c77-7b22-b749-c9274230efa3",
          name: "Baseline",
          versions: [
            {
              id: "018f274b-3c77-7b22-b749-c9274230efa4",
              version: 1,
            },
          ],
        },
        {
          id: "018f274b-3c77-7b22-b749-c9274230efa5",
          name: "Candidate",
          versions: [
            {
              id: "018f274b-3c77-7b22-b749-c9274230efa6",
              version: 1,
            },
          ],
        },
      ],
    } as never);
    vi.mocked(getOrganizationDashboard).mockResolvedValue({
      permissions: {
        can_create_runs: true,
        can_manage_settings: false,
      },
    } as never);
    vi.mocked(getMethodologyRegistry).mockResolvedValue({
      methodologies: [],
      population_frames: [],
      providers: [],
    });
    vi.mocked(listAudienceDefinitions).mockResolvedValue({ items: [] });
    vi.mocked(listSimulationConfigurations).mockResolvedValue({ items: [] });
    vi.mocked(listVariantGroups).mockResolvedValue({
      items: [
        {
          variant_group_id: GROUP_ID,
          name: "Primary comparison",
          members: [{ variant_key: "baseline" }, { variant_key: "candidate" }],
        },
      ],
    });
    vi.mocked(compareVariantReports).mockResolvedValue({
      items: [
        {
          baseline_variant_key: "baseline",
          candidate_variant_key: "candidate",
          comparison: {
            largest_absolute_change:
              "Largest modeled change: trust (+2.0000). This is not evidence of market lift.",
          },
        },
      ],
    });
  });

  it("lists durable groups and renders a no-winner compatible comparison", async () => {
    const user = userEvent.setup();
    render(<MethodologyWorkspace projectId={PROJECT_ID} />);

    expect(
      await screen.findByRole("heading", { name: "Saved variant groups" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 ordered variants")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Compare reports" }));

    expect(compareVariantReports).toHaveBeenCalledWith(GROUP_ID);
    expect(
      await screen.findByText(/Largest modeled change: trust/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No variant winner or causal market lift/i),
    ).toBeInTheDocument();
  });

  it("keeps a failed initial load distinct from empty state and retries", async () => {
    const user = userEvent.setup();
    vi.mocked(getOrganizationDashboard)
      .mockRejectedValueOnce(new Error("tenant is concealed"))
      .mockResolvedValueOnce({
        permissions: {
          can_create_runs: true,
          can_manage_settings: false,
        },
      } as never);

    render(<MethodologyWorkspace projectId={PROJECT_ID} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "SIMULA could not complete that request.",
    );
    expect(
      screen.queryByText("No audience versions yet. Create one in step 1."),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Retry methodology state" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Saved variant groups" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getProject).toHaveBeenCalledTimes(2);
    expect(getOrganizationDashboard).toHaveBeenCalledTimes(2);
  });

  it("explains each missing prerequisite instead of leaving empty controls", async () => {
    vi.mocked(getProject).mockResolvedValue({
      id: PROJECT_ID,
      organization_id: ORGANIZATION_ID,
      stimuli: [],
    } as never);
    vi.mocked(listVariantGroups).mockResolvedValue({ items: [] });

    render(<MethodologyWorkspace projectId={PROJECT_ID} />);

    expect(
      await screen.findByText(
        "No audience versions yet. Create one in step 1.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No configurations yet. Freeze one in step 2."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No stimulus versions yet. Add a stimulus in the project workspace.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No saved variant groups yet."),
    ).toBeInTheDocument();
  });

  it("renders a truthful empty comparison after a compatible query", async () => {
    const user = userEvent.setup();
    vi.mocked(compareVariantReports).mockResolvedValue({ items: [] });

    render(<MethodologyWorkspace projectId={PROJECT_ID} />);
    await screen.findByRole("heading", { name: "Saved variant groups" });
    await user.click(screen.getByRole("button", { name: "Compare reports" }));

    expect(
      await screen.findByRole("heading", { name: "No comparison available" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No compatible completed reports exist/i),
    ).toBeInTheDocument();
  });
});
