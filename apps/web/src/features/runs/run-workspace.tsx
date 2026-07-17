"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SignOutButton } from "@/app/sign-out-button";
import {
  ApiProblem,
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
  runId,
}: Readonly<{ pollers?: RunPollerRegistry; runId: string }>) {
  const [result, setResult] = useState<SimulationResult>();
  const [resultError, setResultError] = useState<string>();
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

  useEffect(() => {
    if (snapshot.run?.state !== "succeeded" || result || resultError) {
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
        if (!stale) {
          setResultError(problemMessage(error));
        }
      }
    }
    void loadResult();
    return () => {
      stale = true;
    };
  }, [result, resultError, runId, snapshot.run?.state]);

  const error =
    resultError ??
    (snapshot.error ? problemMessage(snapshot.error) : undefined);
  const canRefresh = snapshot.isStopped || Boolean(error);

  function refreshRun(): void {
    setResultError(undefined);
    setResult(undefined);
    refresh.current();
  }

  return (
    <main className="workspace-main" aria-labelledby="run-title">
      <header className="workspace-header">
        <Link className="wordmark" href="/organizations">
          SIMULA
        </Link>
        <SignOutButton />
      </header>
      <nav aria-label="Breadcrumb">
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
        <RunStatusPanel isSlow={snapshot.isSlow} run={snapshot.run} />
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
      {snapshot.run?.state === "succeeded" && !result && !resultError ? (
        <p aria-live="polite">Loading immutable result…</p>
      ) : null}
      {result ? <ResultRenderer result={result} /> : null}
      {snapshot.run?.state === "succeeded" ? (
        <ProvenanceDisclosure runId={runId} />
      ) : null}
    </main>
  );
}
