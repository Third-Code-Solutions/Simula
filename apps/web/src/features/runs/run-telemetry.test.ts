import { describe, expect, it } from "vitest";

import { ApiProblem } from "@/lib/api";

import { browserRunTelemetry, recordRunUiError } from "./run-telemetry";

describe("browser run telemetry", () => {
  it("emits a safe, content-free UI error event", () => {
    const received: Event[] = [];
    const listener = (event: Event) => received.push(event);
    window.addEventListener("simula:run-telemetry", listener);

    recordRunUiError(
      new ApiProblem(
        503,
        "api_unavailable",
        "This message must not become telemetry content.",
        "correlation-123",
      ),
    );

    window.removeEventListener("simula:run-telemetry", listener);
    expect(received).toHaveLength(1);
    expect((received[0] as CustomEvent).detail).toEqual({
      code: "api_unavailable",
      correlationId: "correlation-123",
      name: "run_ui_error",
    });
    expect(JSON.stringify((received[0] as CustomEvent).detail)).not.toContain(
      "This message must not become telemetry content.",
    );
  });

  it("emits provenance-view without content or identifiers", () => {
    const received: Event[] = [];
    const listener = (event: Event) => received.push(event);
    window.addEventListener("simula:run-telemetry", listener);

    browserRunTelemetry({ name: "run_provenance_view" });

    window.removeEventListener("simula:run-telemetry", listener);
    expect((received[0] as CustomEvent).detail).toEqual({
      name: "run_provenance_view",
    });
  });
});
