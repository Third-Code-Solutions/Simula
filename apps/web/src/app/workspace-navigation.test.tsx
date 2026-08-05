import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SiteHeader } from "./landing/site-header";
import { WorkspaceSidebar } from "./workspace-sidebar";

afterEach(() => {
  cleanup();
});

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
      screen
        .getAllByText("Campaign Simulation Lab", { exact: true })
        .find((element) => element.getAttribute("aria-disabled") === "true"),
    ).toHaveAttribute("aria-disabled", "true");
    for (const label of [
      "Overview",
      "Research",
      "Audience Cohorts",
      "Message Lab",
      "Simulations",
      "Agent Activity",
      "Persona Interviews",
      "Surveys",
      "Calibration",
      "Backtesting",
      "Compliance",
      "Reports",
      "Audit",
      "Settings",
    ]) {
      expect(screen.getByText(label, { exact: true })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
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
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/projects/project-1/campaign-lab#overview",
    );
    expect(screen.getByRole("link", { name: "Surveys" })).toHaveAttribute(
      "href",
      "/projects/project-1/campaign-lab#surveys",
    );
    expect(screen.getByRole("link", { name: "Research" })).toHaveAttribute(
      "href",
      "/projects/project-1/campaign-lab#research-upload",
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/projects/project-1#settings",
    );
  });

  it("keeps every Campaign Lab destination available on the project sidebar", () => {
    render(<WorkspaceSidebar current="campaign-lab" projectId="project-1" />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen
        .getAllByRole("link")
        .filter((link) =>
          [
            "Overview",
            "Research",
            "Audience Cohorts",
            "Message Lab",
            "Simulations",
            "Agent Activity",
            "Persona Interviews",
            "Surveys",
            "Calibration",
            "Backtesting",
            "Compliance",
            "Reports",
            "Audit",
            "Settings",
          ].includes(link.textContent ?? ""),
        ),
    ).toHaveLength(14);
  });
});
