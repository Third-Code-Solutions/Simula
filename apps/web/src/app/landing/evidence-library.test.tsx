import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EvidenceLibrary } from "./evidence-library";

describe("EvidenceLibrary", () => {
  it("filters evidence objects without losing the declared boundary", () => {
    render(<EvidenceLibrary />);

    fireEvent.click(screen.getByRole("button", { name: "Limits" }));

    expect(screen.getByRole("button", { name: "Limits" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("heading", { name: "Unknown stays unknown" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "A method you can retrace" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Estimates nobody.")).toBeInTheDocument();
  });
});
