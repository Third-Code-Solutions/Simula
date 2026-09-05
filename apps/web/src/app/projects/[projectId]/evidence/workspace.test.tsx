import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CampaignEvidenceUnavailableInputs,
  CampaignEvidenceWorkspace,
} from "./workspace";

describe("CampaignEvidenceUnavailableInputs", () => {
  it("suppresses survey and outcome submission until immutable bindings exist", () => {
    render(<CampaignEvidenceUnavailableInputs />);

    expect(
      screen.getByRole("heading", {
        name: "Use saved Campaign Lab evidence for comparison",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Historical backtesting is unavailable",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: /queue/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/survey dataset/i)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/held-out outcomes/i),
    ).not.toBeInTheDocument();
  });
});

vi.mock("@/app/sign-out-button", () => ({
  SignOutButton: () => <button>Sign out</button>,
}));
vi.mock("@/lib/api", () => ({
  getProject: vi.fn(),
  ApiProblem: class ApiProblem extends Error {},
}));
import { getProject } from "@/lib/api";
afterEach(cleanup);

it("makes a transient project-context failure visible and recoverable", async () => {
  vi.mocked(getProject).mockRejectedValueOnce(new Error("network"));
  render(<CampaignEvidenceWorkspace projectId="project-1" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not load project access",
  );
  vi.mocked(getProject).mockResolvedValueOnce({
    organization_id: "org-1",
  } as Awaited<ReturnType<typeof getProject>>);
  fireEvent.click(screen.getByRole("button", { name: "Retry project access" }));
  expect(
    await screen.findByRole("link", { name: "Dashboard" }),
  ).toHaveAttribute("href", "/organizations/org-1/dashboard");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    screen.getByRole("link", { name: "Open campaign research" }),
  ).toHaveAttribute("href", "/projects/project-1/campaign-lab#research-upload");
});
