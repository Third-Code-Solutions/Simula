import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("states the non-representative foundation boundary", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "SIMULA" })).toBeInTheDocument();
    expect(screen.getByText(/estimates nobody/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Foundation healthy");
  });
});
