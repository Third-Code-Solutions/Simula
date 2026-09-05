import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoundCalibration } from "./bound-calibration";

import {
  CampaignLabHistoricalBacktestUnavailable,
  CampaignLabSelectionNotice,
} from "./workspace";

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

  it("suppresses historical outcome submission until immutable binding exists", () => {
    render(<CampaignLabHistoricalBacktestUnavailable />);

    expect(
      screen.getByRole("heading", {
        name: "Historical backtesting is unavailable",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/immutably bound to its admitted registry artifact/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /backtest/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/held-out outcomes/i),
    ).not.toBeInTheDocument();
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
