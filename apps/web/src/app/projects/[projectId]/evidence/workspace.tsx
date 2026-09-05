"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { WorkspaceSidebar } from "@/app/workspace-sidebar";
import { ApiProblem, getProject } from "@/lib/api";

import { SignOutButton } from "../../../sign-out-button";

export function CampaignEvidenceUnavailableInputs() {
  return (
    <section className="evidence-grid" aria-label="Evidence inputs">
      <section className="panel form-stack" id="surveys">
        <p className="eyebrow">01 · Surveys / calibration</p>
        <h2 id="calibration">Survey calibration is unavailable</h2>
        <p className="methodology-warning" role="status">
          Before a survey can calibrate a model, its original import, processing
          steps, and aggregate dataset must be verified together. This binding
          is not available yet, so calibration cannot be submitted here.
        </p>
      </section>
      <section className="panel form-stack" id="backtesting">
        <p className="eyebrow">02 · Historical backtesting</p>
        <h2>Historical backtesting is unavailable</h2>
        <p className="methodology-warning" role="status">
          Backtesting requires independently held-out outcomes linked to an
          approved source and test protocol. That verified link is not available
          yet, so historical outcomes cannot be submitted here.
        </p>
      </section>
    </section>
  );
}

export function CampaignEvidenceWorkspace({
  projectId,
}: Readonly<{ projectId: string }>) {
  const [organizationId, setOrganizationId] = useState<string>();
  const [contextError, setContextError] = useState<string>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void getProject(projectId)
      .then((project) => {
        if (active) {
          setOrganizationId(project.organization_id);
          setContextError(undefined);
        }
      })
      .catch((error: unknown) => {
        if (active)
          setContextError(
            error instanceof ApiProblem
              ? error.message
              : "Could not load project access. Retry to restore workspace navigation.",
          );
      });
    return () => {
      active = false;
    };
  }, [projectId, revision]);

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
      <WorkspaceSidebar
        current="evidence"
        organizationId={organizationId}
        projectId={projectId}
      />
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href={`/projects/${projectId}`}>Project</Link>
        <span aria-hidden="true"> / </span>
        <span>Evidence lab</span>
      </nav>

      {contextError ? (
        <div className="problem" role="alert">
          <p>{contextError}</p>
          <button
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry project access
          </button>
        </div>
      ) : null}
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
            Use declared sources and reproducible aggregate methods. Protected
            evidence workflows stay unavailable until their durable admission
            controls are complete.
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
      </nav>

      <CampaignEvidenceUnavailableInputs />
      <section className="panel evidence-next-action">
        <h2>Continue with supported research tasks</h2>
        <p className="lede">
          Campaign Lab lets you organize sources and review experimental message
          tests. Each workflow explains its evidence requirements before you
          submit.
        </p>
        <Link
          className="primary-link"
          href={`/projects/${projectId}/campaign-lab#research-upload`}
        >
          Open campaign research
        </Link>
      </section>

      <section className="panel" id="compliance">
        <p className="eyebrow">03 · Compliance boundary</p>
        <h2>What this lab can and cannot say</h2>
        <p className="field-note">
          Reports are scoped to declared population, source rights, geography,
          protocol, and model version. They do not estimate an individual, infer
          a private political identity, or produce a universal election or viral
          score.
        </p>
      </section>
    </main>
  );
}
