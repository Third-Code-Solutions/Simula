"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SignOutButton } from "@/app/sign-out-button";
import { WorkspaceSidebar } from "@/app/workspace-sidebar";
import {
  ApiProblem,
  type SimulationRun,
  cancelSimulationRun,
  type SimulationResult,
  getSimulationResult,
} from "@/lib/api";

import { ProvenanceDisclosure } from "./provenance-disclosure";
import { ResultRenderer } from "./result-renderer";
import {
  RunPollerRegistry,
  type RunPollSnapshot,
  runPollers,
} from "./run-poller";
import { RunStatusPanel } from "./run-status-panel";
import { recordRunUiError } from "./run-telemetry";

function problemMessage(error: unknown): string {
  if (error instanceof ApiProblem) {
    return error.correlationId
      ? `${error.message} Correlation: ${error.correlationId}.`
      : error.message;
  }
  return "SIMULA could not complete that request. Retry shortly.";
}

export function RunWorkspace({
  pollers = runPollers,
  resultExperienceEnabled = true,
  runId,
}: Readonly<{
  pollers?: RunPollerRegistry;
  resultExperienceEnabled?: boolean;
  runId: string;
}>) {
  const [result, setResult] = useState<SimulationResult>();
  const [resultError, setResultError] = useState<string>();
  const [cancelError, setCancelError] = useState<string>();
  const [cancelResponse, setCancelResponse] = useState<SimulationRun>();
  const [isCancelling, setIsCancelling] = useState(false);
  const [snapshot, setSnapshot] = useState<RunPollSnapshot>({
    isSlow: false,
    isStopped: false,
  });
  const refresh = useRef<() => void>(() => undefined);

  useEffect(() => {
    const subscription = pollers.subscribe(runId, setSnapshot);
    refresh.current = subscription.refresh;
    return subscription.unsubscribe;
  }, [pollers, runId]);

  const run =
    cancelResponse &&
    (!snapshot.run || cancelResponse.version >= snapshot.run.version)
      ? cancelResponse
      : snapshot.run;

  useEffect(() => {
    if (
      !resultExperienceEnabled ||
      run?.state !== "succeeded" ||
      result ||
      resultError
    ) {
      return;
    }
    let stale = false;
    async function loadResult(): Promise<void> {
      try {
        const loaded = await getSimulationResult(runId);
        if (!stale) {
          setResult(loaded);
        }
      } catch (error) {
        if (error instanceof ApiProblem) {
          recordRunUiError(error);
        }
        if (!stale) {
          setResultError(problemMessage(error));
        }
      }
    }
    void loadResult();
    return () => {
      stale = true;
    };
  }, [result, resultError, resultExperienceEnabled, runId, run?.state]);

  const error =
    cancelError ??
    resultError ??
    (snapshot.error ? problemMessage(snapshot.error) : undefined);
  const canRefresh = snapshot.isStopped || Boolean(error);
  const canCancel =
    run?.state === "queued" ||
    run?.state === "running" ||
    run?.state === "retrying";

  function refreshRun(): void {
    setCancelError(undefined);
    setResultError(undefined);
    setResult(undefined);
    refresh.current();
  }

  async function requestCancel(): Promise<void> {
    setCancelError(undefined);
    setIsCancelling(true);
    try {
      const canceled = await cancelSimulationRun(runId);
      setCancelResponse(canceled);
      refresh.current();
    } catch (error) {
      if (error instanceof ApiProblem) {
        recordRunUiError(error);
      }
      setCancelError(problemMessage(error));
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <main
      className="workspace-main"
      id="main-content"
      aria-labelledby="run-title"
      tabIndex={-1}
    >
      <header className="workspace-header">
        <Link className="wordmark" href="/organizations">
          SIMULA
        </Link>
        <SignOutButton />
      </header>
      <WorkspaceSidebar
        current="run"
        organizationId={run?.organization_id}
        projectId={run?.project_id}
        runId={runId}
      />
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/organizations">Organizations</Link>
        <span aria-hidden="true"> / </span>
        <span>Run</span>
      </nav>
      <section className="run-heading">
        <div>
          <p className="eyebrow">Experimental pressure test</p>
          <h1 id="run-title">Deterministic demo run</h1>
          <p className="lede">
            This run uses an authored, non-representative demo audience. It
            estimates nobody and is not human evidence.
          </p>
        </div>
        <RunStatusPanel isSlow={snapshot.isSlow} run={run} />
      </section>
      {error ? (
        <p className="problem" role="alert">
          {error}
        </p>
      ) : null}
      {canRefresh ? (
        <button onClick={refreshRun} type="button">
          Refresh run status
        </button>
      ) : null}
      {canCancel ? (
        <button
          disabled={isCancelling}
          onClick={() => void requestCancel()}
          type="button"
        >
          {isCancelling ? "Requesting cancellation…" : "Cancel run"}
        </button>
      ) : null}
      {run?.state === "succeeded" && !resultExperienceEnabled ? (
        <section className="panel status-panel" aria-live="polite">
          <h2>Result presentation unavailable</h2>
          <p>
            This server has temporarily hidden result presentation. SIMULA will
            not show a substitute value.
          </p>
        </section>
      ) : null}
      {run?.state === "succeeded" &&
      resultExperienceEnabled &&
      !result &&
      !resultError ? (
        <p aria-live="polite">Loading immutable result…</p>
      ) : null}
      {resultExperienceEnabled && result ? (
        <ResultRenderer result={result} />
      ) : null}
      {resultExperienceEnabled && run?.state === "succeeded" ? (
        <ProvenanceDisclosure runId={runId} />
      ) : null}
    </main>
  );
}
