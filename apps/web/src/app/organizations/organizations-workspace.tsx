"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ApiProblem,
  type Organization,
  createOrganization,
  listOrganizations,
} from "@/lib/api";
import { SignOutButton } from "@/app/sign-out-button";
import { WorkspaceSidebar } from "@/app/workspace-sidebar";

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

  useEffect(() => {
    let stale = false;

    async function loadInitialPage() {
      try {
        const page = await listOrganizations();
        if (!stale) {
          setItems(page.items);
          setNextCursor(page.next_cursor);
          setError(undefined);
        }
      } catch (loadError) {
        if (!stale) {
          setError(problemMessage(loadError));
        }
      } finally {
        if (!stale) {
          setLoading(false);
        }
      }
    }

    void loadInitialPage();
    return () => {
      stale = true;
    };
  }, []);

  async function loadMore() {
    if (!nextCursor) {
      return;
    }
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
    const name = new FormData(event.currentTarget).get("name");
    if (typeof name !== "string") {
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      const organization = await createOrganization(name);
      router.push(`/organizations/${organization.id}/projects`);
    } catch (createError) {
      setError(problemMessage(createError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="workspace-main" id="main-content">
      <header className="workspace-header">
        <Link className="wordmark" href="/organizations">
          SIMULA
        </Link>
        <SignOutButton />
      </header>
      <WorkspaceSidebar current="organizations" />
      <section className="workspace-grid" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="page-title">Organizations</h1>
          <p className="lede">
            Create a local workspace to author a campaign-message project.
            Access is enforced by the domain API, not by this screen.
          </p>
        </div>
        <form className="panel form-stack" onSubmit={submit}>
          <h2>Create organization</h2>
          <label htmlFor="organization-name">Organization name</label>
          <input
            id="organization-name"
            maxLength={80}
            minLength={2}
            name="name"
            required
          />
          <button disabled={submitting} type="submit">
            {submitting ? "Creating…" : "Create organization"}
          </button>
        </form>
      </section>
      {error ? (
        <p className="problem" role="alert">
          {error}
        </p>
      ) : null}
      <section
        className="list-section"
        aria-labelledby="organization-list-title"
      >
        <div className="section-heading">
          <h2 id="organization-list-title">Your organizations</h2>
          {loading ? <p aria-live="polite">Loading organizations…</p> : null}
        </div>
        {!loading && items.length === 0 ? (
          <p className="empty-state">
            No organizations yet. Create your first local workspace.
          </p>
        ) : null}
        <ul className="resource-list">
          {items.map((organization) => (
            <li key={organization.id}>
              <Link href={`/organizations/${organization.id}/projects`}>
                <span>{organization.name}</span>
                <span className="resource-meta">{organization.role}</span>
              </Link>
            </li>
          ))}
        </ul>
        {nextCursor ? (
          <button
            disabled={loading}
            onClick={() => void loadMore()}
            type="button"
          >
            Load more organizations
          </button>
        ) : null}
      </section>
    </main>
  );
}
