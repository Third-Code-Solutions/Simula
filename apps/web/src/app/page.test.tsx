import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("presents the product path and non-representative boundary", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: /Rehearse the decision\.\s*Keep the doubt\./,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Every rehearsal keeps its evidence.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The full context stays attached." }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/estimates nobody/i)).not.toHaveLength(0);
    expect(
      screen.getAllByRole("link", { name: /Start a rehearsal/ }),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByRole("link", { name: /Start a rehearsal/ })[0],
    ).toHaveAttribute("href", "/organizations");
  });
});
