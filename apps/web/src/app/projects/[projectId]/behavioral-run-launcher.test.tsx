import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BehavioralRunLauncher } from "./behavioral-run-launcher";

describe("BehavioralRunLauncher", () => {
  it("labels the synthetic boundary and submits a valid variant key", async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    render(
      <BehavioralRunLauncher
        disabled={false}
        isStarting={false}
        onStart={onStart}
        version={3}
      />,
    );

    expect(
      screen.getByText(/not observed people, lift, or a population forecast/i),
    ).toBeInTheDocument();
    const input = screen.getByLabelText("Variant key");
    await user.clear(input);
    await user.type(input, "refined_copy");
    await user.click(screen.getByRole("button", { name: "Test version 3" }));

    expect(onStart).toHaveBeenCalledWith("refined_copy");
  });

  it("disables every control while admission is unavailable", () => {
    const view = render(
      <BehavioralRunLauncher
        disabled
        isStarting={false}
        onStart={vi.fn()}
        version={1}
      />,
    );

    const launcher = within(view.container);
    expect(launcher.getByLabelText("Variant key")).toBeDisabled();
    expect(
      launcher.getByRole("button", { name: "Test version 1" }),
    ).toBeDisabled();
  });
});
