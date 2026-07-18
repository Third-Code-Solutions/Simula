import Link from "next/link";

export function WorkspaceSidebar({
  current,
}: Readonly<{
  current: "organizations" | "projects" | "project" | "run";
}>) {
  const contextLabel = {
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
