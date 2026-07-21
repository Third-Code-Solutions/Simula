import Link from "next/link";

import type { OrganizationDashboard } from "@/lib/api";

import styles from "./dashboard.module.css";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function completionRate(dashboard: OrganizationDashboard): string {
  if (dashboard.metrics.runs === 0) return "—";
  return `${Math.round(
    (dashboard.metrics.succeeded_runs / dashboard.metrics.runs) * 100,
  )}%`;
}

function Metric({
  label,
  value,
}: Readonly<{ label: string; value: number | string }>) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function DashboardOverview({
  dashboard,
  onRefresh,
  organizationId,
  refreshing,
}: Readonly<{
  dashboard: OrganizationDashboard;
  onRefresh: () => void;
  organizationId: string;
  refreshing: boolean;
}>) {
  const canCreate = dashboard.permissions.can_create_projects;

  return (
    <>
      <section className={styles.hero} aria-labelledby="dashboard-title">
        <div className={styles.heroCopy}>
          <div className={styles.contextLine}>
            <span>{dashboard.organization_status}</span>
            <span aria-hidden="true">/</span>
            <span>{dashboard.role} access</span>
          </div>
          <p className="eyebrow">Organization dashboard</p>
          <h1 id="dashboard-title">{dashboard.organization_name}</h1>
          <p className="lede">
            Live project, simulation, and reporting activity. Every output is
            experimental and remains attached to its method and limits.
          </p>
        </div>
        <div className={styles.heroActions}>
          {canCreate ? (
            <Link
              className={styles.primaryAction}
              href={`/organizations/${organizationId}/projects#new-project`}
            >
              New project <span aria-hidden="true">↗</span>
            </Link>
          ) : null}
          <button
            className={styles.secondaryAction}
            disabled={refreshing}
            onClick={onRefresh}
            type="button"
          >
            {refreshing ? "Refreshing…" : "Refresh data"}
          </button>
          <small>Updated {formatDate(dashboard.generated_at)}</small>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Workspace metrics">
        <Metric label="Projects" value={dashboard.metrics.projects} />
        <Metric label="Total runs" value={dashboard.metrics.runs} />
        <Metric label="Reports" value={dashboard.metrics.reports} />
        <Metric
          label="Feedback records"
          value={dashboard.metrics.feedback_records}
        />
      </section>

      <section className={styles.operations} aria-label="Operational overview">
        <article className={styles.runHealth}>
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">Run health</p>
              <h2>Execution status</h2>
            </div>
            <strong className={styles.rate}>{completionRate(dashboard)}</strong>
          </div>
          <label htmlFor="successful-runs">Successful runs</label>
          <progress
            id="successful-runs"
            max={Math.max(dashboard.metrics.runs, 1)}
            value={dashboard.metrics.succeeded_runs}
          />
          <dl className={styles.healthBreakdown}>
            <div>
              <dt>Succeeded</dt>
              <dd>{dashboard.metrics.succeeded_runs}</dd>
            </div>
            <div>
              <dt>Active</dt>
              <dd>{dashboard.metrics.active_runs}</dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd>{dashboard.metrics.failed_runs}</dd>
            </div>
          </dl>
          {dashboard.metrics.runs === 0 ? (
            <p className={styles.inlineEmpty}>
              No runs yet. Open a project and review its frozen configuration
              before starting a rehearsal.
            </p>
          ) : null}
        </article>

        <article className={styles.workflowStatus}>
          <div>
            <p className="eyebrow">Workflow coverage</p>
            <h2>Research pipeline</h2>
          </div>
          <dl>
            <div>
              <dt>Audience definitions</dt>
              <dd>{dashboard.metrics.audiences}</dd>
            </div>
            <div>
              <dt>Projects with room to iterate</dt>
              <dd>{dashboard.metrics.projects}</dd>
            </div>
            <div>
              <dt>Inspectable report artifacts</dt>
              <dd>{dashboard.metrics.reports}</dd>
            </div>
          </dl>
          <Link href={`/organizations/${organizationId}/projects`}>
            Open project directory <span aria-hidden="true">→</span>
          </Link>
        </article>
      </section>

      <section className={styles.activity} aria-labelledby="activity-title">
        <div className={styles.activityHeading}>
          <div>
            <p className="eyebrow">Live workspace</p>
            <h2 id="activity-title">Recent activity</h2>
          </div>
          <Link href={`/organizations/${organizationId}/projects`}>
            View all projects
          </Link>
        </div>

        <div className={styles.activityLayout}>
          <article className={styles.projectsPanel}>
            <h3>Projects</h3>
            {dashboard.recent_projects.length ? (
              <ol className={styles.projectList}>
                {dashboard.recent_projects.map((project, index) => (
                  <li key={project.id}>
                    <Link href={`/projects/${project.id}`}>
                      <span className={styles.itemIndex}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className={styles.itemCopy}>
                        <strong>{project.name}</strong>
                        <span>{project.objective}</span>
                      </span>
                      <small>
                        v{project.version} · {formatDate(project.updated_at)}
                      </small>
                      <span aria-hidden="true">↗</span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <div className={styles.composedEmpty}>
                <strong>No projects yet</strong>
                <p>Frame a decision and preserve the first source artifact.</p>
                {canCreate ? (
                  <Link
                    href={`/organizations/${organizationId}/projects#new-project`}
                  >
                    Create the first project
                  </Link>
                ) : null}
              </div>
            )}
          </article>

          <div className={styles.activityRail}>
            <article>
              <h3>Recent runs</h3>
              {dashboard.recent_runs.length ? (
                <ul className={styles.compactActivity}>
                  {dashboard.recent_runs.map((run) => (
                    <li key={run.id}>
                      <Link href={`/runs/${run.id}`}>
                        <span>
                          <strong>{run.project_name}</strong>
                          <small>{formatDate(run.created_at)}</small>
                        </span>
                        <span className={styles.state} data-state={run.state}>
                          {run.state.replaceAll("_", " ")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.inlineEmpty}>No run activity.</p>
              )}
            </article>

            <article>
              <h3>Recent reports</h3>
              {dashboard.recent_reports.length ? (
                <ul className={styles.compactActivity}>
                  {dashboard.recent_reports.map((report) => (
                    <li key={report.id}>
                      <Link href={`/runs/${report.run_id}`}>
                        <span>
                          <strong>{report.project_name}</strong>
                          <small>{formatDate(report.created_at)}</small>
                        </span>
                        <span aria-hidden="true">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.inlineEmpty}>No report artifacts.</p>
              )}
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
