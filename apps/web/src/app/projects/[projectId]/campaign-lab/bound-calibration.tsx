"use client";

import { useEffect, useRef, useState } from "react";
import {
  createCampaignLabCalibrationFromRuns,
  getCampaignLabCalibrationRun,
  listCampaignLabBoundCalibrations,
  listCampaignLabRuns,
  type CampaignLabRunStatus,
  type CampaignLabDurableRun,
} from "@/lib/api";

export function BoundCalibration({ campaignId }: { campaignId: string }) {
  const [sources, setSources] = useState<readonly CampaignLabRunStatus[]>([]);
  const [history, setHistory] = useState<readonly CampaignLabRunStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [simulation, setSimulation] = useState("");
  const [survey, setSurvey] = useState("");
  const [version, setVersion] = useState("calibration_v1");
  const [activeId, setActiveId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URL(window.location.href).searchParams.get("calibration") ?? ""),
  );
  const [pollAttempt, setPollAttempt] = useState(0);
  const [run, setRun] = useState<CampaignLabDurableRun>();
  const controller = useRef<AbortController | null>(null);
  const keys = useRef(new Map<string, string>());
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    if (!activeId) return;
    const polling = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const next = await getCampaignLabCalibrationRun(
          activeId,
          polling.signal,
        );
        if (polling.signal.aborted) return;
        if (
          next.campaign_id !== campaignId ||
          next.run_type !== "survey_calibration"
        )
          throw new Error(
            "The saved comparison does not belong to this campaign.",
          );
        if (next.status === "succeeded") {
          const binding = next.result?.evidence_binding;
          if (
            !binding ||
            typeof binding !== "object" ||
            !("version" in binding) ||
            binding.version !== "calibration_from_runs_v1"
          )
            throw new Error(
              "This legacy comparison lacks verified input bindings. Create a new comparison from saved evidence.",
            );
        }
        setRun(next);
        if (next.status === "queued" || next.status === "running")
          timer = setTimeout(() => void poll(), 2000);
      } catch (failure) {
        if (!polling.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Comparison could not be loaded.",
          );
      }
    }
    void poll();
    return () => {
      polling.abort();
      clearTimeout(timer);
    };
  }, [activeId, campaignId, pollAttempt]);
  function openRun(id: string) {
    setRun(undefined);
    setError(undefined);
    setActiveId(id);
    setPollAttempt((value) => value + 1);
    const url = new URL(window.location.href);
    url.searchParams.set("campaign", campaignId);
    url.searchParams.set("calibration", id);
    url.hash = "calibration";
    window.history.replaceState(null, "", url);
  }
  async function load(append = false) {
    setBusy(true);
    setError(undefined);
    const nextOffset = append ? offset + 25 : 0;
    try {
      const [inputs, previous] = await Promise.all([
        listCampaignLabRuns(campaignId, nextOffset, controller.current?.signal),
        listCampaignLabBoundCalibrations(
          campaignId,
          nextOffset,
          controller.current?.signal,
        ),
      ]);
      if (controller.current?.signal.aborted) return;
      setSources((old) => (append ? [...old, ...inputs.items] : inputs.items));
      setHistory((old) =>
        append ? [...old, ...previous.items] : previous.items,
      );
      setMore(inputs.items.length === 25 || previous.items.length === 25);
      setOffset(nextOffset);
      setLoaded(true);
    } catch (failure) {
      if (!controller.current?.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Saved evidence could not be loaded.",
        );
    } finally {
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const input = {
      simulation_run_id: simulation,
      survey_import_run_id: survey,
      calibration_version: version,
    };
    const signature = JSON.stringify(input);
    const key = keys.current.get(signature) ?? crypto.randomUUID();
    keys.current.set(signature, key);
    try {
      const created = await createCampaignLabCalibrationFromRuns(
        campaignId,
        input,
        key,
      );
      if (controller.current?.signal.aborted) return;
      if (!created.run_id)
        throw new Error("Comparison did not return a run identifier.");
      keys.current.delete(signature);
      openRun(created.run_id);
    } catch (failure) {
      if (!controller.current?.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Comparison could not be queued.",
        );
    } finally {
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  }
  const simulations = sources.filter(
    (item) =>
      item.run_type === "repeated_simulation" && item.status === "succeeded",
  );
  const surveys = sources.filter(
    (item) => item.run_type === "survey_import" && item.status === "succeeded",
  );
  const result = run?.result;
  return (
    <section
      className="panel"
      id="calibration"
      data-step="evidence"
      aria-labelledby="calibration-title"
    >
      <p className="eyebrow">07 / Compare with human evidence</p>
      <h2 id="calibration-title">Compare a saved test with a survey</h2>
      <p>
        Choose a completed simulation and a survey import from this campaign.
        The survey must have an approved source version and verified import
        fingerprints. Variant and cohort keys must match the saved simulation.
      </p>
      <p className="methodology-warning">
        This describes agreement with the selected survey. It does not establish
        reliable predictions, population representativeness, or independent
        scientific validation.
      </p>
      <button
        type="button"
        className="button-quiet"
        disabled={busy}
        onClick={() => void load()}
      >
        {busy
          ? "Loading evidence..."
          : loaded
            ? "Refresh saved evidence"
            : "Choose saved evidence"}
      </button>
      {error && (
        <div role="alert">
          <p>{error}</p>
          {activeId && (
            <button
              type="button"
              onClick={() => {
                setError(undefined);
                setPollAttempt((value) => value + 1);
              }}
            >
              Retry comparison status
            </button>
          )}
        </div>
      )}
      {loaded && (
        <form className="form-stack" onSubmit={submit}>
          <label htmlFor="calibration-simulation">Completed message test</label>
          <select
            id="calibration-simulation"
            required
            value={simulation}
            onChange={(event) => setSimulation(event.target.value)}
          >
            <option value="">Choose a completed test</option>
            {simulations.map((item) => (
              <option key={item.id} value={item.id}>
                {new Date(item.created_at).toLocaleString()} -{" "}
                {item.id.slice(0, 8)}
              </option>
            ))}
          </select>
          {!simulations.length && (
            <p>No completed message tests on the loaded pages.</p>
          )}
          <label htmlFor="calibration-survey">Completed survey import</label>
          <select
            id="calibration-survey"
            required
            value={survey}
            onChange={(event) => setSurvey(event.target.value)}
          >
            <option value="">Choose an admitted survey import</option>
            {surveys.map((item) => (
              <option key={item.id} value={item.id}>
                {new Date(item.created_at).toLocaleString()} -{" "}
                {item.id.slice(0, 8)}
              </option>
            ))}
          </select>
          {!surveys.length && (
            <p>
              No completed survey imports on the loaded pages. Import a survey
              with its approved source version first.
            </p>
          )}
          <label htmlFor="calibration-version">Comparison version</label>
          <input
            id="calibration-version"
            required
            maxLength={120}
            value={version}
            onChange={(event) => setVersion(event.target.value)}
          />
          <button type="submit" disabled={busy || !simulation || !survey}>
            Compare saved evidence
          </button>
        </form>
      )}
      {more && (
        <button
          type="button"
          className="button-quiet"
          disabled={busy}
          onClick={() => void load(true)}
        >
          Load older evidence
        </button>
      )}
      {history.length > 0 && (
        <details>
          <summary>Saved comparisons</summary>
          {history.map((item) => (
            <p key={item.id}>
              <button
                type="button"
                className="button-quiet"
                onClick={() => openRun(item.id)}
              >
                {new Date(item.created_at).toLocaleString()} - {item.status} -{" "}
                {item.id.slice(0, 8)}
              </button>
            </p>
          ))}
        </details>
      )}
      {activeId && (
        <div aria-live="polite">
          <p>
            Comparison: <strong>{run?.status ?? "Loading"}</strong>
          </p>
          {run?.status === "failed" && (
            <p>
              The comparison failed. Review the source runs and admission status
              before trying again.
            </p>
          )}
          {run?.status === "succeeded" && result && (
            <div>
              <h3>Survey comparison result</h3>
              <dl>
                <dt>Matched message variants</dt>
                <dd>{String(result.matched_variants ?? "Unavailable")}</dd>
                <dt>Matched observations</dt>
                <dd>{String(result.matched_observations ?? "Unavailable")}</dd>
                <dt>Mean absolute metric difference (0-100 scale)</dt>
                <dd>
                  {typeof result.aggregate_metric_mae === "number"
                    ? result.aggregate_metric_mae.toFixed(2)
                    : "Unavailable"}
                </dd>
              </dl>
              <p>
                {String(
                  result.scientific_disclosure ??
                    "Descriptive comparison only. No independent scientific validation.",
                )}
              </p>
              <details>
                <summary>Methodology and evidence fingerprints</summary>
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
