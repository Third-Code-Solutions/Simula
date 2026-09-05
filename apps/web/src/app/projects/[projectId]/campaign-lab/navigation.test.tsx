import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoundBacktest } from "./bound-backtest";
import { BoundCalibration } from "./bound-calibration";

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
      "forecasting",
      "compliance",
      "reports",
      "audit",
    ]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("offers a sequenced historical workflow without caller-authored predictions", () => {
    render(<BoundBacktest campaignId="one" />);
    expect(
      screen.getByRole("heading", {
        name: "Freeze predictions before admitting outcomes",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/predictions are blind/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choose historical evidence" }),
    ).toBeInTheDocument();
  });

  it("accepts saved evidence references instead of caller-authored scientific inputs", () => {
    render(<BoundCalibration campaignId="one" />);
    expect(
      screen.getByRole("heading", {
        name: "Compare a saved test with a survey",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not establish reliable predictions/),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/synthetic observations/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Compare saved evidence" }),
    ).not.toBeInTheDocument();
  });
});
