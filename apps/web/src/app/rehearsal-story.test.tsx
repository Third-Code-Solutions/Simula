import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { RehearsalStory } from "./rehearsal-story";

afterEach(cleanup);

describe("RehearsalStory", () => {
  it("starts with the Frame tab selected", () => {
    render(<RehearsalStory />);

    expect(screen.getByRole("tab", { name: "Frame" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("heading", { name: "Campaign direction / Q3" }),
    ).toBeInTheDocument();
  });

  it("changes the panel when a tab is clicked", async () => {
    const user = userEvent.setup();
    render(<RehearsalStory />);

    await user.click(screen.getByRole("tab", { name: "Rehearse" }));

    expect(screen.getByRole("tab", { name: "Rehearse" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("heading", { name: "Rehearsal in progress" }),
    ).toBeInTheDocument();
  });

  it("moves selection and focus with ArrowRight", async () => {
    const user = userEvent.setup();
    render(<RehearsalStory />);

    const frameTab = screen.getByRole("tab", { name: "Frame" });
    frameTab.focus();
    await user.keyboard("{ArrowRight}");

    const rehearseTab = screen.getByRole("tab", { name: "Rehearse" });
    expect(rehearseTab).toHaveFocus();
    expect(rehearseTab).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the non-estimation boundary in the Decide state", async () => {
    const user = userEvent.setup();
    render(<RehearsalStory />);

    await user.click(screen.getByRole("tab", { name: "Decide" }));

    expect(screen.getByText("Estimates nobody")).toBeInTheDocument();
    expect(
      screen.getByText("Output becomes a question, never a verdict."),
    ).toBeInTheDocument();
  });
});
