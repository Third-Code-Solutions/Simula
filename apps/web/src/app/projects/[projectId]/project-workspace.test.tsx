import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ProjectWorkspace } from "./project-workspace";

const state = vi.hoisted(() => ({ canEdit: true }));
afterEach(cleanup);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/sign-out-button", () => ({
  SignOutButton: () => <button>Sign out</button>,
}));
vi.mock("@/app/workspace-sidebar", () => ({ WorkspaceSidebar: () => null }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  getProject: async () => ({
    id: "project-1",
    organization_id: "org-1",
    name: "Campaign draft",
    objective: "Clarify the message before research.",
    version: 1,
    stimuli: [],
  }),
  getDemoAudience: async () => ({
    name: "Authored audience",
    kind: "authored_demo",
    version: 1,
    non_representative: true,
    limitations: ["No population estimate"],
    purpose: "Demo",
    prohibited_uses: ["Prediction"],
    checksum_sha256: "test-checksum",
  }),
  getOrganizationDashboard: async () => ({
    permissions: {
      can_create_projects: state.canEdit,
      can_create_runs: state.canEdit,
    },
  }),
}));
beforeEach(() => {
  state.canEdit = true;
});

test("keeps draft actions prominent and advanced project details closed", async () => {
  render(<ProjectWorkspace projectId="project-1" />);
  await screen.findByRole("heading", { name: "Campaign draft" });
  const navigation = screen.getByRole("navigation", {
    name: "Project sections",
  });
  expect(
    within(navigation).getByRole("link", { name: "Message drafts" }),
  ).toHaveAttribute("href", "#stimuli-title");
  expect(
    screen.getByText("Edit project details").closest("details"),
  ).not.toHaveAttribute("open");
  expect(
    screen.getByText("Audience verification details").closest("details"),
  ).not.toHaveAttribute("open");
  expect(screen.getByText("No population estimate")).toBeVisible();
});

test("gives viewers an actionable empty state without edit controls", async () => {
  state.canEdit = false;
  render(<ProjectWorkspace projectId="project-1" />);
  await screen.findByRole("heading", { name: "Campaign draft" });
  expect(
    screen.getByText(/Ask a workspace editor to add a message/),
  ).toBeInTheDocument();
  expect(screen.queryByText("Edit project details")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Add immutable stimulus" }),
  ).not.toBeInTheDocument();
});
