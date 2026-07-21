import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createOrganization,
  createProject,
  createSimulationRun,
  createStimulus,
  listOrganizations,
} from "@/lib/api";

import { OrganizationsWorkspace } from "./organizations-workspace";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/app/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

vi.mock("@/app/workspace-sidebar", () => ({
  WorkspaceSidebar: () => <aside>Navigation</aside>,
}));

vi.mock("@/lib/api", () => ({
  ApiProblem: class ApiProblem extends Error {},
  createOrganization: vi.fn(),
  createProject: vi.fn(),
  createSimulationRun: vi.fn(),
  createStimulus: vi.fn(),
  listOrganizations: vi.fn(),
}));

describe("OrganizationsWorkspace", () => {
  afterEach(cleanup);

  beforeEach(() => {
    router.push.mockReset();
    vi.mocked(createOrganization).mockReset();
    vi.mocked(createProject).mockReset();
    vi.mocked(createSimulationRun).mockReset();
    vi.mocked(createStimulus).mockReset();
    vi.mocked(listOrganizations).mockResolvedValue({
      items: [],
      next_cursor: null,
    });
  });

  it("renders a useful first-workspace state", async () => {
    render(<OrganizationsWorkspace />);

    expect(
      await screen.findByRole("heading", { name: "No workspace yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Name the workspace")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create guided rehearsal" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Create empty workspace" }),
    ).toBeEnabled();
  });

  it("creates an empty organization and opens its dashboard", async () => {
    vi.mocked(createOrganization).mockResolvedValue({
      created_at: "2026-07-22T00:00:00Z",
      id: "00000000-0000-4000-8000-000000000001",
      name: "Northstar Strategy",
      role: "owner",
      status: "active",
    });

    render(<OrganizationsWorkspace />);
    await screen.findByRole("heading", { name: "No workspace yet" });

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "  Northstar Strategy  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create empty workspace" }),
    );

    await waitFor(() =>
      expect(createOrganization).toHaveBeenCalledWith("Northstar Strategy"),
    );
    expect(router.push).toHaveBeenCalledWith(
      "/organizations/00000000-0000-4000-8000-000000000001/dashboard",
    );
  });

  it("persists the full guided rehearsal through the real domain APIs", async () => {
    vi.mocked(createOrganization).mockResolvedValue({
      created_at: "2026-07-22T00:00:00Z",
      id: "00000000-0000-4000-8000-000000000001",
      name: "Northstar Strategy",
      role: "owner",
      status: "active",
    });
    vi.mocked(createProject).mockResolvedValue({
      category: "campaign_message",
      created_at: "2026-07-22T00:00:00Z",
      id: "00000000-0000-4000-8000-000000000002",
      language: "en",
      market: "philippines",
      name: "First bounded rehearsal",
      objective:
        "Rehearse a fictional community update before planning appropriately recruited human research.",
      organization_id: "00000000-0000-4000-8000-000000000001",
      status: "active",
      updated_at: "2026-07-22T00:00:00Z",
      version: 1,
    });
    vi.mocked(createStimulus).mockResolvedValue({
      created_at: "2026-07-22T00:00:00Z",
      id: "00000000-0000-4000-8000-000000000003",
      name: "Fictional community update",
      organization_id: "00000000-0000-4000-8000-000000000001",
      project_id: "00000000-0000-4000-8000-000000000002",
      status: "active",
      versions: [
        {
          content:
            "A fictional neighborhood program is considering a weekly email that summarizes upcoming activities, explains schedule changes, and gives residents one clear way to ask questions.",
          content_sha256: "a".repeat(64),
          created_at: "2026-07-22T00:00:00Z",
          id: "00000000-0000-4000-8000-000000000004",
          organization_id: "00000000-0000-4000-8000-000000000001",
          stimulus_id: "00000000-0000-4000-8000-000000000003",
          version: 1,
        },
      ],
    });
    vi.mocked(createSimulationRun).mockResolvedValue({
      audience_version_id: "00000000-0000-4000-8000-000000000005",
      created_at: "2026-07-22T00:00:00Z",
      dispatch_generation: 1,
      failure: null,
      id: "00000000-0000-4000-8000-000000000006",
      job_id: "run:00000000-0000-4000-8000-000000000006:dispatch:1",
      organization_id: "00000000-0000-4000-8000-000000000001",
      project_id: "00000000-0000-4000-8000-000000000002",
      schema_version: 1,
      state: "queued",
      stimulus_version_id: "00000000-0000-4000-8000-000000000004",
      version: 1,
    });

    render(<OrganizationsWorkspace />);
    await screen.findByRole("heading", { name: "No workspace yet" });

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Northstar Strategy" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create guided rehearsal" }),
    );

    await waitFor(() => expect(createSimulationRun).toHaveBeenCalledOnce());
    expect(createProject).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      expect.objectContaining({ name: "First bounded rehearsal" }),
    );
    expect(createStimulus).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
      expect.objectContaining({ name: "Fictional community update" }),
    );
    expect(createSimulationRun).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000004",
      expect.any(String),
    );
    expect(router.push).toHaveBeenCalledWith(
      "/runs/00000000-0000-4000-8000-000000000006",
    );
  });
});
