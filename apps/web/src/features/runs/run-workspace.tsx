"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SignOutButton } from "@/app/sign-out-button";
import { WorkspaceSidebar } from "@/app/workspace-sidebar";
import {
  ApiProblem,
  type BehavioralEvidence,
  type BehavioralResult,
  type RunAuditHistory as RunAuditHistoryContract,
  type SimulationRun,
  appendStimulusVersion,
  cancelSimulationRun,
  createBehavioralDemoRun,
  getBehavioralEvidence,
  getBehavioralResult,
  getOrganizationDashboard,
  getProject,
  getRunAuditHistory,
  type SimulationResult,
  getSimulationResult,
} from "@/lib/api";

import { BehavioralRefinementCoordinator } from "./behavioral-refinement";
import { BehavioralRefinementPanel } from "./behavioral-refinement-panel";
import { BehavioralResultRenderer } from "./behavioral-result-renderer";
import { MethodologyReportPanel } from "./methodology-report-panel";
import { ProvenanceDisclosure } from "./provenance-disclosure";
import { ResultRenderer } from "./result-renderer";
import {
  RunPollerRegistry,
  type RunPollSnapshot,
  runPollers,
} from "./run-poller";
import { RunStatusPanel } from "./run-status-panel";
import { RunAuditHistory } from "./run-audit-history";
import { recordRunUiError } from "./run-telemetry";
import { isCancelledRequest } from "@/lib/view-request";
import navigationStyles from "@/app/workspace-actions.module.css";

function problemMessage(error: unknown): string {
  if (error instanceof ApiProblem) {
    return error.correlationId
      ? `${error.message} Correlation: ${error.correlationId}.`
      : error.message;
  }
  return "SIMULA could not complete that request. Retry shortly.";
}

