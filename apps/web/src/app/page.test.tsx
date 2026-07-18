import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("presents the product path and non-representative boundary", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: "Rehearse the decision. Keep the doubt.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "The full context stays attached.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "A rehearsal you can follow." }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/estimates nobody/i)).not.toHaveLength(0);
    expect(
      screen.getByRole("link", { name: "Start a rehearsal" }),
    ).toHaveAttribute("href", "/organizations");
  });
});
