import Link from "next/link";

export function WorkspaceSidebar({
  current,
  organizationId,
  projectId,
  runId,
}: Readonly<{
  current:
    | "organizations"
    | "dashboard"
    | "projects"
    | "project"
    | "methodology"
    | "run";
  organizationId?: string;
  projectId?: string;
  runId?: string;
}>) {
  const contextLabel = {
    dashboard: "Dashboard",
    methodology: "Methodology lab",
    organizations: "Organizations",
    project: "Project",
    projects: "Projects",
    run: "Simulation run",
  }[current];

  return (
    <aside className="workspace-sidebar" aria-label="Workspace navigation">
      <div>
        <p className="workspace-sidebar-label">{contextLabel}</p>
        <nav className="sidebar-nav">
          <div className="sidebar-nav-section">
            <span>Workspace</span>
            <Link
              aria-current={current === "organizations" ? "page" : undefined}
              href="/organizations"
            >
              Organizations
            </Link>
            <Link href="/organizations#guided-rehearsal">Guided setup</Link>
          </div>
          {organizationId ? (
            <div className="sidebar-nav-section">
              <span>Organization</span>
              <Link
                aria-current={current === "dashboard" ? "page" : undefined}
                href={`/organizations/${organizationId}/dashboard`}
              >
                Dashboard
              </Link>
              <Link
                aria-current={current === "projects" ? "page" : undefined}
                href={`/organizations/${organizationId}/projects`}
              >
                Projects
              </Link>
            </div>
          ) : null}
          {projectId ? (
            <div className="sidebar-nav-section">
              <span>Project</span>
              <Link
                aria-current={current === "project" ? "page" : undefined}
                href={`/projects/${projectId}`}
              >
                Project workspace
              </Link>
              <Link
                aria-current={current === "methodology" ? "page" : undefined}
                href={`/projects/${projectId}/methodology`}
              >
                Methodology lab
              </Link>
            </div>
          ) : null}
          {runId ? (
            <div className="sidebar-nav-section">
              <span>Rehearsal</span>
              <Link
                aria-current={current === "run" ? "page" : undefined}
                href={`/runs/${runId}`}
              >
                Run result
              </Link>
            </div>
          ) : null}
        </nav>
      </div>
      <p className="sidebar-boundary">
        <strong>Experimental workspace</strong>
        Authored demo outputs estimate nobody. They are prompts for research,
        not participant research.
      </p>
    </aside>
  );
}
