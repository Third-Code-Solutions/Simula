"use client";

import Link from "next/link";
import { useId, useState } from "react";

type Destination =
  | "organizations"
  | "dashboard"
  | "projects"
  | "project"
  | "methodology"
  | "evidence"
  | "campaign-lab"
  | "run";

export function WorkspaceSidebar({
  current,
  organizationId,
  projectId,
  runId,
}: Readonly<{
  current: Destination;
  organizationId?: string;
  projectId?: string;
  runId?: string;
}>) {
  const [expanded, setExpanded] = useState(false);
  const navigationId = useId();
  const contextLabel: Record<Destination, string> = {
    organizations: "Organizations",
    dashboard: "Dashboard",
    projects: "Projects",
    project: "Project workspace",
    methodology: "Methodology lab",
    evidence: "Evidence lab",
    "campaign-lab": "Campaign Simulation Lab",
    run: "Run result",
  };
  function item(destination: Destination, href: string) {
    return (
      <Link
        aria-current={current === destination ? "page" : undefined}
        className="sidebar-nav-link"
        href={href}
        onClick={() => setExpanded(false)}
      >
        <span className="sidebar-nav-link-label">
          {contextLabel[destination]}
        </span>
      </Link>
    );
  }

  return (
    <aside className="workspace-sidebar" aria-label="Workspace navigation">
      <button
        className="workspace-menu-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls={navigationId}
        onClick={() => setExpanded(!expanded)}
      >
        <span>{contextLabel[current]}</span>
        <span>{expanded ? "Close menu −" : "Menu +"}</span>
      </button>
      <div
        className={`workspace-menu${expanded ? " is-expanded" : ""}`}
        id={navigationId}
      >
        <p className="workspace-sidebar-label">Your workspace</p>
        <nav className="sidebar-nav" aria-label="Workspace pages">
          <div className="sidebar-nav-section">
            {item("organizations", "/organizations")}
            {current === "organizations" ? (
              <Link
                className="sidebar-nav-link"
                href="/organizations#guided-rehearsal"
                onClick={() => setExpanded(false)}
              >
                <span className="sidebar-nav-link-label">Guided setup</span>
              </Link>
            ) : null}
          </div>
          {organizationId ? (
            <div className="sidebar-nav-section">
              <span>Organization</span>
              {item("dashboard", `/organizations/${organizationId}/dashboard`)}
              {item("projects", `/organizations/${organizationId}/projects`)}
            </div>
          ) : null}
          {projectId ? (
            <div className="sidebar-nav-section">
              <span>Project</span>
              {item("project", `/projects/${projectId}`)}
              {item("campaign-lab", `/projects/${projectId}/campaign-lab`)}
              {item("methodology", `/projects/${projectId}/methodology`)}
              {item("evidence", `/projects/${projectId}/evidence`)}
            </div>
          ) : null}
          {runId ? (
            <div className="sidebar-nav-section">
              {item("run", `/runs/${runId}`)}
            </div>
          ) : null}
        </nav>
        {!organizationId && !projectId ? (
          <p className="sidebar-guidance">
            Choose an organization to see its projects and recent work.
          </p>
        ) : null}
        <p className="sidebar-boundary">
          <strong>Experimental workspace</strong>
          Synthetic outputs are prompts for research. They do not represent real
          people.
        </p>
      </div>
    </aside>
  );
}
