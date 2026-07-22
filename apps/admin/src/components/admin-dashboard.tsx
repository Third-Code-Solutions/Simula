import type { PlatformAdminDashboard as DashboardData } from "@/lib/platform-api";

import { SignOutButton } from "./sign-out-button";

const number = new Intl.NumberFormat("en-US");
const dateTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

export function AdminDashboard({
  dashboard,
  email,
  workspaceOrigin,
}: Readonly<{
  dashboard: DashboardData;
  email: string;
  workspaceOrigin?: string;
}>) {
  const metrics = [
    ["Users", dashboard.metrics.users],
    ["Organizations", dashboard.metrics.organizations],
    ["Projects", dashboard.metrics.projects],
    ["Runs", dashboard.metrics.runs],
    ["Active runs", dashboard.metrics.active_runs],
    ["Reports", dashboard.metrics.reports],
    ["Feedback", dashboard.metrics.feedback_records],
  ] as const;

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <a
          className="wordmark"
          href="#main-content"
          aria-label="SIMULA Control home"
        >
          SIMULA
        </a>
        <div className="admin-account">
          <span className="role-badge">Superadmin</span>
          <span className="account-email">{email}</span>
          <SignOutButton />
        </div>
      </header>

      <aside className="admin-sidebar" aria-label="Control navigation">
        <div>
          <p className="workspace-sidebar-label">Platform control</p>
          <nav className="sidebar-nav">
            <div className="sidebar-nav-section">
              <span>Administration</span>
              <a aria-current="page" href="#main-content">
                Control plane
              </a>
              <a href="#organization-inventory">Organizations</a>
            </div>
            {workspaceOrigin ? (
              <div className="sidebar-nav-section">
                <span>SIMULA</span>
                <a href={`${workspaceOrigin}/organizations`}>Main workspace</a>
              </div>
            ) : null}
          </nav>
        </div>
        <p className="sidebar-boundary">
          <strong>Restricted workspace</strong>
          Every operation is authorized again by the API and database role
          registry.
        </p>
      </aside>

      <main id="main-content" className="admin-main" tabIndex={-1}>
        <section className="page-heading" aria-labelledby="page-title">
          <div>
            <p className="section-label">Platform overview</p>
            <h1 id="page-title">Control plane</h1>
            <p>
              Cross-tenant visibility and owner-level access for every SIMULA
              workspace.
            </p>
          </div>
          <dl className="session-facts">
            <div>
              <dt>Authorization</dt>
              <dd>Database verified</dd>
            </div>
            <div>
              <dt>Generated</dt>
              <dd>{dateTime.format(new Date(dashboard.generated_at))}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="metrics-heading" className="metric-section">
          <h2 className="sr-only" id="metrics-heading">
            Platform metrics
          </h2>
          <dl className="metric-rail">
            {metrics.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{number.format(value)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          className="inventory-section"
          aria-labelledby="inventory-heading"
          id="organization-inventory"
        >
          <div className="section-heading">
            <div>
              <p className="section-label">Tenant inventory</p>
              <h2 id="inventory-heading">Organizations</h2>
            </div>
            <p>{dashboard.organizations.length} visible</p>
          </div>

          {dashboard.organizations.length === 0 ? (
            <div className="empty-state" role="status">
              <h3>No organizations yet</h3>
              <p>
                New workspaces will appear here as soon as they are created.
              </p>
            </div>
          ) : (
            <div className="table-frame">
              <table>
                <caption className="sr-only">
                  All SIMULA organizations visible to the platform
                  superadministrator
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Organization</th>
                    <th scope="col">Status</th>
                    <th scope="col">Members</th>
                    <th scope="col">Projects</th>
                    <th scope="col">Runs</th>
                    <th scope="col">Reports</th>
                    <th scope="col">Updated</th>
                    <th scope="col">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.organizations.map((organization) => (
                    <tr key={organization.id}>
                      <th scope="row">
                        <span>{organization.name}</span>
                        <code>{organization.id}</code>
                      </th>
                      <td data-label="Status">
                        <span
                          className={`status status-${organization.status}`}
                        >
                          {organization.status}
                        </span>
                      </td>
                      <td data-label="Members">
                        {number.format(organization.members)}
                      </td>
                      <td data-label="Projects">
                        {number.format(organization.projects)}
                      </td>
                      <td data-label="Runs">
                        {number.format(organization.runs)}
                      </td>
                      <td data-label="Reports">
                        {number.format(organization.reports)}
                      </td>
                      <td data-label="Updated">
                        <time dateTime={organization.updated_at}>
                          {dateTime.format(new Date(organization.updated_at))}
                        </time>
                      </td>
                      <td className="row-action">
                        {workspaceOrigin ? (
                          <a
                            href={`${workspaceOrigin}/organizations/${organization.id}/dashboard`}
                          >
                            Open workspace
                          </a>
                        ) : (
                          <span title="NEXT_PUBLIC_SIMULA_WEB_URL is not configured">
                            Unavailable
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
