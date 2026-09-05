"use client";
import { useEffect, useRef, useState } from "react";
import {
  createCampaignLabBoundReport,
  listCampaignLabBoundReports,
  listCampaignLabRuns,
  listCampaignLabBoundCalibrations,
  getCampaignLabBoundReport,
  reviewCampaignLabBoundReport,
  exportCampaignLabBoundReport,
  type BoundCampaignReport,
  type CampaignLabRunStatus,
} from "@/lib/api";

export function BoundReport({ campaignId }: { campaignId: string }) {
  const [sources, setSources] = useState<readonly CampaignLabRunStatus[]>([]);
  const [comparisons, setComparisons] = useState<
    readonly CampaignLabRunStatus[]
  >([]);
  const [history, setHistory] = useState<readonly CampaignLabRunStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [simulation, setSimulation] = useState("");
  const [comparison, setComparison] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [activeId, setActiveId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URL(window.location.href).searchParams.get("report") ?? ""),
  );
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState<BoundCampaignReport>();
  const [decision, setDecision] = useState<
    "approved_experimental" | "rejected" | "revoked"
  >("approved_experimental");
  const [rationale, setRationale] = useState("");
  const lifetime = useRef<AbortController | null>(null);
  const keys = useRef(new Map<string, string>());
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current?.abort();
  }, []);
  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const next = await getCampaignLabBoundReport(
          activeId,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (next.campaign_id !== campaignId)
          throw new Error("Report does not belong to this campaign.");
        setReport(next);
        if (next.status === "queued" || next.status === "running")
          timer = setTimeout(() => void poll(), 2000);
      } catch (failure) {
        if (!controller.signal.aborted) {
          setReport(undefined);
          setError(
            failure instanceof Error
              ? failure.message
              : "Report could not be loaded.",
          );
        }
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activeId, campaignId, revision]);
  function open(id: string) {
    setReport(undefined);
    setError(undefined);
    setNotice(undefined);
    setActiveId(id);
    setRevision((value) => value + 1);
    setRationale("");
    setDecision("approved_experimental");
    const url = new URL(window.location.href);
    url.searchParams.set("campaign", campaignId);
    url.searchParams.set("report", id);
    url.hash = "reports";
    window.history.replaceState(null, "", url);
  }
  async function load(append = false) {
    setBusy(true);
    setError(undefined);
    const nextOffset = append ? offset + 25 : 0;
    try {
      const [runs, calibrations, reports] = await Promise.all([
        listCampaignLabRuns(campaignId, nextOffset, lifetime.current?.signal),
        listCampaignLabBoundCalibrations(
          campaignId,
          nextOffset,
          lifetime.current?.signal,
        ),
        listCampaignLabBoundReports(
          campaignId,
          nextOffset,
          lifetime.current?.signal,
        ),
      ]);
      if (lifetime.current?.signal.aborted) return;
      setSources((old) => (append ? [...old, ...runs.items] : runs.items));
      setComparisons((old) =>
        append ? [...old, ...calibrations.items] : calibrations.items,
      );
      setHistory((old) =>
        append ? [...old, ...reports.items] : reports.items,
      );
      setOffset(nextOffset);
      setMore(
        [runs, calibrations, reports].some((page) => page.items.length === 25),
      );
      setLoaded(true);
    } catch (failure) {
      if (!lifetime.current?.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Saved reports could not be loaded.",
        );
    } finally {
      if (!lifetime.current?.signal.aborted) setBusy(false);
    }
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const input = {
      simulation_run_id: simulation,
      ...(comparison ? { calibration_run_id: comparison } : {}),
    };
    const signature = JSON.stringify(input);
    const key = keys.current.get(signature) ?? crypto.randomUUID();
    keys.current.set(signature, key);
    try {
      const result = await createCampaignLabBoundReport(campaignId, input, key);
      if (lifetime.current?.signal.aborted) return;
      if (!result.run_id)
        throw new Error("Report did not return a run identifier.");
      keys.current.delete(signature);
      open(result.run_id);
    } catch (failure) {
      if (!lifetime.current?.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Report could not be queued.",
        );
    } finally {
      if (!lifetime.current?.signal.aborted) setBusy(false);
    }
  }
  async function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const selectedDecision =
        report?.review?.decision === "approved_experimental"
          ? "revoked"
          : decision;
      const review = await reviewCampaignLabBoundReport(activeId, {
        decision: selectedDecision,
        rationale,
      });
      if (lifetime.current?.signal.aborted) return;
      if (selectedDecision === "revoked") {
        setReport(undefined);
        setActiveId("");
        setNotice("Report revoked. Export is now unavailable.");
      } else {
        setReport((current) => (current ? { ...current, review } : current));
        setNotice("Independent review recorded for this exact report.");
      }
    } catch (failure) {
      if (!lifetime.current?.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Review could not be recorded.",
        );
    } finally {
      if (!lifetime.current?.signal.aborted) setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setError(undefined);
    try {
      const approved = await exportCampaignLabBoundReport(activeId);
      if (lifetime.current?.signal.aborted) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(approved, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `simula-experimental-report-${activeId}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      if (!lifetime.current?.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Export unavailable. Check approval and source rights.",
        );
    } finally {
      if (!lifetime.current?.signal.aborted) setBusy(false);
    }
  }
  const result = report?.result;
  const approved = report?.review?.decision === "approved_experimental";
  return (
    <section
      className="panel lab-evidence-panel"
      id="reports"
      data-step="review"
      aria-labelledby="report-title"
    >
      <p className="eyebrow">11 / Evidence report</p>
      <h2 id="report-title">Prepare an experimental report</h2>
      <p>
        Build a draft from a saved simulation and, optionally, its matching
        survey comparison. Evidence fingerprints remain attached to the report.
        A separate organization owner must review the exact draft before export.
      </p>
      <p className="methodology-warning">
        Approval permits internal experimental use. It does not establish
        reliable predictions or independent scientific validation. Legacy
        reports remain quarantined.
      </p>
      <button
        type="button"
        className="button-quiet"
        disabled={busy}
        onClick={() => void load()}
      >
        {loaded ? "Refresh report evidence" : "Choose report evidence"}
      </button>
      {error && (
        <div role="alert">
          <p>{error}</p>
          {activeId && (
            <button
              type="button"
              onClick={() => {
                setError(undefined);
                setRevision((value) => value + 1);
              }}
            >
              Retry report status
            </button>
          )}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {loaded && (
        <form className="form-stack" onSubmit={create}>
          <label htmlFor="report-simulation">Saved simulation for report</label>
          <select
            id="report-simulation"
            value={simulation}
            onChange={(event) => setSimulation(event.target.value)}
            required
          >
            <option value="">Choose a completed message test</option>
            {sources
              .filter(
                (item) =>
                  item.run_type === "repeated_simulation" &&
                  item.status === "succeeded",
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {new Date(item.created_at).toLocaleString()} -{" "}
                  {item.id.slice(0, 8)}
                </option>
              ))}
          </select>
          <label htmlFor="report-comparison">
            Survey comparison (optional)
          </label>
          <select
            id="report-comparison"
            value={comparison}
            onChange={(event) => setComparison(event.target.value)}
          >
            <option value="">Synthetic-only report</option>
            {comparisons
              .filter((item) => item.status === "succeeded")
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {new Date(item.created_at).toLocaleString()} -{" "}
                  {item.id.slice(0, 8)}
                </option>
              ))}
          </select>
          <p className="field-note">
            A comparison must reference the same simulation. Historical and
            cultural claims are not included without their own verified
            evidence.
          </p>
          <button type="submit" disabled={busy || !simulation}>
            Create report draft
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
          Load older report evidence
        </button>
      )}
      {history.length > 0 && (
        <details>
          <summary>Saved report drafts</summary>
          {history.map((item) => (
            <p key={item.id}>
              <button
                type="button"
                className="button-quiet"
                disabled={busy}
                onClick={() => open(item.id)}
              >
                {new Date(item.created_at).toLocaleString()} - {item.status} -{" "}
                {item.id.slice(0, 8)}
              </button>
            </p>
          ))}
        </details>
      )}
      {activeId && (
        <p aria-live="polite">
          Report: <strong>{report?.status ?? "Loading"}</strong>
        </p>
      )}
      {report?.status === "failed" && (
        <p>
          The report failed. Check its source runs and source admission before
          trying again.
        </p>
      )}
      {report?.status === "succeeded" && result && (
        <div className="lab-result">
          <h3>Experimental report draft</h3>
          <p>
            {String(result.executive_summary ?? "Report summary unavailable")}
          </p>
          <dl>
            <dt>Objective</dt>
            <dd>{String(result.campaign_objective ?? "Unavailable")}</dd>
            <dt>Evidence status</dt>
            <dd>{String(result.evidence_status ?? "Synthetic-only")}</dd>
            <dt>Synthetic agents / repetitions</dt>
            <dd>
              {String(result.number_of_agents ?? "Unavailable")} /{" "}
              {String(result.number_of_repetitions ?? "Unavailable")}
            </dd>
            <dt>Review status</dt>
            <dd>
              {String(
                report.review?.decision ?? "Awaiting independent review",
              ).replaceAll("_", " ")}
            </dd>
          </dl>
          <details>
            <summary>Read full report and evidence fingerprints</summary>
            <pre className="lab-result-source">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
          {approved && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void download()}
            >
              Download approved experimental report
            </button>
          )}
          {(!report.review || approved) && (
            <form className="form-stack" onSubmit={review}>
              <h3>
                {approved ? "Revoke report approval" : "Independent review"}
              </h3>
              <p>
                An organization owner who did not author the report or its
                inputs may approve or reject it. Any organization owner may
                revoke an existing approval. Every decision is retained.
              </p>
              <label htmlFor="report-review-decision">Review decision</label>
              <select
                id="report-review-decision"
                value={approved ? "revoked" : decision}
                onChange={(event) =>
                  setDecision(event.target.value as typeof decision)
                }
              >
                {approved ? (
                  <option value="revoked">Revoke approval</option>
                ) : (
                  <>
                    <option value="approved_experimental">
                      Approve for internal experimental use
                    </option>
                    <option value="rejected">Reject this report</option>
                  </>
                )}
              </select>
              <label htmlFor="report-review-rationale">Review rationale</label>
              <textarea
                id="report-review-rationale"
                required
                minLength={20}
                maxLength={2000}
                value={rationale}
                onChange={(event) => {
                  setRationale(event.target.value);
                  if (approved) setDecision("revoked");
                }}
              />
              <button
                type="submit"
                disabled={busy || rationale.trim().length < 20}
              >
                {approved ? "Revoke approval" : "Record independent review"}
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
