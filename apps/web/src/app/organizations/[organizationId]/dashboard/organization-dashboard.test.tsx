import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createOrganizationInvitation,
  getOrganizationAudit,
  getOrganizationDashboard,
  listOrganizationFeatureFlags,
  listOrganizationInvitations,
  type OrganizationDashboard,
} from "@/lib/api";

import { OrganizationDashboardWorkspace } from "./organization-dashboard";

vi.mock("@/app/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

vi.mock("@/app/workspace-sidebar", () => ({
  WorkspaceSidebar: () => <aside>Navigation</aside>,
}));

vi.mock("@/lib/api", () => ({
  ApiProblem: class ApiProblem extends Error {},
  createOrganizationInvitation: vi.fn(),
  getOrganizationAudit: vi.fn(),
  getOrganizationDashboard: vi.fn(),
  listOrganizationFeatureFlags: vi.fn(),
  listOrganizationInvitations: vi.fn(),
  setOrganizationFeatureFlag: vi.fn(),
}));

const baseDashboard: Omit<OrganizationDashboard, "permissions" | "role"> = {
  generated_at: "2026-07-21T08:00:00Z",
  metrics: {
    active_runs: 1,
    audiences: 2,
    failed_runs: 0,
    feedback_records: 1,
    projects: 3,
    reports: 1,
    runs: 4,
    succeeded_runs: 3,
  },
  organization_id: "00000000-0000-4000-8000-000000000001",
  organization_name: "Meridian Research Cooperative",
  organization_status: "active",
  recent_projects: [
    {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Launch message",
      objective: "Pressure-test a bounded message.",
      status: "active",
      updated_at: "2026-07-21T07:00:00Z",
      version: 2,
    },
  ],
  recent_reports: [],
  recent_runs: [],
};

describe("OrganizationDashboardWorkspace", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrganizationAudit).mockResolvedValue({ items: [] });
    vi.mocked(listOrganizationFeatureFlags).mockResolvedValue({ items: [] });
    vi.mocked(listOrganizationInvitations).mockResolvedValue({ items: [] });
  });

  it("renders viewer data without requesting owner-only resources", async () => {
    vi.mocked(getOrganizationDashboard).mockResolvedValue({
      ...baseDashboard,
      permissions: {
        can_create_projects: false,
        can_create_runs: false,
        can_manage_settings: false,
        can_manage_team: false,
        can_view_audit: false,
      },
      role: "viewer",
    });

    render(
      <OrganizationDashboardWorkspace
        organizationId={baseDashboard.organization_id}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Meridian Research Cooperative",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("viewer access")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Workspace controls" }),
    ).not.toBeInTheDocument();
    expect(listOrganizationInvitations).not.toHaveBeenCalled();
  });

  it("loads owner-only controls only after database role permits them", async () => {
    vi.mocked(getOrganizationDashboard).mockResolvedValue({
      ...baseDashboard,
      permissions: {
        can_create_projects: true,
        can_create_runs: true,
        can_manage_settings: true,
        can_manage_team: true,
        can_view_audit: true,
      },
      role: "owner",
    });

    render(
      <OrganizationDashboardWorkspace
        organizationId={baseDashboard.organization_id}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Workspace controls" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(listOrganizationInvitations).toHaveBeenCalledTimes(1),
    );
    expect(listOrganizationFeatureFlags).toHaveBeenCalledTimes(1);
    expect(getOrganizationAudit).toHaveBeenCalledTimes(1);
  });

  it("creates an owner invitation and reveals its one-time token", async () => {
    vi.mocked(getOrganizationDashboard).mockResolvedValue({
      ...baseDashboard,
      permissions: {
        can_create_projects: true,
        can_create_runs: true,
        can_manage_settings: true,
        can_manage_team: true,
        can_view_audit: true,
      },
      role: "owner",
    });
    vi.mocked(createOrganizationInvitation).mockResolvedValue({
      data: { invitation_token: "invite-once-123" },
    });

    render(
      <OrganizationDashboardWorkspace
        organizationId={baseDashboard.organization_id}
      />,
    );
    await screen.findByRole("heading", { name: "Team invitations" });

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "  analyst@meridian.test  " },
    });
    fireEvent.change(screen.getByLabelText("Workspace role"), {
      target: { value: "editor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));

    await waitFor(() =>
      expect(createOrganizationInvitation).toHaveBeenCalledWith(
        baseDashboard.organization_id,
        expect.objectContaining({
          email: "analyst@meridian.test",
          role: "editor",
        }),
      ),
    );
    expect(await screen.findByText("invite-once-123")).toBeInTheDocument();
    expect(listOrganizationInvitations).toHaveBeenCalledTimes(2);
  });
});
