import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("presents the product path and non-representative boundary", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: /Test your message\.\s*Know what to ask next\./,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Every rehearsal keeps its evidence.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /One decision\.\s*Five inspectable moves\./,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Simulated responses are not observed human behavior or validated population estimates/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute(
      "href",
      "#product",
    );
    expect(
      screen.getByRole("link", { name: "Data and access" }),
    ).toHaveAttribute("href", "/data-use");
    expect(screen.getAllByText(/estimates nobody/i)).not.toHaveLength(0);
    expect(
      screen.getAllByRole("link", { name: /Start a rehearsal/ }),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByRole("link", { name: /Start a rehearsal/ })[0],
    ).toHaveAttribute("href", "/organizations");
  });
});
