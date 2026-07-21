import Link from "next/link";

export function WorkspaceSidebar({
  current,
  organizationId,
  projectId,
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
          <Link
            aria-current={current === "organizations" ? "page" : undefined}
            href="/organizations"
          >
            Organizations
          </Link>
          {organizationId ? (
            <Link
              aria-current={current === "dashboard" ? "page" : undefined}
              href={`/organizations/${organizationId}/dashboard`}
            >
              Dashboard
            </Link>
          ) : null}
          {organizationId ? (
            <Link
              aria-current={current === "projects" ? "page" : undefined}
              href={`/organizations/${organizationId}/projects`}
            >
              Projects
            </Link>
          ) : null}
          {projectId ? (
            <Link
              aria-current={current === "project" ? "page" : undefined}
              href={`/projects/${projectId}`}
            >
              Project workspace
            </Link>
          ) : null}
          {projectId ? (
            <Link
              aria-current={current === "methodology" ? "page" : undefined}
              href={`/projects/${projectId}/methodology`}
            >
              Methodology lab
            </Link>
          ) : null}
          <Link href="/#workflow">Context map</Link>
          <Link href="/#method">Method</Link>
          <Link href="/#principles">Boundaries</Link>
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
