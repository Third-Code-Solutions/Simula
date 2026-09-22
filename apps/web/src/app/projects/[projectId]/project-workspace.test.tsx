import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ProjectWorkspace } from "./project-workspace";

const state = vi.hoisted(() => ({ canEdit: true }));
const reads = vi.hoisted(() => ({
  getDemoAudience: vi.fn(),
  getOrganizationDashboard: vi.fn(),
  getProject: vi.fn(),
}));

afterEach(cleanup);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/sign-out-button", () => ({
  SignOutButton: () => <button>Sign out</button>,
}));
vi.mock("@/app/workspace-sidebar", () => ({ WorkspaceSidebar: () => null }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  ...reads,
}));

beforeEach(() => {
  state.canEdit = true;
  reads.getProject.mockResolvedValue({
    id: "project-1",
    organization_id: "org-1",
    name: "Campaign draft",
    objective: "Clarify the message before research.",
    version: 1,
    stimuli: [],
  });
  reads.getDemoAudience.mockResolvedValue({
    name: "Authored audience",
    kind: "authored_demo",
    version: 1,
    non_representative: true,
    limitations: ["No population estimate"],
    purpose: "Demo",
    prohibited_uses: ["Prediction"],
    checksum_sha256: "test-checksum",
  });
  reads.getOrganizationDashboard.mockImplementation(async () => ({
    permissions: {
      can_create_projects: state.canEdit,
      can_create_runs: state.canEdit,
    },
  }));
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
  expect(reads.getProject).toHaveBeenCalledWith(
    "project-1",
    expect.any(AbortSignal),
  );
  expect(reads.getOrganizationDashboard).toHaveBeenCalledWith(
    "org-1",
    expect.any(AbortSignal),
  );
  expect(reads.getDemoAudience).toHaveBeenCalledWith(expect.any(AbortSignal));
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

test("cancels an in-flight project read on unmount without an error", async () => {
  let captured: AbortSignal | undefined;
  reads.getProject.mockImplementation(
    (_projectId: string, signal?: AbortSignal) =>
      new Promise<never>((_resolve, reject) => {
        captured = signal;
        signal?.addEventListener("abort", () =>
          reject(
            Object.assign(new Error("cancelled"), {
              code: "request_cancelled",
            }),
          ),
        );
      }),
  );

  const { unmount } = render(<ProjectWorkspace projectId="project-1" />);
  await waitFor(() => expect(captured).toBeDefined());

  unmount();

  expect(captured?.aborted).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
});
