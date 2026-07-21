"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ApiProblem,
  type OrganizationDashboard,
  type Project,
  createProject,
  getOrganizationDashboard,
  listProjects,
} from "@/lib/api";
import { SignOutButton } from "@/app/sign-out-button";
import { WorkspaceSidebar } from "@/app/workspace-sidebar";

function problemMessage(error: unknown): string {
  if (error instanceof ApiProblem) {
    return error.correlationId
      ? `${error.message} Correlation: ${error.correlationId}.`
      : error.message;
  }
  return "SIMULA could not load projects. Retry shortly.";
}

export function ProjectsWorkspace({
  organizationId,
}: Readonly<{ organizationId: string }>) {
  const router = useRouter();
  const [items, setItems] = useState<Project[]>([]);
  const [dashboard, setDashboard] = useState<OrganizationDashboard>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let stale = false;

    async function loadInitialPage() {
      try {
        const [page, loadedDashboard] = await Promise.all([
          listProjects(organizationId),
          getOrganizationDashboard(organizationId),
        ]);
        if (!stale) {
          setItems(page.items);
          setNextCursor(page.next_cursor);
          setDashboard(loadedDashboard);
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
  }, [organizationId]);

  async function loadMore() {
    if (!nextCursor) {
      return;
    }
    setLoading(true);
    try {
      const page = await listProjects(organizationId, nextCursor);
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
    const form = new FormData(event.currentTarget);
    const name = form.get("name");
    const objective = form.get("objective");
    if (typeof name !== "string" || typeof objective !== "string") {
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      const project = await createProject(organizationId, {
        category: "campaign_message",
        language: "en",
        market: "philippines",
        name,
        objective,
      });
      router.push(`/projects/${project.id}`);
    } catch (createError) {
      setError(problemMessage(createError));
    } finally {
      setSubmitting(false);
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
      <WorkspaceSidebar current="projects" organizationId={organizationId} />
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/organizations">Organizations</Link>
        <span aria-hidden="true"> / </span>
        <span>Projects</span>
      </nav>
      <section className="workspace-grid" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Organization workspace</p>
          <h1 id="page-title">Projects</h1>
          <p className="lede">
            This Phase 2 slice supports English campaign-message projects for
            the Philippines only.
          </p>
        </div>
        {dashboard?.permissions.can_create_projects ? (
          <form className="panel form-stack" id="new-project" onSubmit={submit}>
            <h2>Create project</h2>
            <label htmlFor="project-name">Project name</label>
            <input
              id="project-name"
              maxLength={80}
              minLength={2}
              name="name"
              required
            />
            <label htmlFor="project-objective">Objective</label>
            <textarea
              id="project-objective"
              maxLength={1000}
              name="objective"
              required
              rows={4}
            />
            <p className="field-note">
              Market: Philippines · Language: English · Type: Campaign message
            </p>
            <button disabled={submitting} type="submit">
              {submitting ? "Creating…" : "Create project"}
            </button>
          </form>
        ) : dashboard ? (
          <div className="panel">
            <h2>Read-only access</h2>
            <p className="field-note">
              Viewer role can inspect projects but cannot create or change them.
            </p>
          </div>
        ) : null}
      </section>
      {error ? (
        <p className="problem" role="alert">
          {error}
        </p>
      ) : null}
      <section className="list-section" aria-labelledby="project-list-title">
        <div className="section-heading">
          <h2 id="project-list-title">Projects</h2>
          {loading ? <p aria-live="polite">Loading projects…</p> : null}
        </div>
        {!loading && items.length === 0 ? (
          <p className="empty-state">
            No projects yet. Create the first project for this organization.
          </p>
        ) : null}
        <ul className="resource-list">
          {items.map((project) => (
            <li key={project.id}>
              <Link href={`/projects/${project.id}`}>
                <span>{project.name}</span>
                <span className="resource-meta">Version {project.version}</span>
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
            Load more projects
          </button>
        ) : null}
      </section>
    </main>
  );
}
