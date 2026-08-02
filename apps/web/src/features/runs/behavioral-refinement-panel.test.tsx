import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BehavioralRefinementPanel } from "./behavioral-refinement-panel";

describe("BehavioralRefinementPanel", () => {
  it("submits a bounded immutable refinement with explicit limitations", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BehavioralRefinementPanel
        isSubmitting={false}
        onSubmit={onSubmit}
        sourceVariant="baseline"
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: "Refined message" }),
      "A more specific message.",
    );
    expect(screen.getByRole("textbox", { name: "Variant key" })).toHaveValue(
      "baseline_refined",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Create revision and run retest",
      }),
    );

    expect(onSubmit).toHaveBeenCalledWith(
      "A more specific message.",
      "baseline_refined",
    );
    expect(
      screen.getByText(/source version and report remain unchanged/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not declare a winner or lift/i),
    ).toBeInTheDocument();
  });
});
