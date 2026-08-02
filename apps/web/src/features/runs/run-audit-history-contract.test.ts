import { describe, expect, it } from "vitest";

import { parseRunAuditHistory } from "./run-audit-history-contract";

const RUN_ID = "018f274b-3c77-7b22-b749-c9274230ef9d";

function history(): Record<string, unknown> {
  return {
    run_id: RUN_ID,
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
  };
}

describe("run audit history contract", () => {
  it("accepts a sanitized, newest-first state history bound to one run", () => {
    expect(parseRunAuditHistory(history(), RUN_ID)).toMatchObject({
      run_id: RUN_ID,
      events: [{ new_state: "running" }, { new_state: "queued" }],
    });
  });

  it("rejects identity fields and noncanonical ordering", () => {
    const withIdentity = history();
    (
      (withIdentity.events as Record<string, unknown>[])[0] as Record<
        string,
        unknown
      >
    ).actor_user_id = "018f274b-3c77-7b22-b749-c9274230efff";
    expect(() => parseRunAuditHistory(withIdentity, RUN_ID)).toThrow(
      "invalid run audit history API contract",
    );

    const ascending = history();
    (ascending.events as unknown[]).reverse();
    expect(() => parseRunAuditHistory(ascending, RUN_ID)).toThrow(
      "invalid run audit history API contract",
    );
  });
});
