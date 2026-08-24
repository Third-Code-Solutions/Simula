import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CampaignEvidenceUnavailableInputs } from "./workspace";

describe("CampaignEvidenceUnavailableInputs", () => {
  it("suppresses survey and outcome submission until immutable bindings exist", () => {
    render(<CampaignEvidenceUnavailableInputs />);

    expect(
      screen.getByRole("heading", {
        name: "Survey calibration is unavailable",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Historical backtesting is unavailable",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: /queue/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/survey dataset/i)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/held-out outcomes/i),
    ).not.toBeInTheDocument();
  });
});
