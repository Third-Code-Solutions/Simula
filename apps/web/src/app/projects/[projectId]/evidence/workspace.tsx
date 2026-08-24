"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { WorkspaceSidebar } from "@/app/workspace-sidebar";
import { getProject } from "@/lib/api";

import { SignOutButton } from "../../../sign-out-button";

export function CampaignEvidenceUnavailableInputs() {
  return (
    <section className="evidence-grid" aria-label="Evidence inputs">
      <section className="panel form-stack" id="surveys">
        <p className="eyebrow">01 · Surveys / calibration</p>
        <h2 id="calibration">Survey calibration is unavailable</h2>
        <p className="methodology-warning" role="status">
          Evidence calibration is paused until the admitted raw survey,
          server-side transform, and resulting aggregate dataset share an
          immutable checksum binding. No survey dataset can be submitted here.
        </p>
      </section>
      <section className="panel form-stack" id="backtesting">
        <p className="eyebrow">02 · Historical backtesting</p>
        <h2>Historical backtesting is unavailable</h2>
        <p className="methodology-warning" role="status">
          Evidence backtesting is paused until the exact held-out outcome
          envelope is immutably bound to its admitted registry artifact,
          protocol, and checksum. No outcome payload can be submitted here.
        </p>
      </section>
    </section>
  );
}

export function CampaignEvidenceWorkspace({
  projectId,
}: Readonly<{ projectId: string }>) {
  const [organizationId, setOrganizationId] = useState<string>();

  useEffect(() => {
    let active = true;
    void getProject(projectId)
      .then((project) => {
        if (active) setOrganizationId(project.organization_id);
      })
      .catch(() => {
        // Navigation may still render without a transient project-context read.
      });
    return () => {
      active = false;
    };
  }, [projectId]);

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
