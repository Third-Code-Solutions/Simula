import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { AdminDashboard } from "./admin-dashboard";

vi.mock("./sign-out-button", () => ({
  SignOutButton: () => <button>Sign out</button>,
}));

const dashboard = {
  generated_at: "2026-07-22T03:00:00Z",
  metrics: {
    active_runs: 1,
    feedback_records: 2,
    organizations: 1,
    projects: 3,
    reports: 4,
    runs: 5,
    users: 2,
  },
  organizations: [
    {
      created_at: "2026-07-21T01:00:00Z",
      id: "10000000-0000-4000-8000-000000000001",
      members: 2,
      name: "Research Lab",
      projects: 3,
      reports: 4,
      runs: 5,
      status: "active" as const,
      updated_at: "2026-07-22T02:00:00Z",
    },
  ],
  role: "superadmin" as const,
  user_id: "00000000-0000-4000-8000-000000000004",
};

test("renders live platform metrics and a workspace link", () => {
  render(
    <AdminDashboard
      dashboard={dashboard}
      email="platform-admin@simula.local"
      workspaceOrigin="https://simula.example"
    />,
  );

  expect(
    screen.getByRole("heading", { name: "Control plane" }),
  ).toBeInTheDocument();
  expect(screen.getByText("platform-admin@simula.local")).toBeInTheDocument();
  const row = screen.getByRole("row", { name: /Research Lab/ });
  expect(within(row).getByText("active")).toBeInTheDocument();
  expect(
    within(row).getByRole("link", { name: "Open workspace" }),
  ).toHaveAttribute(
    "href",
    "https://simula.example/organizations/10000000-0000-4000-8000-000000000001/dashboard",
  );
});

test("renders an explicit empty state", () => {
  render(
    <AdminDashboard
      dashboard={{
        ...dashboard,
        metrics: { ...dashboard.metrics, organizations: 0 },
        organizations: [],
      }}
      email="admin@simula.com"
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("No organizations yet");
});

test("filters inventory and offers a recoverable no-match state", () => {
  render(<AdminDashboard dashboard={dashboard} email="admin@simula.local" />);
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Find on this page" }),
    { target: { value: "missing" } },
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "No matching organizations",
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("row", { name: /Research Lab/ })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
    target: { value: "disabled" },
  });
  expect(screen.getByRole("status")).toHaveTextContent(
    "No matching organizations",
  );
});

test("links to server pages beyond the first hundred and retains navigation during filtering", () => {
  render(
    <AdminDashboard
      dashboard={{
        ...dashboard,
        metrics: { ...dashboard.metrics, organizations: 150 },
      }}
      offset={100}
      email="admin@simula.local"
    />,
  );
  expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
    "href",
    "/?offset=120#organization-inventory",
  );
  expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
    "href",
    "/?offset=80#organization-inventory",
  );
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "missing" },
  });
  expect(screen.getByRole("status")).toHaveTextContent(
    "No matching organizations",
  );
  expect(screen.getByRole("link", { name: "Next" })).toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent(
    "filters apply to this page only",
  );
});

test("does not offer a next page after the last organization", () => {
  render(
    <AdminDashboard
      dashboard={{
        ...dashboard,
        metrics: { ...dashboard.metrics, organizations: 121 },
      }}
      offset={120}
      email="admin@simula.local"
    />,
  );
  expect(screen.queryByRole("link", { name: "Next" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
    "href",
    "/?offset=100#organization-inventory",
  );
});

test("recovers when an inventory page becomes empty after deletion", () => {
  render(
    <AdminDashboard
      dashboard={{ ...dashboard, organizations: [] }}
      offset={20}
      email="admin@simula.local"
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "No organizations on this page",
  );
  expect(
    screen.getByRole("link", { name: "Return to first page" }),
  ).toHaveAttribute("href", "/");
});
