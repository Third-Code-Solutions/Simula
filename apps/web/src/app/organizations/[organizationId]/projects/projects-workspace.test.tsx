import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOrganizationDashboard, listProjects } from "@/lib/api";

import { ProjectsWorkspace } from "./projects-workspace";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
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
  createProject: vi.fn(),
  getOrganizationDashboard: vi.fn(),
  listProjects: vi.fn(),
}));

const dashboard = {
  permissions: {
    can_create_projects: true,
  },
} as never;

describe("ProjectsWorkspace async states", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrganizationDashboard).mockResolvedValue(dashboard);
    vi.mocked(listProjects).mockResolvedValue({
      items: [],
      next_cursor: null,
    });
  });

  it("labels loading, then renders the real empty project state", async () => {
    let resolveProjects:
      ((value: { items: []; next_cursor: null }) => void) | undefined;
    vi.mocked(listProjects).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProjects = resolve;
      }),
    );

    render(<ProjectsWorkspace organizationId={ORGANIZATION_ID} />);

    const loading = screen.getByText("Loading projects…");
    const listSection = loading.closest("section");
    expect(listSection).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByText(
        "No projects yet. Create the first project for this organization.",
      ),
    ).not.toBeInTheDocument();

    resolveProjects?.({ items: [], next_cursor: null });

    expect(
      await screen.findByText(
        "No projects yet. Create the first project for this organization.",
      ),
    ).toBeInTheDocument();
    expect(listSection).toHaveAttribute("aria-busy", "false");
  });

  it("does not mislabel a failed load as empty and supports retry", async () => {
    vi.mocked(listProjects)
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce({ items: [], next_cursor: null });

    render(<ProjectsWorkspace organizationId={ORGANIZATION_ID} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "SIMULA could not load projects.",
    );
    expect(
      screen.queryByText(
        "No projects yet. Create the first project for this organization.",
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry projects" }));

    expect(
      await screen.findByText(
        "No projects yet. Create the first project for this organization.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(listProjects).toHaveBeenCalledTimes(2);
    expect(getOrganizationDashboard).toHaveBeenCalledTimes(2);
  });
});
