"use client";

import { useEffect, useState } from "react";
import { listCampaignLabRuns, type CampaignLabRunStatus } from "@/lib/api";

export function RunHistory({
  campaignId,
  onOpen,
  revision,
}: {
  campaignId: string;
  onOpen: (run: CampaignLabRunStatus) => Promise<void>;
  revision: string;
}) {
  const [runs, setRuns] = useState<readonly CampaignLabRunStatus[]>([]);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const requestKey = `${campaignId}:${offset}:${refresh}:${revision}`;
  const [loadedFor, setLoadedFor] = useState("");
  const loading = loadedFor !== requestKey;
  const [opening, setOpening] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    let stale = false;

    void listCampaignLabRuns(campaignId, offset, controller.signal)
      .then((page) => {
        if (!stale) {
          setRuns(page.items);
          setError(undefined);
        }
      })
      .catch(() => {
        if (!stale)
          setError("Saved runs could not be loaded. Refresh to try again.");
      })
      .finally(() => {
        if (!stale) setLoadedFor(requestKey);
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [campaignId, offset, requestKey]);
  async function open(run: CampaignLabRunStatus) {
    setOpening(run.id);
    setError(undefined);
    try {
      await onOpen(run);
    } catch {
      setError(
        "This run could not be reopened. Refresh its status and try again.",
      );
    } finally {
      setOpening(undefined);
    }
  }
  return (
    <details className="panel">
      <summary>Saved runs</summary>
      <p className="field-note">
        Reopen a previous run or continue following its progress. Saved results
        remain separate from settings for a new test.
      </p>
      <button
        className="button-quiet"
        type="button"
        disabled={loading}
        onClick={() => setRefresh((value) => value + 1)}
      >
        Refresh run history
      </button>
      {error && !loading ? (
        <p role="alert" className="problem">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p role="status">Loading saved runs…</p>
      ) : runs.length === 0 ? (
        <p>
          No runs on this page. Start a message test to create your first run.
        </p>
      ) : (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th scope="col">Activity</th>
                <th scope="col">Created</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <th scope="row">{run.run_type.replaceAll("_", " ")}</th>
                  <td>
                    <time dateTime={run.created_at}>
                      {new Date(run.created_at).toLocaleString()}
                    </time>
                  </td>
                  <td>
                    {run.status} · {run.progress}%
                  </td>
                  <td>
                    <button
                      className="button-quiet"
                      type="button"
                      disabled={!!opening}
                      onClick={() => {
                        void open(run);
                      }}
                    >
                      {opening === run.id ? "Opening…" : "Open run"}
                      <span className="sr-only"> {run.id}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="button-row">
        <button
          className="button-quiet"
          type="button"
          disabled={loading || offset === 0}
          onClick={() => setOffset((value) => Math.max(0, value - 25))}
        >
          Previous runs
        </button>
        <button
          className="button-quiet"
          type="button"
          disabled={loading || runs.length < 25 || offset >= 10000}
          onClick={() => setOffset((value) => value + 25)}
        >
          Older runs
        </button>
      </div>
    </details>
  );
}
