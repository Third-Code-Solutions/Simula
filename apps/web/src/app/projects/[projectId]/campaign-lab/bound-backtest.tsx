"use client";
import { useEffect, useRef, useState } from "react";
import {
  listBoundBacktestInputs,
  listBoundBacktests,
  listBoundBacktestSources,
  createBoundBacktestCommitment,
  admitBoundBacktestOutcomes,
  getBoundBacktest,
  type BacktestSavedRun,
  type CampaignLabDurableRun,
} from "@/lib/api";

export function BoundBacktest({ campaignId }: { campaignId: string }) {
  const [inputs, setInputs] = useState<BacktestSavedRun[]>([]),
    [history, setHistory] = useState<BacktestSavedRun[]>([]);
  const [sources, setSources] = useState<
    {
      id: string;
      source_key: string;
      source_version: string;
      created_at: string;
    }[]
  >([]);
  const [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const [development, setDevelopment] = useState(""),
    [holdout, setHoldout] = useState(""),
    [metric, setMetric] = useState("clarity");
  const [commitment, setCommitment] = useState(""),
    [source, setSource] = useState(""),
    [file, setFile] = useState<File>();
  const [active, setActive] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URL(window.location.href).searchParams.get("backtest") ?? ""),
  );
  const [result, setResult] = useState<CampaignLabDurableRun>(),
    [revision, setRevision] = useState(0);
  const lifetime = useRef<AbortController | null>(null),
    keys = useRef(new Map<string, string>());
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current?.abort();
  }, []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const run = await getBoundBacktest(active, controller.signal);
        if (controller.signal.aborted) return;
        if (run.campaign_id !== campaignId)
          throw new Error("Historical run belongs to another campaign.");
        setResult(run);
        if (run.status === "queued" || run.status === "running")
          timer = setTimeout(() => void poll(), 2000);
      } catch (failure) {
        if (!controller.signal.aborted) {
          setResult(undefined);
          setError(
            failure instanceof Error
              ? failure.message
              : "Historical run could not be loaded.",
          );
        }
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [active, campaignId, revision]);
  function open(id: string) {
    setActive(id);
    setResult(undefined);
    setError(undefined);
    setRevision((v) => v + 1);
    const url = new URL(window.location.href);
    url.searchParams.set("campaign", campaignId);
    url.searchParams.set("backtest", id);
    url.hash = "backtesting";
    window.history.replaceState(null, "", url);
  }
  const [offset, setOffset] = useState(0),
    [more, setMore] = useState(false);
  async function load(append = false) {
    const nextOffset = append ? offset + 100 : 0;
    setBusy(true);
    setError(undefined);
    try {
      const [runs, saved, admitted] = await Promise.all([
        listBoundBacktestInputs(
          campaignId,
          lifetime.current?.signal,
          nextOffset,
        ),
        listBoundBacktests(campaignId, lifetime.current?.signal, nextOffset),
        listBoundBacktestSources(
          campaignId,
          lifetime.current?.signal,
          nextOffset,
        ),
      ]);
      if (lifetime.current?.signal.aborted) return;
      setInputs((old) => (append ? [...old, ...runs.items] : runs.items));
      setHistory((old) => (append ? [...old, ...saved.items] : saved.items));
      setSources((old) =>
        append ? [...old, ...admitted.items] : admitted.items,
      );
      setOffset(nextOffset);
      setMore([runs, saved, admitted].some((page) => page.next_offset != null));
      setLoaded(true);
    } catch (failure) {
      if (!lifetime.current?.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Evidence could not be loaded.",
        );
    } finally {
      if (!lifetime.current?.signal.aborted) setBusy(false);
    }
  }
  async function submit(kind: "commit" | "admit", event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      let input: Record<string, unknown>;
      if (kind === "commit")
        input = {
          development_run_ids: [development],
          holdout_run_ids: [holdout],
          outcome_metric: metric,
          minimum_campaigns: 1,
        };
      else {
        if (!file || file.size > 200000)
          throw new Error("Choose an outcome JSON file smaller than 200 KB.");
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(await file.text());
        } catch {
          throw new Error("Outcome file must contain valid JSON.");
        }
        input = {
          commitment_run_id: commitment,
          source_version_id: source,
          secret_payload: payload,
        };
      }
      if (lifetime.current?.signal.aborted) return;
      const signature = JSON.stringify({ kind, input }),
        key = keys.current.get(signature) ?? crypto.randomUUID();
      keys.current.set(signature, key);
      const queued =
        kind === "commit"
          ? await createBoundBacktestCommitment(
              campaignId,
              input as Parameters<typeof createBoundBacktestCommitment>[1],
              key,
            )
          : await admitBoundBacktestOutcomes(
              campaignId,
              input as Parameters<typeof admitBoundBacktestOutcomes>[1],
              key,
            );
      if (lifetime.current?.signal.aborted) return;
      keys.current.delete(signature);
      open(queued.run_id);
    } catch (failure) {
      if (!lifetime.current?.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Historical workflow request failed.",
        );
    } finally {
      if (!lifetime.current?.signal.aborted) setBusy(false);
    }
  }
  const data = result?.result;
  return (
    <section
      id="backtesting"
      data-step="evidence"
      className="panel lab-evidence-panel"
      aria-labelledby="bound-backtest-title"
    >
      <p className="eyebrow">9 / Historical comparison</p>
      <h2 id="bound-backtest-title">
        Freeze predictions before admitting outcomes
      </h2>
      <p>
        Separate development and holdout campaigns, then record predictions from
        saved simulations. A different source-owning organization owner can
        admit the exact approved outcome file after the commitment completes.
      </p>
      <p className="methodology-warning">
        This measures a scoped historical difference. Recorded timing does not
        prove absence of prior external knowledge or independent scientific
        validation. Legacy backtests remain quarantined.
      </p>
      <button
        type="button"
        className="button-quiet"
        disabled={busy}
        onClick={() => void load()}
      >
        {loaded ? "Refresh historical evidence" : "Choose historical evidence"}
      </button>
      {error && (
        <div role="alert">
          <p>{error}</p>
          {more && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void load(true)}
            >
              Load older historical evidence
            </button>
          )}
          {active && (
            <button
              type="button"
              onClick={() => {
                setError(undefined);
                setRevision((v) => v + 1);
              }}
            >
              Retry historical status
            </button>
          )}
        </div>
      )}
      {loaded && (
        <>
          <form
            className="form-stack"
            onSubmit={(event) => void submit("commit", event)}
          >
            <h3>1. Record a single-campaign protocol</h3>
            <label htmlFor="backtest-development">
              Development simulation from another campaign
            </label>
            <select
              id="backtest-development"
              required
              value={development}
              onChange={(event) => setDevelopment(event.target.value)}
            >
              <option value="">Choose development evidence</option>
              {inputs
                .filter((row) => row.campaign_id !== campaignId)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.campaign_name} ·{" "}
                    {new Date(row.created_at).toLocaleDateString()} ·{" "}
                    {row.id.slice(0, 8)}
                  </option>
                ))}
            </select>
            <label htmlFor="backtest-holdout">
              Saved simulation to hold out
            </label>
            <select
              id="backtest-holdout"
              required
              value={holdout}
              onChange={(event) => setHoldout(event.target.value)}
            >
              <option value="">Choose this campaign’s simulation</option>
              {inputs
                .filter((row) => row.campaign_id === campaignId)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.campaign_name} ·{" "}
                    {new Date(row.created_at).toLocaleDateString()} ·{" "}
                    {row.id.slice(0, 8)}
                  </option>
                ))}
            </select>
            <label htmlFor="backtest-metric">Outcome to compare</label>
            <select
              id="backtest-metric"
              value={metric}
              onChange={(event) => setMetric(event.target.value)}
            >
              {[
                "clarity",
                "relevance",
                "trust",
                "persuasiveness",
                "consideration",
              ].map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
            <p className="field-note">
              This protocol covers one holdout campaign. It cannot establish
              performance across a wider population. Predictions and
              configuration fingerprints become immutable when saved.
            </p>
            <button disabled={busy || !development || !holdout}>
              Record prediction commitment
            </button>
          </form>
          <details>
            <summary>2. Independent custodian: admit outcome data</summary>
            <form
              className="form-stack"
              onSubmit={(event) => void submit("admit", event)}
            >
              <p>
                An independently approved historical source version must be
                registered after the commitment completes, owned by your
                account, and authorized for historical_backtest. Source registry
                approval is a separate administrative process; uploading does
                not approve source rights.
              </p>
              <label htmlFor="backtest-commitment">
                Completed prediction commitment
              </label>
              <select
                id="backtest-commitment"
                required
                value={commitment}
                onChange={(event) => setCommitment(event.target.value)}
              >
                <option value="">Choose a saved commitment</option>
                {history
                  .filter(
                    (row) =>
                      row.phase === "preregister" && row.status === "succeeded",
                  )
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {new Date(row.created_at).toLocaleString()} ·{" "}
                      {row.id.slice(0, 8)}
                    </option>
                  ))}
              </select>
              <label htmlFor="backtest-source">
                Approved source version you own
              </label>
              <select
                id="backtest-source"
                required
                value={source}
                onChange={(event) => setSource(event.target.value)}
              >
                <option value="">Choose an admitted source</option>
                {sources.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.source_key} / {row.source_version}
                  </option>
                ))}
              </select>
              {sources.length === 0 && (
                <p>
                  No approved historical sources owned by this account are
                  available.
                </p>
              )}
              <label htmlFor="backtest-file">
                Exact approved aggregate outcome file
              </label>
              <input
                id="backtest-file"
                type="file"
                accept="application/json,.json"
                required
                onChange={(event) => setFile(event.target.files?.[0])}
              />
              <p className="field-note">
                JSON, up to 200 KB. Required fields: outcomes,
                observation_period, geography, known_biases,
                coverage_limitations. Each outcome uses the frozen campaign,
                cohort and variant keys, outcome_metric, observed_value (0–100),
                and cohort_weight. No respondent records or blind-status flags
                are accepted.
              </p>
              <button disabled={busy || !file || !source || !commitment}>
                Admit outcomes and compare
              </button>
            </form>
          </details>
          {history.length > 0 && (
            <details>
              <summary>Saved commitments and comparisons</summary>
              {history.map((row) => (
                <p key={row.id}>
                  <button
                    type="button"
                    className="button-quiet"
                    disabled={busy}
                    onClick={() => open(row.id)}
                  >
                    {row.phase === "preregister" ? "Commitment" : "Comparison"}{" "}
                    · {row.status} · {new Date(row.created_at).toLocaleString()}{" "}
                    · {row.id.slice(0, 8)}
                  </button>
                </p>
              ))}
            </details>
          )}
        </>
      )}
      {more && (
        <button type="button" disabled={busy} onClick={() => void load(true)}>
          Load older historical evidence
        </button>
      )}
      {active && (
        <p aria-live="polite">
          Historical workflow: <strong>{result?.status ?? "Loading"}</strong>
        </p>
      )}
      {result?.status === "failed" && (
        <p>
          Processing failed. Review the saved inputs and source admission before
          retrying.
        </p>
      )}
      {result?.status === "succeeded" && data && (
        <div className="lab-result">
          <h3>
            {data.phase === "preregistered"
              ? "Prediction commitment recorded"
              : "Historical comparison result"}
          </h3>
          <p>{String(data.scientific_disclosure ?? "")}</p>
          {data.phase === "evaluated" && (
            <dl>
              <dt>Evidence coverage</dt>
              <dd>{String(data.status ?? "Unavailable")}</dd>
              <dt>Required campaigns</dt>
              <dd>{String(data.minimum_campaigns ?? "Unavailable")}</dd>
              <dt>Holdout campaigns</dt>
              <dd>{String(data.campaign_count)}</dd>
              <dt>Mean absolute difference</dt>
              <dd>
                {typeof data.mae === "number"
                  ? data.mae.toFixed(2)
                  : "Unavailable"}
              </dd>
            </dl>
          )}
          <details className="lab-result-source">
            <summary>Read frozen protocol and evidence fingerprints</summary>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
}
