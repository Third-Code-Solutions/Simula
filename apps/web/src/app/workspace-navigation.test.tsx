import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteHeader } from "./landing/site-header";
import { WorkspaceSidebar } from "./workspace-sidebar";

afterEach(cleanup);
describe("workspace navigation", () => {
  it("offers account entry on the public header", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(
      screen.getByRole("link", { name: /Open workspace/ }),
    ).toHaveAttribute("href", "/organizations");
  });
  it("shows only useful destinations before an organization is selected", () => {
    render(<WorkspaceSidebar current="organizations" />);
    const nav = screen.getByRole("navigation", { name: "Workspace pages" });
    expect(
      within(nav).getByRole("link", { name: "Organizations" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(nav).getByRole("link", { name: "Guided setup" }),
    ).toHaveAttribute("href", "/organizations#guided-rehearsal");
    expect(within(nav).queryByRole("link", { name: "Dashboard" })).toBeNull();
    expect(within(nav).queryByText("Select a project")).toBeNull();
    expect(
      screen.getByText(/Choose an organization to see/),
    ).toBeInTheDocument();
  });
  it("preserves parent paths and a single current page from a run", () => {
    render(
      <WorkspaceSidebar
        current="run"
        organizationId="org-1"
        projectId="project-1"
        runId="run-1"
      />,
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/organizations/org-1/dashboard",
    );
    expect(
      screen.getByRole("link", { name: "Project workspace" }),
    ).toHaveAttribute("href", "/projects/project-1");
    expect(
      screen.getByRole("link", { name: "Campaign Simulation Lab" }),
    ).toHaveAttribute("href", "/projects/project-1/campaign-lab");
    expect(screen.getByRole("link", { name: "Run result" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(document.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
  });
  it("opens the mobile menu and closes it when a destination is chosen", () => {
    render(<WorkspaceSidebar current="campaign-lab" projectId="project-1" />);
    const toggle = screen.getByRole("button", { name: /Menu/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const menu = document.getElementById(toggle.getAttribute("aria-controls")!);
    expect(menu).toHaveClass("is-expanded");
    fireEvent.click(screen.getByRole("link", { name: "Project workspace" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(menu).not.toHaveClass("is-expanded");
  });
});
