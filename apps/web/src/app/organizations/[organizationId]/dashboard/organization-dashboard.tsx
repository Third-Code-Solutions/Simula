"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { SignOutButton } from "@/app/sign-out-button";
import { WorkspaceSidebar } from "@/app/workspace-sidebar";
import {
  ApiProblem,
  type OrganizationDashboard,
  type ProductRecord,
  createOrganizationInvitation,
  getOrganizationAudit,
  getOrganizationDashboard,
  listOrganizationFeatureFlags,
  listOrganizationInvitations,
  setOrganizationFeatureFlag,
} from "@/lib/api";

import styles from "./dashboard.module.css";

function problemMessage(error: unknown): string {
  if (error instanceof ApiProblem) {
    return error.correlationId
      ? `${error.message} Correlation: ${error.correlationId}.`
      : error.message;
  }
  return "SIMULA could not load this dashboard. Retry shortly.";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function bool(value: unknown): boolean {
  return value === true;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

type DashboardMetricKey =
  | "projects"
  | "audiences"
  | "runs"
  | "active_runs"
  | "succeeded_runs"
  | "failed_runs"
  | "reports"
  | "feedback_records";

const metricLabels: ReadonlyArray<readonly [DashboardMetricKey, string]> = [
  ["projects", "Projects"],
  ["audiences", "Audiences"],
  ["runs", "Total runs"],
  ["active_runs", "Active runs"],
  ["succeeded_runs", "Succeeded"],
  ["failed_runs", "Failed"],
  ["reports", "Reports"],
  ["feedback_records", "Feedback"],
];

export function OrganizationDashboardWorkspace({
  organizationId,
}: Readonly<{ organizationId: string }>) {
  const [dashboard, setDashboard] = useState<OrganizationDashboard>();
  const [invitations, setInvitations] = useState<ProductRecord[]>([]);
  const [flags, setFlags] = useState<ProductRecord[]>([]);
  const [audit, setAudit] = useState<ProductRecord[]>([]);
  const [invitationToken, setInvitationToken] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();

  const loadOwnerData = useCallback(async (): Promise<void> => {
    const [loadedInvitations, loadedFlags, loadedAudit] = await Promise.all([
      listOrganizationInvitations(organizationId),
      listOrganizationFeatureFlags(organizationId),
      getOrganizationAudit(organizationId),
    ]);
    setInvitations(loadedInvitations.items);
    setFlags(loadedFlags.items);
    setAudit(loadedAudit.items);
  }, [organizationId]);

  useEffect(() => {
    let stale = false;

    async function load(): Promise<void> {
      try {
        const loadedDashboard = await getOrganizationDashboard(organizationId);
        if (stale) return;
        setDashboard(loadedDashboard);
        if (loadedDashboard.permissions.can_manage_settings) {
          await loadOwnerData();
        }
        if (!stale) setError(undefined);
      } catch (loadError) {
        if (!stale) setError(problemMessage(loadError));
      } finally {
        if (!stale) setLoading(false);
      }
    }

    void load();
    return () => {
      stale = true;
    };
  }, [loadOwnerData, organizationId]);

  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = form.get("email");
    const role = form.get("role");
    if (typeof email !== "string" || (role !== "editor" && role !== "viewer")) {
      return;
    }
    setBusy("invitation");
    setError(undefined);
    try {
      const response = await createOrganizationInvitation(organizationId, {
        email,
        role,
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });
      setInvitationToken(text(response.data.invitation_token));
      await loadOwnerData();
      formElement.reset();
    } catch (inviteError) {
      setError(problemMessage(inviteError));
    } finally {
      setBusy(undefined);
    }
  }

  async function saveFlag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const flagKey = form.get("flagKey");
    const reason = form.get("reason");
    if (typeof flagKey !== "string" || typeof reason !== "string") return;
    setBusy("flag");
    setError(undefined);
    try {
      await setOrganizationFeatureFlag(organizationId, flagKey, {
        enabled: form.get("enabled") === "on",
        reason,
      });
      await loadOwnerData();
      formElement.reset();
    } catch (flagError) {
      setError(problemMessage(flagError));
    } finally {
      setBusy(undefined);
    }
  }

  async function toggleFlag(flag: ProductRecord): Promise<void> {
    const flagKey = text(flag.flag_key);
    if (!flagKey) return;
    setBusy(`flag:${flagKey}`);
    setError(undefined);
    try {
      await setOrganizationFeatureFlag(organizationId, flagKey, {
        enabled: !bool(flag.enabled),
        reason: "Changed by organization owner from secured dashboard.",
      });
      await loadOwnerData();
    } catch (flagError) {
      setError(problemMessage(flagError));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <main className="workspace-main" id="main-content" tabIndex={-1}>
      <header className="workspace-header">
        <Link className="wordmark" href="/organizations">
          SIMULA
        </Link>
        <SignOutButton />
      </header>
      <WorkspaceSidebar current="dashboard" organizationId={organizationId} />
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/organizations">Organizations</Link>
        <span aria-hidden="true"> / </span>
        <span>Dashboard</span>
      </nav>

      {loading ? <p aria-live="polite">Loading secured dashboard…</p> : null}
      {error ? (
        <p className="problem" role="alert">
          {error}
        </p>
      ) : null}

      {dashboard ? (
        <>
          <section className={styles.hero} aria-labelledby="dashboard-title">
            <div>
              <p className="eyebrow">Organization dashboard</p>
              <h1 id="dashboard-title">{dashboard.organization_name}</h1>
              <p className="lede">
                Live workspace state from membership-scoped Postgres reads.
                Experimental outputs remain decision-rehearsal evidence only.
              </p>
            </div>
            <div className={styles.accessCard}>
              <span className={styles.role}>{dashboard.role}</span>
              <strong>RBAC active</strong>
              <p>
                {dashboard.permissions.can_manage_team
                  ? "Owner: workspace, team, and controls."
                  : dashboard.permissions.can_create_projects
                    ? "Editor: create and run; no owner controls."
                    : "Viewer: read-only workspace access."}
              </p>
            </div>
          </section>

          <section className={styles.metrics} aria-label="Workspace metrics">
            {metricLabels.map(([key, label]) => (
              <article key={key}>
                <span>{label}</span>
                <strong>{dashboard.metrics[key]}</strong>
              </article>
            ))}
          </section>

          <section className={styles.quickActions} aria-label="Quick actions">
            <Link href={`/organizations/${organizationId}/projects`}>
              Browse projects
            </Link>
            {dashboard.permissions.can_create_projects ? (
              <Link
                href={`/organizations/${organizationId}/projects#new-project`}
              >
                Create project
              </Link>
            ) : null}
            <span>Snapshot {formatDate(dashboard.generated_at)}</span>
          </section>

          <div className={styles.activityGrid}>
            <section className={styles.panel} aria-labelledby="recent-projects">
              <div className={styles.sectionHeading}>
                <div>
                  <p className="eyebrow">Workspace</p>
                  <h2 id="recent-projects">Recent projects</h2>
                </div>
                <Link href={`/organizations/${organizationId}/projects`}>
                  View all
                </Link>
              </div>
              {dashboard.recent_projects.length ? (
                <ul className={styles.activityList}>
                  {dashboard.recent_projects.map((project) => (
                    <li key={project.id}>
                      <Link href={`/projects/${project.id}`}>
                        <strong>{project.name}</strong>
                        <span>{project.objective}</span>
                        <small>
                          v{project.version} · {formatDate(project.updated_at)}
                        </small>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No projects yet.</p>
              )}
            </section>

            <section className={styles.panel} aria-labelledby="recent-runs">
              <div className={styles.sectionHeading}>
                <div>
                  <p className="eyebrow">Execution</p>
                  <h2 id="recent-runs">Recent runs</h2>
                </div>
              </div>
              {dashboard.recent_runs.length ? (
                <ul className={styles.activityList}>
                  {dashboard.recent_runs.map((run) => (
                    <li key={run.id}>
                      <Link href={`/runs/${run.id}`}>
                        <strong>{run.project_name}</strong>
                        <span className={styles.state}>
                          {run.state.replaceAll("_", " ")}
                        </span>
                        <small>{formatDate(run.created_at)}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No runs yet.</p>
              )}
            </section>

            <section className={styles.panel} aria-labelledby="recent-reports">
              <div className={styles.sectionHeading}>
                <div>
                  <p className="eyebrow">Artifacts</p>
                  <h2 id="recent-reports">Recent reports</h2>
                </div>
              </div>
              {dashboard.recent_reports.length ? (
                <ul className={styles.activityList}>
                  {dashboard.recent_reports.map((report) => (
                    <li key={report.id}>
                      <Link href={`/runs/${report.run_id}`}>
                        <strong>{report.project_name}</strong>
                        <span>Methodology report</span>
                        <small>{formatDate(report.created_at)}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No reports yet.</p>
              )}
            </section>
          </div>

          {dashboard.permissions.can_manage_team ? (
            <section
              className={styles.ownerArea}
              aria-labelledby="owner-controls"
            >
              <div className={styles.ownerHeading}>
                <p className="eyebrow">Owner-only controls</p>
                <h2 id="owner-controls">Team, flags, and audit</h2>
                <p>
                  API commands and database policies re-check owner role. Hidden
                  UI is not the security boundary.
                </p>
              </div>
              <div className={styles.ownerGrid}>
                <section className={styles.panel} aria-labelledby="team-title">
                  <h3 id="team-title">Invite team member</h3>
                  <form className="form-stack" onSubmit={inviteMember}>
                    <label htmlFor="invite-email">Email</label>
                    <input
                      id="invite-email"
                      name="email"
                      required
                      type="email"
                    />
                    <label htmlFor="invite-role">Role</label>
                    <select defaultValue="viewer" id="invite-role" name="role">
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button disabled={busy === "invitation"} type="submit">
                      {busy === "invitation"
                        ? "Creating…"
                        : "Create 7-day invitation"}
                    </button>
                  </form>
                  {invitationToken ? (
                    <div className={styles.token} role="status">
                      <strong>One-time invitation token</strong>
                      <code>{invitationToken}</code>
                      <span>Share through an approved private channel.</span>
                    </div>
                  ) : null}
                  <ul className={styles.compactList}>
                    {invitations.map((invitation) => (
                      <li key={text(invitation.id)}>
                        <strong>{text(invitation.email)}</strong>
                        <span>
                          {text(invitation.role)} · {text(invitation.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className={styles.panel} aria-labelledby="flags-title">
                  <h3 id="flags-title">Feature flags</h3>
                  <form className="form-stack" onSubmit={saveFlag}>
                    <label htmlFor="flag-key">Flag key</label>
                    <input
                      id="flag-key"
                      name="flagKey"
                      pattern="[a-z][a-z0-9_.]{0,63}"
                      required
                    />
                    <label htmlFor="flag-reason">Change reason</label>
                    <input
                      id="flag-reason"
                      maxLength={500}
                      name="reason"
                      required
                    />
                    <label className={styles.checkbox}>
                      <input name="enabled" type="checkbox" /> Enabled
                    </label>
                    <button disabled={busy === "flag"} type="submit">
                      {busy === "flag" ? "Saving…" : "Save flag"}
                    </button>
                  </form>
                  <ul className={styles.compactList}>
                    {flags.map((flag) => (
                      <li key={text(flag.id)}>
                        <div>
                          <strong>{text(flag.flag_key)}</strong>
                          <span>
                            {bool(flag.enabled) ? "enabled" : "disabled"} · v
                            {text(flag.version)}
                          </span>
                        </div>
                        <button
                          disabled={busy === `flag:${text(flag.flag_key)}`}
                          onClick={() => void toggleFlag(flag)}
                          type="button"
                        >
                          {bool(flag.enabled) ? "Disable" : "Enable"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className={styles.panel} aria-labelledby="audit-title">
                  <h3 id="audit-title">Recent audit events</h3>
                  <ol className={styles.auditList}>
                    {audit.slice(0, 12).map((event) => (
                      <li key={text(event.id)}>
                        <strong>{text(event.action)}</strong>
                        <span>
                          {text(event.outcome)} · {text(event.source_service)}
                        </span>
                        <small>{formatDate(text(event.created_at))}</small>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
