import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOrganization, listOrganizations } from "@/lib/api";

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
  listOrganizations: vi.fn(),
}));

describe("OrganizationsWorkspace", () => {
  afterEach(cleanup);

  beforeEach(() => {
    router.push.mockReset();
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
      screen.getByRole("button", { name: "Create workspace" }),
    ).toBeEnabled();
  });

  it("creates a real organization and opens its dashboard", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));

    await waitFor(() =>
      expect(createOrganization).toHaveBeenCalledWith("Northstar Strategy"),
    );
    expect(router.push).toHaveBeenCalledWith(
      "/organizations/00000000-0000-4000-8000-000000000001/dashboard",
    );
  });
});
