"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { WorkspaceSidebar } from "@/app/workspace-sidebar";
import {
  cancelCampaignEvidenceRun,
  CampaignEvidenceEvent,
  CampaignEvidenceRun,
  createHistoricalBacktest,
  createSurveyCalibration,
  getCampaignEvidenceEvents,
  getCampaignEvidenceRun,
} from "@/lib/api";

import { SignOutButton } from "../../../sign-out-button";

const TERMINAL_STATES = new Set(["completed", "failed", "canceled"]);

const surveyExample = JSON.stringify(
  {
    provenance: {
      evidence_class: "observed_survey",
      source_id: "survey_source_2026",
      source_version: "v1",
      owner: "Research owner",
      license: "Consent-cleared internal research",
      allowed_uses: ["campaign calibration"],
      collection_period: "2026-Q1",
      geography: "Philippines",
      methodology: "consented aggregate survey",
      consent_recorded: true,
      authorized_for_calibration: true,
      quality_filter_version: "quality_v1",
      sample_size: 100,
      checksum_sha256:
        "0000000000000000000000000000000000000000000000000000000000000000",
      known_biases: ["voluntary response"],
      coverage_limitations: ["aggregate observations only"],
    },
    observations: [],
  },
  null,
  2,
);

const backtestProtocolExample = JSON.stringify(
  {
    protocol_id: "historical_replay_v1",
    protocol_version: "v1",
    model_version: "simula-v1",
    methodology_version: "population_weighted_v1",
    outcome_metric: "positive_share",
    development_campaign_ids: ["development_2024"],
    holdout_campaign_ids: ["holdout_2025"],
    minimum_campaigns: 1,
  },
  null,
  2,
);

