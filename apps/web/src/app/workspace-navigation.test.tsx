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
    expect(screen.queryByRole("link", { name: "Context map" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Method" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Boundaries" })).toBeNull();
  });
});
