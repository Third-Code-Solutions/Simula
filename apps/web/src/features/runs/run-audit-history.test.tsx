import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { parseRunAuditHistory } from "./run-audit-history-contract";
import { RunAuditHistory } from "./run-audit-history";

describe("RunAuditHistory", () => {
  it("shows chronological state evidence and the privacy boundary", () => {
    render(
      <RunAuditHistory
        history={parseRunAuditHistory(
          {
            run_id: "018f274b-3c77-7b22-b749-c9274230ef9d",
            events: [
              {
                event_id: "018f274b-3c77-7b22-b749-c9274230efa2",
                previous_state: "queued",
                new_state: "running",
                attempt_number: 1,
                safe_reason: null,
                actor_type: "worker",
                correlation_id: "018f274b-3c77-7b22-b749-c9274230efa3",
                created_at: "2026-07-29T06:00:01.123456Z",
              },
              {
                event_id: "018f274b-3c77-7b22-b749-c9274230efa0",
                previous_state: null,
                new_state: "queued",
                attempt_number: null,
                safe_reason: null,
                actor_type: "user",
                correlation_id: "018f274b-3c77-7b22-b749-c9274230efa1",
                created_at: "2026-07-29T06:00:00.123456Z",
              },
            ],
            disclosure:
              "Run state evidence only. Actor identities, payloads, prompts, agent memory, rationale, and free-form metadata are excluded.",
          },
          "018f274b-3c77-7b22-b749-c9274230ef9d",
        )}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Run audit history" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Created as queued")).toBeInTheDocument();
    expect(screen.getByText("queued to running")).toBeInTheDocument();
    expect(
      screen.getByText(/Actor identities, payloads, prompts/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/actor_user_id/)).not.toBeInTheDocument();
  });
});
