import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CampaignLabCalibrationUnavailable,
  CampaignLabHistoricalBacktestUnavailable,
  CampaignLabReportUnavailable,
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

  it("suppresses calibration submission until immutable import binding exists", () => {
    render(<CampaignLabCalibrationUnavailable />);

    expect(
      screen.getByRole("heading", {
        name: "Survey calibration is unavailable",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/derived from an admitted immutable survey import/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /calibration/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/synthetic observations/i),
    ).not.toBeInTheDocument();
  });

  it("suppresses report submission until immutable evidence binding exists", () => {
    render(<CampaignLabReportUnavailable />);

    expect(
      screen.getByRole("heading", {
        name: "Evidence report creation is unavailable",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/one immutable evidence manifest/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /report/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/approval state/i)).not.toBeInTheDocument();
  });
});
