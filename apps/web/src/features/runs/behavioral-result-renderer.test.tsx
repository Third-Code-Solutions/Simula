import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  behavioralEvidenceFixture,
  behavioralResultFixture,
} from "@/test/behavioral-fixtures";

import { parseBehavioralEvidence } from "./behavioral-evidence-contract";
import { parseBehavioralResult } from "./behavioral-result-contract";
import { BehavioralResultRenderer } from "./behavioral-result-renderer";

describe("BehavioralResultRenderer", () => {
  it("shows experimental scores, traceability, and context without unsafe HTML", () => {
    render(
      <BehavioralResultRenderer
        evidence={parseBehavioralEvidence(behavioralEvidenceFixture())}
        result={parseBehavioralResult(behavioralResultFixture())}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Behavioral pressure-test report" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Not human evidence")).toBeInTheDocument();
    expect(screen.getAllByText("72.0").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/No winner or lift is claimed/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("<img src=x onerror=alert(1)>"),
    ).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Context and evidence review" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Who was simulated" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Interaction timeline" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("heading", { name: "Interaction timeline" })
        .closest("section"),
    ).toHaveAttribute("tabindex", "0");
    expect(
      screen.getByRole("heading", { name: "Synthetic interviews" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Not testimony")).toBeInTheDocument();
    expect(
      screen.getByText(/SIMULA does not invent a quote/),
    ).toBeInTheDocument();
    for (const list of document.querySelectorAll("dl.behavioral-score-grid")) {
      expect(
        [...list.children].every(
          (group) =>
            group.tagName === "DIV" &&
            [...group.children].every(
              (item) => item.tagName === "DT" || item.tagName === "DD",
            ),
        ),
      ).toBe(true);
    }
  });
});
