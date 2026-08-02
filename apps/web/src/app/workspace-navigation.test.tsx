import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "./landing/site-header";
import { WorkspaceSidebar } from "./workspace-sidebar";

describe("workspace navigation", () => {
  it("keeps the landing header focused on account entry", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(
      screen.getByRole("link", { name: /Open workspace/ }),
    ).toHaveAttribute("href", "/organizations");
    expect(screen.queryByRole("link", { name: "Workflow" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Product" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Method" })).toBeNull();
  });

  it("does not send authenticated users back to marketing sections", () => {
    render(<WorkspaceSidebar current="organizations" />);

    expect(screen.getByRole("link", { name: "Organizations" })).toHaveAttribute(
      "href",
      "/organizations",
    );
    expect(screen.getByText("Dashboard", { exact: true })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.getByText("Campaign Simulation Lab", { exact: true }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("link", { name: "Context map" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Method" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Boundaries" })).toBeNull();
    expect(screen.getByRole("link", { name: "Guided setup" })).toHaveAttribute(
      "href",
      "/organizations#guided-rehearsal",
    );
  });

  it("keeps organization, project, and run context visible", () => {
    render(
      <WorkspaceSidebar
        current="run"
        organizationId="organization-1"
        projectId="project-1"
        runId="run-1"
      />,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/organizations/organization-1/dashboard",
    );
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute(
      "href",
      "/organizations/organization-1/projects",
    );
    expect(
      screen.getByRole("link", { name: "Project workspace" }),
    ).toHaveAttribute("href", "/projects/project-1");
    expect(screen.getByRole("link", { name: "Run result" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
