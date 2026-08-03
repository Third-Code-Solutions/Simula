import Link from "next/link";

const CAMPAIGN_LAB_NAVIGATION = [
  {
    label: "Overview",
    href: (projectId: string) => `/projects/${projectId}/campaign-lab#overview`,
  },
  {
    label: "Research",
    href: (projectId: string) =>
      `/projects/${projectId}/campaign-lab#research-upload`,
  },
  {
    label: "Audience Cohorts",
    href: (projectId: string) =>
      `/projects/${projectId}/campaign-lab#stage-cohort_defined`,
  },
  {
    label: "Message Lab",
    href: (projectId: string) =>
      `/projects/${projectId}/campaign-lab#stage-variants_added`,
  },
  {
    label: "Simulations",
    href: (projectId: string) =>
      `/projects/${projectId}/campaign-lab#stage-simulated`,
  },
  {
    label: "Agent Activity",
    href: (projectId: string) =>
      `/projects/${projectId}/campaign-lab#agent-activity`,
  },
  {
    label: "Persona Interviews",
    href: (projectId: string) =>
      `/projects/${projectId}/campaign-lab#stage-interviewed`,
  },
  {
    label: "Surveys",
    href: (projectId: string) => `/projects/${projectId}/evidence#surveys`,
  },
  {
    label: "Calibration",
    href: (projectId: string) => `/projects/${projectId}/evidence#calibration`,
  },
  {
    label: "Backtesting",
    href: (projectId: string) => `/projects/${projectId}/evidence#backtesting`,
  },
  {
    label: "Compliance",
    href: (projectId: string) => `/projects/${projectId}/evidence#compliance`,
  },
  {
    label: "Reports",
    href: (projectId: string) => `/projects/${projectId}/evidence#reports`,
  },
  {
    label: "Audit",
    href: (projectId: string) => `/projects/${projectId}/evidence#audit`,
  },
  {
    label: "Settings",
    href: (projectId: string) => `/projects/${projectId}#settings`,
  },
] as const;

function SidebarItem({
  active = false,
  disabledReason,
  href,
  label,
}: Readonly<{
  active?: boolean;
  disabledReason?: string;
  href?: string;
  label: string;
}>) {
  if (!href) {
    return (
      <span
        aria-disabled="true"
        className="sidebar-nav-link sidebar-nav-link-disabled"
        title={disabledReason}
      >
        {label}
        <small>{disabledReason}</small>
      </span>
    );
  }

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className="sidebar-nav-link"
      href={href}
    >
      {label}
    </Link>
  );
}

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
    | "evidence"
    | "campaign-lab"
    | "run";
  organizationId?: string;
  projectId?: string;
  runId?: string;
}>) {
  const contextLabel = {
    dashboard: "Dashboard",
    methodology: "Methodology lab",
    evidence: "Evidence lab",
    "campaign-lab": "Campaign Simulation Lab",
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
            <SidebarItem
              active={current === "organizations"}
              href="/organizations"
              label="Organizations"
            />
            <SidebarItem
              href="/organizations#guided-rehearsal"
              label="Guided setup"
            />
          </div>
          <div className="sidebar-nav-section">
            <span>Organization</span>
            <SidebarItem
              active={current === "dashboard"}
              disabledReason="Select an organization"
              href={
                organizationId
                  ? `/organizations/${organizationId}/dashboard`
                  : undefined
              }
              label="Dashboard"
            />
            <SidebarItem
              active={current === "projects"}
              disabledReason="Select an organization"
              href={
                organizationId
                  ? `/organizations/${organizationId}/projects`
                  : undefined
              }
              label="Projects"
            />
          </div>
          <div className="sidebar-nav-section">
            <span>Project</span>
            <SidebarItem
              active={current === "project"}
              disabledReason="Select a project"
              href={projectId ? `/projects/${projectId}` : undefined}
              label="Project workspace"
            />
            <SidebarItem
              active={current === "methodology"}
              disabledReason="Select a project"
              href={
                projectId ? `/projects/${projectId}/methodology` : undefined
              }
              label="Methodology lab"
            />
            <SidebarItem
              active={current === "evidence"}
              disabledReason="Select a project"
              href={projectId ? `/projects/${projectId}/evidence` : undefined}
              label="Evidence lab"
            />
            <SidebarItem
              active={current === "campaign-lab"}
              disabledReason="Select a project"
              href={
                projectId ? `/projects/${projectId}/campaign-lab` : undefined
              }
              label="Campaign Simulation Lab"
            />
          </div>
          <div className="sidebar-nav-section sidebar-nav-section-campaign">
            <span>Campaign Simulation Lab</span>
            {CAMPAIGN_LAB_NAVIGATION.map(({ href, label }) => (
              <SidebarItem
                active={current === "campaign-lab" && label === "Overview"}
                disabledReason="Select a project"
                href={projectId ? href(projectId) : undefined}
                key={label}
                label={label}
              />
            ))}
          </div>
          <div className="sidebar-nav-section">
            <span>Rehearsal</span>
            <SidebarItem
              active={current === "run"}
              disabledReason="Open a run"
              href={runId ? `/runs/${runId}` : undefined}
              label="Run result"
            />
          </div>
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
