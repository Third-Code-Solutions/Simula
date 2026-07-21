"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { SignOutButton } from "@/app/sign-out-button";
import { WorkspaceSidebar } from "@/app/workspace-sidebar";
import {
  ApiProblem,
  type Organization,
  createOrganization,
  listOrganizations,
} from "@/lib/api";

import styles from "./organizations.module.css";

function problemMessage(error: unknown): string {
  if (error instanceof ApiProblem) {
    return error.correlationId
      ? `${error.message} Correlation: ${error.correlationId}.`
      : error.message;
  }
  return "SIMULA could not load organizations. Retry shortly.";
}

export function OrganizationsWorkspace() {
  const router = useRouter();
  const [items, setItems] = useState<Organization[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadInitialPage = useCallback(async (): Promise<void> => {
    try {
      const page = await listOrganizations();
      setItems(page.items);
      setNextCursor(page.next_cursor);
      setError(undefined);
    } catch (loadError) {
      setError(problemMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let stale = false;

    async function load(): Promise<void> {
      try {
        const page = await listOrganizations();
        if (stale) return;
        setItems(page.items);
        setNextCursor(page.next_cursor);
        setError(undefined);
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
  }, []);

  function retryOrganizations(): void {
    setError(undefined);
    setLoading(true);
    void loadInitialPage();
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoading(true);
    try {
      const page = await listOrganizations(nextCursor);
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.next_cursor);
      setError(undefined);
    } catch (loadError) {
      setError(problemMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const name = new FormData(formElement).get("name");
    if (typeof name !== "string") return;

    setError(undefined);
    setSubmitting(true);
    try {
      const organization = await createOrganization(name.trim());
      router.push(`/organizations/${organization.id}/dashboard`);
    } catch (createError) {
      setError(problemMessage(createError));
    } finally {
      setSubmitting(false);
    }
  }

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
      <WorkspaceSidebar current="organizations" />

      <section className={styles.hero} aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Workspace index</p>
          <h1 id="page-title">Your organizations</h1>
          <p className="lede">
            Choose a secured workspace or create one for a new decision
            rehearsal. Every project, run, and report remains tenant-scoped.
          </p>
        </div>
        <aside className={styles.securityNote} aria-label="Workspace security">
          <span className={styles.statusMark}>Secured session</span>
          <strong>API authorization + row-level isolation</strong>
          <p>
            Membership and role are verified again for every domain request.
          </p>
        </aside>
      </section>

      {error ? (
        <div className={styles.errorRow} role="alert">
          <p>{error}</p>
          <button onClick={retryOrganizations} type="button">
            Retry
          </button>
        </div>
      ) : null}

      <div className={styles.workspaceLayout}>
        <section
          className={styles.directory}
          aria-labelledby="organization-list-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">Directory</p>
              <h2 id="organization-list-title">Workspaces</h2>
            </div>
            <span className={styles.count}>
              {loading ? "Syncing" : `${items.length} available`}
            </span>
          </div>

          {loading && items.length === 0 ? (
            <div
              aria-label="Loading organizations"
              aria-live="polite"
              className={styles.skeletonList}
            >
              <span />
              <span />
              <span />
            </div>
          ) : null}

          {!loading && items.length === 0 && !error ? (
            <div className={styles.emptyState} role="status">
              <span className={styles.emptyIndex}>00</span>
              <h3>No workspace yet</h3>
              <p>
                Create an organization to unlock projects, immutable stimuli,
                simulations, reports, and audited collaboration.
              </p>
              <ol>
                <li>
                  <span>01</span> Name the workspace
                </li>
                <li>
                  <span>02</span> Frame the first project
                </li>
                <li>
                  <span>03</span> Run a bounded rehearsal
                </li>
              </ol>
            </div>
          ) : null}

          <ul className={styles.organizationList}>
            {items.map((organization, index) => (
              <li key={organization.id}>
                <Link href={`/organizations/${organization.id}/dashboard`}>
                  <span className={styles.organizationIndex}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.organizationIdentity}>
                    <strong>{organization.name}</strong>
                    <small>Open dashboard and recent activity</small>
                  </span>
                  <span className={styles.role}>{organization.role}</span>
                  <span aria-hidden="true" className={styles.arrow}>
                    ↗
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {nextCursor ? (
            <button
              className={styles.loadMore}
              disabled={loading}
              onClick={() => void loadMore()}
              type="button"
            >
              {loading ? "Loading…" : "Load more workspaces"}
            </button>
          ) : null}
        </section>

        <aside className={styles.createPanel} aria-labelledby="create-title">
          <p className="eyebrow">New workspace</p>
          <h2 id="create-title">Create organization</h2>
          <p>
            You become the owner. Team and feature controls stay owner-only.
          </p>
          <form className="form-stack" onSubmit={submit}>
            <label htmlFor="organization-name">Organization name</label>
            <input
              autoComplete="organization"
              id="organization-name"
              maxLength={80}
              minLength={2}
              name="name"
              placeholder="e.g. Northstar Strategy"
              required
            />
            <button disabled={submitting} type="submit">
              {submitting ? "Creating workspace…" : "Create workspace"}
            </button>
          </form>
          <p className={styles.formNote}>
            Experimental outputs estimate nobody. Use them to prepare human
            research, not replace it.
          </p>
        </aside>
      </div>
    </main>
  );
}