function parseObject(value: string, field: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${field} must be one JSON object.`);
  }
  return parsed as Record<string, unknown>;
}
function parseArray(value: string, field: string): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error(`${field} must be a JSON array.`);
  return parsed.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object" && !Array.isArray(item),
  );
}

export function CampaignEvidenceWorkspace({
  projectId,
}: Readonly<{ projectId: string }>) {
  const [sourceVersionId, setSourceVersionId] = useState("");
  const [syntheticJson, setSyntheticJson] = useState("[]");
  const [surveyJson, setSurveyJson] = useState(surveyExample);
  const [outcomeSetId, setOutcomeSetId] = useState("");
  const [protocolJson, setProtocolJson] = useState(backtestProtocolExample);
  const [predictionJson, setPredictionJson] = useState("{}");
  const [baselineJson, setBaselineJson] = useState("");
  const [outcomesJson, setOutcomesJson] = useState("{}");
  const [run, setRun] = useState<CampaignEvidenceRun | null>(null);
  const [events, setEvents] = useState<readonly CampaignEvidenceEvent[]>([]);
  const [busy, setBusy] = useState<"survey" | "backtest" | "cancel" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!run || TERMINAL_STATES.has(run.status)) return;
    let active = true;
    const refresh = async () => {
      try {
        const [nextRun, nextEvents] = await Promise.all([
          getCampaignEvidenceRun(run.evidence_id),
          getCampaignEvidenceEvents(run.evidence_id),
        ]);
        if (active) {
          setRun(nextRun);
          setEvents(nextEvents.items);
        }
      } catch {
        // Keep the last durable state visible; the next interval retries.
      }
    };
    const timer = window.setInterval(refresh, 1500);
    void refresh();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [run]);

  async function submitSurvey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("survey");
    setError(null);
    try {
      const next = await createSurveyCalibration(projectId, {
        source_version_id: sourceVersionId.trim(),
        synthetic_observations: parseArray(
          syntheticJson,
          "Synthetic observations",
        ),
        survey: parseObject(surveyJson, "Survey dataset"),
      });
      setRun(next);
      setEvents([]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Calibration could not be queued.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitBacktest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("backtest");
    setError(null);
    try {
      const next = await createHistoricalBacktest(projectId, {
        outcome_set_id: outcomeSetId.trim(),
        protocol: parseObject(protocolJson, "Backtest protocol"),
        prediction_set: parseObject(predictionJson, "Blind prediction set"),
        ...(baselineJson.trim()
          ? {
              baseline_prediction_set: parseObject(
                baselineJson,
                "Baseline prediction set",
              ),
            }
          : {}),
        outcomes: parseObject(outcomesJson, "Held-out outcomes"),
      });
      setRun(next);
      setEvents([]);
      // The held-out payload is deliberately removed from the working form after admission.
      setOutcomesJson("{}");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Backtest could not be queued.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!run) return;
    setBusy("cancel");
    setError(null);
    try {
      setRun(await cancelCampaignEvidenceRun(run.evidence_id));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Cancellation could not be requested.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <main
      className="workspace-main workspace-main-wide"
      id="main-content"
      tabIndex={-1}
    >
      <header className="workspace-header">
        <Link className="wordmark" href="/organizations">
          SIMULA
        </Link>
        <SignOutButton />
      </header>
      <WorkspaceSidebar current="evidence" projectId={projectId} />
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href={`/projects/${projectId}`}>Project</Link>
        <span aria-hidden="true"> / </span>
        <span>Evidence lab</span>
      </nav>

      <section
        className="methodology-hero evidence-hero"
        aria-labelledby="page-title"
      >
        <div>
          <p className="eyebrow">
            Observed evidence · population weighting · blind replay
          </p>
          <h1 id="page-title">Evidence lab</h1>
          <p className="lede">
            Replace invented viral scores with weighted aggregate comparisons,
            consented survey calibration, and held-out historical backtesting.
          </p>
        </div>
        <div className="methodology-notice" role="note">
          <strong>No individual voter dossiers</strong>
          <span>
            Only aggregate cohorts, declared provenance, and reproducible
            metrics are accepted.
          </span>
        </div>
      </section>

      <nav className="evidence-nav" aria-label="Evidence workflow">
        <a href="#surveys">Surveys</a>
        <a href="#calibration">Calibration</a>
        <a href="#backtesting">Backtesting</a>
        <a href="#compliance">Compliance</a>
        <a href="#reports">Reports</a>
        <a href="#audit">Audit</a>
      </nav>

      {error ? (
        <p className="problem" role="alert">
          {error}
        </p>
      ) : null}

      <section className="evidence-grid" aria-label="Evidence inputs">
        <form className="panel form-stack" id="surveys" onSubmit={submitSurvey}>
          <p className="eyebrow">01 · Surveys / calibration</p>
          <h2 id="calibration">Calibrate weighted synthetic aggregates</h2>
          <p className="field-note">
            Use an admitted source version and survey aggregates by
            variant/cohort. The evaluator reports TVD, Brier score, MAE/RMSE,
            and rank agreement.
          </p>
          <label htmlFor="survey-source-version">
            Admitted source version ID
          </label>
          <input
            id="survey-source-version"
            onChange={(event) => setSourceVersionId(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            required
            value={sourceVersionId}
          />
          <label htmlFor="synthetic-observations">
            Synthetic observations JSON array
          </label>
          <textarea
            id="synthetic-observations"
            onChange={(event) => setSyntheticJson(event.target.value)}
            rows={8}
            value={syntheticJson}
          />
          <label htmlFor="survey-dataset">Consented survey dataset JSON</label>
          <textarea
            id="survey-dataset"
            onChange={(event) => setSurveyJson(event.target.value)}
            rows={12}
            value={surveyJson}
          />
          <button disabled={busy !== null} type="submit">
            {busy === "survey"
              ? "Queuing calibration…"
              : "Queue survey calibration"}
          </button>
        </form>

        <form
          className="panel form-stack"
          id="backtesting"
          onSubmit={submitBacktest}
        >
          <p className="eyebrow">02 · Historical backtesting</p>
          <h2>Replay a frozen blind prediction set</h2>
          <p className="field-note">
            Outcomes are admitted by reference, held privately during
            evaluation, then destroyed after completion. They are never included
            in public run responses.
          </p>
          <label htmlFor="outcome-set">Admitted outcome set ID</label>
          <input
            id="outcome-set"
            onChange={(event) => setOutcomeSetId(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            required
            value={outcomeSetId}
          />
          <label htmlFor="backtest-protocol">Protocol JSON</label>
          <textarea
            id="backtest-protocol"
            onChange={(event) => setProtocolJson(event.target.value)}
            rows={8}
            value={protocolJson}
          />
          <label htmlFor="prediction-set">Blind prediction set JSON</label>
          <textarea
            id="prediction-set"
            onChange={(event) => setPredictionJson(event.target.value)}
            rows={6}
            value={predictionJson}
          />
          <label htmlFor="baseline-set">
            Optional baseline prediction set JSON
          </label>
          <textarea
            id="baseline-set"
            onChange={(event) => setBaselineJson(event.target.value)}
            rows={4}
            value={baselineJson}
          />
          <label htmlFor="held-out-outcomes">
            Held-out outcomes JSON (private on submit)
          </label>
          <textarea
            id="held-out-outcomes"
            onChange={(event) => setOutcomesJson(event.target.value)}
            rows={8}
            value={outcomesJson}
          />
          <button disabled={busy !== null} type="submit">
            {busy === "backtest"
              ? "Queuing backtest…"
              : "Queue historical backtest"}
          </button>
        </form>
      </section>

      <section
        className="panel evidence-status"
        id="reports"
        aria-live="polite"
        aria-labelledby="evidence-status-heading"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">03 · Reports / audit</p>
            <h2 id="evidence-status-heading">Evidence run status</h2>
          </div>
          {run && !TERMINAL_STATES.has(run.status) ? (
            <button
              className="button-ghost"
              disabled={busy !== null}
              onClick={cancel}
              type="button"
            >
              {busy === "cancel" ? "Requesting…" : "Cancel run"}
            </button>
          ) : null}
        </div>
        {run ? (
          <>
            <dl className="evidence-metrics">
              <div>
                <dt>Kind</dt>
                <dd>{run.kind}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{run.status}</dd>
              </div>
              <div>
                <dt>Stage</dt>
                <dd>{run.stage}</dd>
              </div>
              <div>
                <dt>Progress</dt>
                <dd>{run.progress}%</dd>
              </div>
              <div>
                <dt>Attempts</dt>
                <dd>{run.attempt_count}</dd>
              </div>
            </dl>
            {run.result ? (
              <pre className="evidence-report">
                {JSON.stringify(run.result, null, 2)}
              </pre>
            ) : null}
            {run.last_error_detail ? (
              <p className="problem">{run.last_error_detail}</p>
            ) : null}
            <div id="audit">
              <h3>Durable progress events</h3>
              <ol className="evidence-events">
                {events.map((event) => (
                  <li key={event.event_id}>
                    <strong>{event.stage}</strong> · {event.progress}% ·{" "}
                    {event.message ?? event.event_kind}
                  </li>
                ))}
              </ol>
            </div>
          </>
        ) : (
          <p className="empty-state">
            Queue a calibration or backtest to see its durable progress and
            evidence report here.
          </p>
        )}
      </section>

      <section className="panel" id="compliance">
        <p className="eyebrow">04 · Compliance boundary</p>
        <h2>What this lab can and cannot say</h2>
        <p className="field-note">
          Reports are scoped to the declared population, source rights,
          geography, protocol, and model version. They do not estimate an
          individual, infer a private political identity, or produce a universal
          election or viral score.
        </p>
      </section>
    </main>
  );
}
