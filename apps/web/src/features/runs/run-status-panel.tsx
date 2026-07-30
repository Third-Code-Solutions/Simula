import type { SimulationRun } from "./result-contract";

const stateCopy: Record<
  SimulationRun["state"],
  Readonly<{ detail: string; label: string }>
> = {
  queued: {
    detail: "The durable queue has accepted this deterministic demo run.",
    label: "Queued",
  },
  running: {
    detail:
      "The deterministic demo worker is producing the fixed typed result.",
    label: "Running",
  },
  retrying: {
    detail:
      "A bounded retry is in progress. The method and frozen configuration do not change.",
    label: "Retrying",
  },
  cancel_requested: {
    detail:
      "Cancellation was requested. The terminal state will be shown when durable processing closes.",
    label: "Cancellation requested",
  },
  succeeded: {
    detail: "The immutable experimental demo result is ready.",
    label: "Complete",
  },
  failed: {
    detail:
      "Processing stopped without a result. SIMULA will not substitute a result. Review the run status before creating a new experimental run.",
    label: "Failed",
  },
  canceled: {
    detail: "This run was canceled. No result is presented as a substitute.",
    label: "Canceled",
  },
};

const behavioralStateDetail: Partial<Record<SimulationRun["state"], string>> = {
  queued: "The durable queue accepted this deterministic synthetic-agent run.",
  running:
    "The governed behavioral engine is executing seeded synthetic-agent rounds.",
  retrying:
    "A bounded retry is in progress. The frozen context, fleet, seed, and method do not change.",
  succeeded:
    "The immutable experimental behavioral report and governed evidence are ready.",
};

export function RunStatusPanel({
  isSlow,
  run,
}: Readonly<{ isSlow: boolean; run: SimulationRun | undefined }>) {
  if (!run) {
    return (
      <section
        aria-busy="true"
        aria-live="polite"
        className="panel status-panel"
      >
        <h2>Loading run status</h2>
        <p>Checking the authorized durable run record.</p>
      </section>
    );
  }

  const copy = stateCopy[run.state];
  const detail =
    run.schema_version === 2
      ? (behavioralStateDetail[run.state] ?? copy.detail)
      : copy.detail;
  return (
    <section aria-live="polite" className="panel status-panel" role="status">
      <p className="eyebrow">Run status</p>
      <h2>{copy.label}</h2>
      <p>{detail}</p>
      {run.failure ? (
        <p className="field-note">
          Failure code: <code>{run.failure.code}</code>. Correlation:{" "}
          <code>{run.failure.correlation_id}</code>. {run.failure.guidance}
        </p>
      ) : null}
      {isSlow ? (
        <p className="field-note">
          Taking longer than expected. SIMULA will continue checking at a slower
          rate.
        </p>
      ) : null}
    </section>
  );
}
