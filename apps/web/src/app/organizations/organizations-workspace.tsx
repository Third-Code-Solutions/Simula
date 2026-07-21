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
  createProject,
  createSimulationRun,
  createStimulus,
  listOrganizations,
} from "@/lib/api";

import styles from "./organizations.module.css";

const GUIDED_PROJECT = {
  category: "campaign_message" as const,
  language: "en" as const,
  market: "philippines" as const,
  name: "First bounded rehearsal",
  objective:
    "Rehearse a fictional community update before planning appropriately recruited human research.",
};

const GUIDED_STIMULUS = {
  name: "Fictional community update",
  content:
    "A fictional neighborhood program is considering a weekly email that summarizes upcoming activities, explains schedule changes, and gives residents one clear way to ask questions.",
};

type GuidedSetup = Readonly<{
  organizationId?: string;
  projectId?: string;
  stimulusVersionId?: string;
}>;

type SetupStage = "idle" | "project" | "run" | "stimulus" | "workspace";

const SETUP_STAGE_LABEL: Record<Exclude<SetupStage, "idle">, string> = {
  project: "02 / 03 — Framing the first project…",
  run: "03 / 03 — Starting the bounded rehearsal…",
  stimulus: "02 / 03 — Saving fictional demo material…",
  workspace: "01 / 03 — Naming the workspace…",
};

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
  const [guidedSetup, setGuidedSetup] = useState<GuidedSetup>({});
  const [setupStage, setSetupStage] = useState<SetupStage>("idle");
  const [guidedRunKey] = useState(() => crypto.randomUUID());

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

    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const intent =
      submitter instanceof HTMLButtonElement ? submitter.value : "guided";

    setError(undefined);
    setSubmitting(true);
    try {
      if (intent === "empty") {
        const organization = await createOrganization(name.trim());
        router.push(`/organizations/${organization.id}/dashboard`);
        return;
      }

      let progress = guidedSetup;
      if (!progress.organizationId) {
        setSetupStage("workspace");
        const organization = await createOrganization(name.trim());
        progress = { organizationId: organization.id };
        setGuidedSetup(progress);
      }

      if (!progress.projectId) {
        setSetupStage("project");
        const organizationId = progress.organizationId;
        if (!organizationId) {
          throw new Error("Guided setup lost its organization context.");
        }
        const project = await createProject(organizationId, GUIDED_PROJECT);
        progress = { ...progress, projectId: project.id };
        setGuidedSetup(progress);
      }

      if (!progress.stimulusVersionId) {
        setSetupStage("stimulus");
        const projectId = progress.projectId;
        if (!projectId) {
          throw new Error("Guided setup lost its project context.");
        }
        const stimulus = await createStimulus(projectId, GUIDED_STIMULUS);
        const versionId = stimulus.versions[0]?.id;
        if (!versionId) {
          throw new Error("Created stimulus has no immutable version.");
        }
        progress = { ...progress, stimulusVersionId: versionId };
        setGuidedSetup(progress);
      }

      setSetupStage("run");
      const projectId = progress.projectId;
      const stimulusVersionId = progress.stimulusVersionId;
      if (!projectId || !stimulusVersionId) {
        throw new Error("Guided setup is missing its saved rehearsal data.");
      }
      const run = await createSimulationRun(
        projectId,
        stimulusVersionId,
        guidedRunKey,
      );
      router.push(`/runs/${run.id}`);
    } catch (createError) {
      setError(problemMessage(createError));
    } finally {
      setSubmitting(false);
      setSetupStage("idle");
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
            <div
              aria-labelledby="empty-workspace-title"
              className={styles.emptyState}
            >
              <span className={styles.emptyIndex}>00</span>
              <h3 id="empty-workspace-title">No workspace yet</h3>
              <p>
                Create an organization to unlock projects, immutable stimuli,
                simulations, reports, and audited collaboration.
              </p>
              <ol>
                <li>
                  <a href="#guided-rehearsal">
                    <span>01</span> Name the workspace
                  </a>
                </li>
                <li>
                  <a href="#guided-rehearsal">
                    <span>02</span> Frame the first project
                  </a>
                </li>
                <li>
                  <a href="#guided-rehearsal">
                    <span>03</span> Run a bounded rehearsal
                  </a>
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

        <aside
          className={styles.createPanel}
          aria-labelledby="create-title"
          id="guided-rehearsal"
        >
          <p className="eyebrow">Guided setup · 01—03</p>
          <h2 id="create-title">Start a workspace</h2>
          <p>
            Save an empty workspace, or create a complete rehearsal with real
            tenant-scoped records and fictional, non-personal demo content.
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
              readOnly={Boolean(guidedSetup.organizationId)}
              required
            />
            {submitting && setupStage !== "idle" ? (
              <p aria-live="polite" className={styles.setupStatus}>
                {SETUP_STAGE_LABEL[setupStage]}
              </p>
            ) : null}
            <div className={styles.formActions}>
              <button
                disabled={submitting}
                name="intent"
                type="submit"
                value="guided"
              >
                {submitting
                  ? "Preparing rehearsal…"
                  : guidedSetup.organizationId
                    ? "Resume guided rehearsal"
                    : "Create guided rehearsal"}
              </button>
              {!guidedSetup.organizationId ? (
                <button
                  className={styles.secondaryAction}
                  disabled={submitting}
                  name="intent"
                  type="submit"
                  value="empty"
                >
                  Create empty workspace
                </button>
              ) : null}
            </div>
          </form>
          <p className={styles.formNote}>
            Guided setup persists an organization, project, immutable stimulus,
            and deterministic mock run. Outputs estimate nobody. Use them to
            prepare human research, not replace it.
          </p>
        </aside>
      </div>
    </main>
  );
}
