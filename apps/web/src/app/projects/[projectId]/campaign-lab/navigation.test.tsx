import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CampaignLabSelectionNotice } from "./workspace";

afterEach(() => {
  cleanup();
});

describe("Campaign Lab navigation anchors", () => {
  it("keeps every permanent sidebar destination addressable before selection", () => {
    render(<CampaignLabSelectionNotice />);

    expect(
      screen.getByRole("heading", {
        name: "Select a workspace to open the workflow",
      }),
    ).toBeInTheDocument();

    for (const id of [
      "research-upload",
      "audience-cohorts",
      "message-lab",
      "simulation-config",
      "agent-activity",
      "persona-interviews",
      "surveys",
      "calibration",
      "backtesting",
      "compliance",
      "reports",
      "audit",
    ]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });
});
