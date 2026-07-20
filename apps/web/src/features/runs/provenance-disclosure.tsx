import { useState } from "react";

import {
  ApiProblem,
  type SimulationProvenance,
  getSimulationProvenance,
} from "@/lib/api";

import { browserRunTelemetry, recordRunUiError } from "./run-telemetry";

function problemMessage(error: unknown): string {
  if (error instanceof ApiProblem) {
    return error.correlationId
      ? `${error.message} Correlation: ${error.correlationId}.`
      : error.message;
  }
  return "SIMULA could not load frozen provenance. Retry shortly.";
}

function timestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not available";
}

export function ProvenanceDisclosure({ runId }: Readonly<{ runId: string }>) {
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [provenance, setProvenance] = useState<SimulationProvenance>();

  async function load(): Promise<void> {
    if (provenance || loading) {
      return;
    }
    setLoading(true);
    try {
      setProvenance(await getSimulationProvenance(runId));
      setError(undefined);
    } catch (loadError) {
      if (loadError instanceof ApiProblem) {
        recordRunUiError(loadError);
      }
      setError(problemMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <details
      className="provenance-panel"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          browserRunTelemetry({ name: "run_provenance_view" });
          void load();
        }
      }}
    >
      <summary>View frozen method and provenance</summary>
      {loading ? <p aria-live="polite">Loading frozen provenance…</p> : null}
      {error ? (
        <p className="problem" role="alert">
          {error}
        </p>
      ) : null}
      {provenance?.availability === "legacy_unavailable" ? (
        <p className="empty-state">
          This historical run did not capture the complete provenance
          projection. SIMULA will not reconstruct it from current configuration.
        </p>
      ) : null}
      {provenance?.availability === "available" ? (
        <div className="provenance-grid">
          <section>
            <h3>Frozen stimulus</h3>
            <p className="frozen-text">{provenance.stimulus.content}</p>
            <dl>
              <dt>Version</dt>
              <dd>{provenance.stimulus.version_id}</dd>
              <dt>Checksum</dt>
              <dd>
                <code>{provenance.stimulus.content_sha256}</code>
              </dd>
            </dl>
          </section>
          <section>
            <h3>Authored demo audience</h3>
            <p>{provenance.audience.limitations[0]}</p>
            <dl>
              <dt>Kind</dt>
              <dd>{provenance.audience.kind}</dd>
              <dt>Version</dt>
              <dd>{provenance.audience.version_id}</dd>
              <dt>Checksum</dt>
              <dd>
                <code>{provenance.audience.checksum_sha256}</code>
              </dd>
              <dt>Frozen cells</dt>
              <dd>
                {provenance.audience.cells
                  .map((cell) => `${cell.key}: ${cell.weight}`)
                  .join(", ")}
              </dd>
            </dl>
          </section>
          <section>
            <h3>Frozen execution</h3>
            <dl>
              <dt>Method</dt>
              <dd>{provenance.execution.method_version}</dd>
              <dt>Disclosure version</dt>
              <dd>{provenance.execution.disclosure_version}</dd>
              <dt>Language</dt>
              <dd>{provenance.execution.language}</dd>
              <dt>Output schema</dt>
              <dd>{provenance.execution.output_schema_version}</dd>
              <dt>Provider</dt>
              <dd>
                {provenance.execution.provider_id} v
                {provenance.execution.provider_version}
              </dd>
              <dt>Pipeline code</dt>
              <dd>{provenance.execution.pipeline_release_id}</dd>
              <dt>Code release</dt>
              <dd>
                <code>{provenance.execution.code_release_sha}</code>
              </dd>
              <dt>Configuration checksum</dt>
              <dd>
                <code>{provenance.execution.configuration_sha256}</code>
              </dd>
              <dt>Seed</dt>
              <dd>{provenance.deterministic_seed}</dd>
              <dt>Manifest checksum</dt>
              <dd>
                <code>{provenance.frozen_manifest_sha256}</code>
              </dd>
            </dl>
          </section>
          <section>
            <h3>Frozen limits and timestamps</h3>
            <dl>
              <dt>Limit set</dt>
              <dd>{provenance.limits.version}</dd>
              <dt>Execution deadline</dt>
              <dd>{provenance.limits.arq_job_timeout_seconds} seconds</dd>
              <dt>Database attempts</dt>
              <dd>{provenance.limits.max_database_attempts}</dd>
              <dt>Dispatch generations</dt>
              <dd>{provenance.limits.max_dispatch_generations}</dd>
              <dt>Provider cost ceiling</dt>
              <dd>{provenance.limits.provider_cost_ceiling}</dd>
              <dt>Maximum result bytes</dt>
              <dd>{provenance.limits.max_result_bytes}</dd>
              <dt>Created</dt>
              <dd>{timestamp(provenance.created_at)}</dd>
              <dt>Terminal</dt>
              <dd>{timestamp(provenance.terminal_at)}</dd>
              <dt>Result recorded</dt>
              <dd>{timestamp(provenance.result_created_at)}</dd>
            </dl>
          </section>
          {provenance.provider_receipt?.availability === "available" ? (
            <section>
              <h3>Successful provider receipt</h3>
              <p>
                This receipt covers the successful deterministic result only. It
                is not a billable provider-attempt ledger.
              </p>
              <dl>
                <dt>Provider</dt>
                <dd>
                  {provenance.provider_receipt.provider_id} v
                  {provenance.provider_receipt.provider_version}
                </dd>
                <dt>Model</dt>
                <dd>{provenance.provider_receipt.model_id}</dd>
                <dt>Template</dt>
                <dd>{provenance.provider_receipt.template_id}</dd>
                <dt>Response schema</dt>
                <dd>{provenance.provider_receipt.response_schema_version}</dd>
                <dt>Finish status</dt>
                <dd>{provenance.provider_receipt.finish_status}</dd>
                <dt>Input tokens</dt>
                <dd>{provenance.provider_receipt.usage.input_tokens}</dd>
                <dt>Output tokens</dt>
                <dd>{provenance.provider_receipt.usage.output_tokens}</dd>
                <dt>Cost</dt>
                <dd>
                  {provenance.provider_receipt.usage.cost_microusd} micro-USD
                </dd>
                <dt>Provider started</dt>
                <dd>{timestamp(provenance.provider_receipt.started_at)}</dd>
                <dt>Provider completed</dt>
                <dd>{timestamp(provenance.provider_receipt.ended_at)}</dd>
              </dl>
            </section>
          ) : null}
          {provenance.provider_receipt?.availability ===
          "legacy_unavailable" ? (
            <section>
              <h3>Successful provider receipt unavailable</h3>
              <p>
                This historical result predates successful-result receipt
                capture. SIMULA will not synthesize one.
              </p>
            </section>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}