export function RunWorkspace({
  behavioralExperienceEnabled = false,
  pollers = runPollers,
  resultExperienceEnabled = true,
  runId,
}: Readonly<{
  behavioralExperienceEnabled?: boolean;
  pollers?: RunPollerRegistry;
  resultExperienceEnabled?: boolean;
  runId: string;
}>) {
  const router = useRouter();
  const [refinementCoordinator] = useState(
    () =>
      new BehavioralRefinementCoordinator({
        appendStimulusVersion,
        createBehavioralDemoRun,
        getProject,
      }),
  );
  const [result, setResult] = useState<SimulationResult>();
  const [behavioralResult, setBehavioralResult] = useState<BehavioralResult>();
  const [behavioralEvidence, setBehavioralEvidence] =
    useState<BehavioralEvidence>();
  const [runAuditHistory, setRunAuditHistory] =
    useState<RunAuditHistoryContract>();
  const [resultError, setResultError] = useState<string>();
  const [refinementError, setRefinementError] = useState<string>();
  const [refinementAllowed, setRefinementAllowed] = useState(false);
  const [cancelError, setCancelError] = useState<string>();
  const [cancelResponse, setCancelResponse] = useState<SimulationRun>();
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
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
      !behavioralExperienceEnabled ||
      run?.schema_version !== 2 ||
      run.state !== "succeeded"
    ) {
      return;
    }
    const organizationId = run.organization_id;
    const controller = new AbortController();
    let stale = false;
    async function loadRefinementPermission(): Promise<void> {
      try {
        const dashboard = await getOrganizationDashboard(
          organizationId,
          controller.signal,
        );
        if (!stale) {
          setRefinementAllowed(
            dashboard.permissions.can_create_projects &&
              dashboard.permissions.can_create_runs,
          );
        }
      } catch (error) {
        if (isCancelledRequest(error)) {
          return;
        }
        if (!stale) {
          setRefinementAllowed(false);
        }
      }
    }
    void loadRefinementPermission();
    return () => {
      stale = true;
      controller.abort();
    };
  }, [
    behavioralExperienceEnabled,
    run?.organization_id,
    run?.schema_version,
    run?.state,
  ]);

  useEffect(() => {
    if (
      !resultExperienceEnabled ||
      run?.state !== "succeeded" ||
      run.schema_version !== 1 ||
      result ||
      resultError
    ) {
      return;
    }
    const controller = new AbortController();
    let stale = false;
    async function loadResult(): Promise<void> {
      try {
        const loaded = await getSimulationResult(runId, controller.signal);
        if (!stale) {
          setResult(loaded);
        }
      } catch (error) {
        if (isCancelledRequest(error)) {
          return;
        }
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
      controller.abort();
    };
  }, [
    result,
    resultError,
    resultExperienceEnabled,
    run?.schema_version,
    run?.state,
    runId,
  ]);

  useEffect(() => {
    if (
      !resultExperienceEnabled ||
      !behavioralExperienceEnabled ||
      run?.state !== "succeeded" ||
      run.schema_version !== 2 ||
      behavioralResult ||
      behavioralEvidence ||
      runAuditHistory ||
      resultError
    ) {
      return;
    }
    let stale = false;
    const controller = new AbortController();
    async function loadBehavioralResult(): Promise<void> {
      try {
        const [loadedResult, loadedEvidence, loadedHistory] = await Promise.all(
          [
            getBehavioralResult(runId, controller.signal),
            getBehavioralEvidence(runId, controller.signal),
            getRunAuditHistory(runId, controller.signal),
          ],
        );
        if (
          loadedResult.study_id !== run?.project_id ||
          loadedEvidence.context_graph.organization_id !==
            run?.organization_id ||
          loadedHistory.run_id !== runId ||
          loadedResult.context_graph_sha256 !==
            loadedEvidence.context_graph.checksum_sha256
        ) {
          throw new Error("behavioral result identity binding failed");
        }
        if (!stale) {
          setBehavioralResult(loadedResult);
          setBehavioralEvidence(loadedEvidence);
          setRunAuditHistory(loadedHistory);
        }
      } catch (error) {
        if (isCancelledRequest(error)) {
          return;
        }
        if (error instanceof ApiProblem) {
          recordRunUiError(error);
        }
        if (!stale) {
          setResultError(problemMessage(error));
        }
      }
    }
    void loadBehavioralResult();
    return () => {
      stale = true;
      controller.abort();
    };
  }, [
    behavioralEvidence,
    behavioralExperienceEnabled,
    behavioralResult,
    resultError,
    resultExperienceEnabled,
    runAuditHistory,
    run?.organization_id,
    run?.project_id,
    run?.schema_version,
    run?.state,
    runId,
  ]);

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
    setBehavioralResult(undefined);
    setBehavioralEvidence(undefined);
    setRunAuditHistory(undefined);
    setRefinementError(undefined);
    setRefinementAllowed(false);
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

  async function submitRefinement(
    content: string,
    variantKey: string,
  ): Promise<void> {
    if (run?.schema_version !== 2 || run.state !== "succeeded") {
      return;
    }
    setRefinementError(undefined);
    setIsRefining(true);
    try {
      const refinedRun = await refinementCoordinator.refine(
        run,
        content,
        variantKey,
      );
      router.push(`/runs/${refinedRun.id}`);
    } catch (error) {
      if (error instanceof ApiProblem) {
        recordRunUiError(error);
      }
      setRefinementError(problemMessage(error));
    } finally {
      setIsRefining(false);
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
        {run ? (
          <>
            <Link href={`/projects/${run.project_id}`}>Project</Link>
            <span aria-hidden="true"> / </span>
          </>
        ) : null}
        <span>Run</span>
      </nav>
      <section className="run-heading">
        <div>
          <p className="eyebrow">
            {run?.schema_version === 2
              ? "Synthetic behavioral pressure test"
              : "Experimental pressure test"}
          </p>
          <h1 id="run-title">
            {!run
              ? "Simulation run"
              : run.schema_version === 2
                ? "Behavioral simulation run"
                : "Deterministic demo run"}
          </h1>
          <p className="lede">
            {!run
              ? "Review the method and audience before using any modeled output. Experimental outputs do not replace research with people."
              : run.schema_version === 2
                ? "This run uses deterministic synthetic agents. Its heuristic scores and generated explanations are not observed people or a population forecast."
                : "This run uses an authored, non-representative demo audience. It estimates nobody and is not human evidence."}
          </p>
        </div>
        <RunStatusPanel
          isSlow={snapshot.isSlow}
          run={run}
          unavailable={Boolean(snapshot.error)}
        />
      </section>
      {run ? (
        <nav className={navigationStyles.toolbar} aria-label="Run actions">
          <Link href={`/projects/${run.project_id}`}>Back to project</Link>
          {resultExperienceEnabled && result ? (
            <a href="#result-title">Read findings</a>
          ) : null}
          {resultExperienceEnabled &&
          behavioralExperienceEnabled &&
          behavioralResult &&
          behavioralEvidence &&
          runAuditHistory ? (
            <a href="#behavioral-result-title">Read findings</a>
          ) : null}
          {resultExperienceEnabled &&
          behavioralExperienceEnabled &&
          behavioralResult &&
          runAuditHistory ? (
            <a href="#run-audit-history-title">Review run history</a>
          ) : null}
          {resultExperienceEnabled &&
          behavioralExperienceEnabled &&
          behavioralResult &&
          refinementAllowed ? (
            <a href="#behavioral-refinement-title">Refine and retest</a>
          ) : null}
        </nav>
      ) : null}
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
      {run?.state === "succeeded" &&
      (!resultExperienceEnabled ||
        (run.schema_version === 2 && !behavioralExperienceEnabled)) ? (
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
      run.schema_version === 1 &&
      !result &&
      !resultError ? (
        <p aria-live="polite">Loading immutable result…</p>
      ) : null}
      {resultExperienceEnabled && result ? (
        <ResultRenderer result={result} />
      ) : null}
      {run?.state === "succeeded" &&
      run.schema_version === 2 &&
      resultExperienceEnabled &&
      behavioralExperienceEnabled &&
      (!behavioralResult || !behavioralEvidence || !runAuditHistory) &&
      !resultError ? (
        <p aria-live="polite">Loading governed behavioral report…</p>
      ) : null}
      {resultExperienceEnabled &&
      behavioralExperienceEnabled &&
      behavioralResult &&
      behavioralEvidence &&
      runAuditHistory ? (
        <BehavioralResultRenderer
          evidence={behavioralEvidence}
          result={behavioralResult}
        />
      ) : null}
      {resultExperienceEnabled &&
      behavioralExperienceEnabled &&
      behavioralResult &&
      runAuditHistory ? (
        <RunAuditHistory history={runAuditHistory} />
      ) : null}
      {resultExperienceEnabled &&
      behavioralExperienceEnabled &&
      behavioralResult &&
      run?.schema_version === 2 &&
      run.state === "succeeded" ? (
        <MethodologyReportPanel
          defaultVariantKey={behavioralResult.variant_key}
          run={run}
        />
      ) : null}
      {resultExperienceEnabled &&
      behavioralExperienceEnabled &&
      behavioralResult &&
      run?.schema_version === 2 &&
      run.state === "succeeded" &&
      refinementAllowed ? (
        <BehavioralRefinementPanel
          error={refinementError}
          isSubmitting={isRefining}
          onSubmit={(content, variantKey) =>
            void submitRefinement(content, variantKey)
          }
          sourceVariant={behavioralResult.variant_key}
        />
      ) : null}
      {resultExperienceEnabled &&
      run?.state === "succeeded" &&
      run.schema_version === 1 ? (
        <ProvenanceDisclosure runId={runId} />
      ) : null}
    </main>
  );
}
