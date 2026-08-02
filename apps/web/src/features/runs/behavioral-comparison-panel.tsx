"use client";

import { type FormEvent, useState } from "react";

import {
  ApiProblem,
  type BehavioralComparison,
  getBehavioralComparison,
} from "@/lib/api";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function label(value: string): string {
  return value.replaceAll("_", " ");
}

function signed(value: number, scale = 1): string {
  const normalized = Math.abs(value) < 1e-12 ? 0 : value * scale;
  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(1)}`;
}

export function BehavioralComparisonPanel({
  candidateRunId,
  expectedStudyId,
  loadComparison = getBehavioralComparison,
}: Readonly<{
  candidateRunId: string;
  expectedStudyId: string;
  loadComparison?: (
    candidateRunId: string,
    baselineRunId: string,
    studyId?: string,
  ) => Promise<BehavioralComparison>;
}>) {
  const [baselineRunId, setBaselineRunId] = useState("");
  const [comparison, setComparison] = useState<BehavioralComparison>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  async function compare(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const baseline = baselineRunId.trim().toLowerCase();
    setComparison(undefined);
    setError(undefined);
    if (
      !UUID_PATTERN.test(baseline) ||
      baseline === candidateRunId.toLowerCase()
    ) {
      setError("Enter a different, valid baseline run ID.");
      return;
    }
    setIsLoading(true);
    try {
      const loaded = await loadComparison(
        candidateRunId,
        baseline,
        expectedStudyId,
      );
      setComparison(loaded);
    } catch (failure) {
      setError(
        failure instanceof ApiProblem
          ? failure.message
          : "SIMULA could not verify a frozen matched design for these runs.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function download(): void {
    if (comparison === undefined) {
      return;
    }
    const blob = new Blob([JSON.stringify(comparison, null, 2) + "\n"], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `simula-matched-comparison-${comparison.candidate_run_id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      aria-labelledby="behavioral-comparison-title"
      className="behavioral-comparison-section"
    >
      <div className="result-heading">
        <div>
          <p className="eyebrow">Frozen matched design</p>
          <h2 id="behavioral-comparison-title">A/B or retest comparison</h2>
        </div>
        <span className="trust-label">No winner</span>
      </div>
      <p className="result-disclosure">
        Compare this candidate with a baseline only when SIMULA can prove the
        same study, context, fleet, method, provider contract, and exact
        synthetic agents.
      </p>
      <form
        className="comparison-form"
        onSubmit={(event) => void compare(event)}
      >
        <label htmlFor="baseline-run-id">Baseline run ID</label>
        <div>
          <input
            autoComplete="off"
            id="baseline-run-id"
            onChange={(event) => {
              setBaselineRunId(event.target.value);
              setComparison(undefined);
              setError(undefined);
            }}
            placeholder="00000000-0000-0000-0000-000000000000"
            required
            spellCheck={false}
            type="text"
            value={baselineRunId}
          />
          <button disabled={isLoading} type="submit">
            {isLoading ? "Verifying match…" : "Compare matched runs"}
          </button>
        </div>
        <p className="field-note">
          For a retest, launch the refined stimulus with the same frozen setup,
          then use the original run as the baseline.
        </p>
      </form>
      {error ? (
        <p className="problem" role="alert">
          {error}
        </p>
      ) : null}
      {comparison ? (
        <div className="comparison-result" aria-live="polite">
          <div className="result-heading">
            <div>
              <p className="eyebrow">Candidate minus baseline</p>
              <h3>Matched synthetic differences</h3>
            </div>
            <span className="trust-label">
              {comparison.paired_agents} paired agents
            </span>
          </div>
          <dl className="behavioral-score-grid">
            {comparison.metric_deltas.map((metric) => (
              <div key={metric.key}>
                <dt>{label(metric.key)}</dt>
                <dd>{signed(metric.candidate_minus_baseline)}</dd>
                <dd className="behavioral-score-note">
                  Synthetic-point difference
                </dd>
              </div>
            ))}
          </dl>
          <section className="panel result-panel">
            <h4>Action-share differences</h4>
            <table>
              <caption>
                Candidate minus baseline; paired synthetic runs only.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Action</th>
                  <th scope="col">Difference</th>
                </tr>
              </thead>
              <tbody>
                {comparison.action_share_deltas.map((action) => (
                  <tr key={action.key}>
                    <th scope="row">{label(action.key)}</th>
                    <td>
                      {signed(action.candidate_minus_baseline, 100)} percentage
                      points
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <aside className="limitations-panel">
            <strong>Interpretation limits</strong>
            <ul>
              {comparison.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </aside>
          <button className="secondary-button" onClick={download} type="button">
            Export validated comparison JSON
          </button>
        </div>
      ) : null}
    </section>
  );
}
