import { useState } from "react";

import {
  ApiProblem,
  type SimulationProvenance,
  getSimulationProvenance,
} from "@/lib/api";

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
            </dl>
          </section>
          <section>
            <h3>Frozen execution</h3>
            <dl>
              <dt>Method</dt>
              <dd>{provenance.execution.method_version}</dd>
              <dt>Provider</dt>
              <dd>
                {provenance.execution.provider_id} v
                {provenance.execution.provider_version}
              </dd>
              <dt>Pipeline code</dt>
              <dd>{provenance.execution.pipeline_release_id}</dd>
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
              <dt>Created</dt>
              <dd>{timestamp(provenance.created_at)}</dd>
              <dt>Terminal</dt>
              <dd>{timestamp(provenance.terminal_at)}</dd>
            </dl>
          </section>
        </div>
      ) : null}
    </details>
  );
}
