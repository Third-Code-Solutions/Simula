import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductStory } from "./product-story";

describe("ProductStory", () => {
  it("lets a reviewer select a rehearsal step", () => {
    render(<ProductStory />);

    fireEvent.click(screen.getByRole("button", { name: "04Inspect" }));

    expect(screen.getByRole("button", { name: "04Inspect" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(
      screen.getAllByRole("heading", {
        name: "Trace every output back to its conditions.",
      }),
    ).not.toHaveLength(0);
  });
});
