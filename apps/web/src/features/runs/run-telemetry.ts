import type { ApiProblem } from "@/lib/api";

export type RunUiTelemetryEvent =
  | Readonly<{
      name: "run_poll_stopped";
      pollCount: number;
      reason: "authorization" | "not_found" | "terminal" | "timed_out";
    }>
  | Readonly<{
      code: string;
      correlationId?: string;
      name: "run_ui_error";
    }>
  | Readonly<{ name: "run_provenance_view" }>;

export type RunTelemetry = (event: RunUiTelemetryEvent) => void;

export const browserRunTelemetry: RunTelemetry = (event) => {
  if (
    typeof globalThis.dispatchEvent !== "function" ||
    typeof globalThis.CustomEvent !== "function"
  ) {
    return;
  }
  globalThis.dispatchEvent(
    new globalThis.CustomEvent<RunUiTelemetryEvent>("simula:run-telemetry", {
      detail: event,
    }),
  );
};

export function recordRunUiError(error: ApiProblem): void {
  browserRunTelemetry({
    code: error.code,
    correlationId: error.correlationId,
    name: "run_ui_error",
  });
}
