"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  ApiProblem,
  type AudienceDisclosure,
  type OrganizationDashboard,
  type ProjectDetail,
  type Stimulus,
  appendStimulusVersion,
  createBehavioralDemoRun,
  createSimulationRun,
  createStimulus,
  getDemoAudience,
  getOrganizationDashboard,
  getProject,
  updateProject,
} from "@/lib/api";
import { SignOutButton } from "@/app/sign-out-button";
import { WorkspaceSidebar } from "@/app/workspace-sidebar";

import { BehavioralRunLauncher } from "./behavioral-run-launcher";
import { StimulusAssetsPanel } from "./stimulus-assets-panel";

function problemMessage(error: unknown): string {
  if (error instanceof ApiProblem) {
    return error.correlationId
      ? `${error.message} Correlation: ${error.correlationId}.`
      : error.message;
  }
  return "SIMULA could not complete that request. Retry shortly.";
}

function updateStimulusVersion(
  stimuli: Stimulus[],
  stimulusId: string,
  version: Stimulus["versions"][number],
): Stimulus[] {
  return stimuli.map((stimulus) =>
    stimulus.id === stimulusId
      ? { ...stimulus, versions: [...stimulus.versions, version] }
      : stimulus,
  );
}

export function ProjectWorkspace({
  behavioralDemoEnabled = false,
  privateAssetWorkflowEnabled = false,
  projectId,
  technicalVisualProfileEnabled = false,
}: Readonly<{
  behavioralDemoEnabled?: boolean;
  privateAssetWorkflowEnabled?: boolean;
  projectId: string;
  technicalVisualProfileEnabled?: boolean;
}>) {
  const router = useRouter();
  const runKeys = useRef(new Map<string, string>());
  const [project, setProject] = useState<ProjectDetail>();
  const [audience, setAudience] = useState<AudienceDisclosure>();
  const [dashboard, setDashboard] = useState<OrganizationDashboard>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [savingProject, setSavingProject] = useState(false);
  const [savingStimulus, setSavingStimulus] = useState(false);
  const [versioningStimulus, setVersioningStimulus] = useState<string>();
  const [startingRunVersion, setStartingRunVersion] = useState<string>();
  const [startingBehavioralRun, setStartingBehavioralRun] = useState<string>();

  async function refreshProject() {
    setLoading(true);
    try {
      setProject(await getProject(projectId));
      setError(undefined);
    } catch (loadError) {
      setError(problemMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let stale = false;

    async function loadInitialProject() {
      try {
        const loadedProject = await getProject(projectId);
        const [loadedAudience, loadedDashboard] = await Promise.all([
          getDemoAudience(),
          getOrganizationDashboard(loadedProject.organization_id),
        ]);
        if (!stale) {
          setProject(loadedProject);
          setAudience(loadedAudience);
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

    void loadInitialProject();
    return () => {
      stale = true;
    };
  }, [projectId]);

  async function saveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const name = form.get("name");
    const objective = form.get("objective");
    if (typeof name !== "string" || typeof objective !== "string") {
      return;
    }
    setError(undefined);
    setSavingProject(true);
    try {
      const updated = await updateProject(project.id, project.version, {
        name,
        objective,
      });
      setProject((current: ProjectDetail | undefined) =>
        current ? { ...current, ...updated } : current,
      );
    } catch (saveError) {
      setError(problemMessage(saveError));
      if (saveError instanceof ApiProblem && saveError.status === 409) {
        await refreshProject();
      }
    } finally {
      setSavingProject(false);
    }
  }

  async function addStimulus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) {
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = form.get("name");
    const content = form.get("content");
    if (typeof name !== "string" || typeof content !== "string") {
      return;
    }
    setError(undefined);
    setSavingStimulus(true);
    try {
      const stimulus = await createStimulus(project.id, { content, name });
      setProject((current: ProjectDetail | undefined) =>
        current
          ? { ...current, stimuli: [...current.stimuli, stimulus] }
          : current,
      );
      formElement.reset();
    } catch (createError) {
      setError(problemMessage(createError));
    } finally {
      setSavingStimulus(false);
    }
  }

  async function addVersion(
    event: React.FormEvent<HTMLFormElement>,
    stimulusId: string,
  ) {
    event.preventDefault();
    if (!project) {
      return;
    }
    const formElement = event.currentTarget;
    const content = new FormData(formElement).get("content");
    if (typeof content !== "string") {
      return;
    }
    setError(undefined);
    setVersioningStimulus(stimulusId);
    try {
      const version = await appendStimulusVersion(stimulusId, content);
      setProject((current: ProjectDetail | undefined) =>
        current
          ? {
              ...current,
              stimuli: updateStimulusVersion(
                current.stimuli,
                stimulusId,
                version,
              ),
            }
          : current,
      );
      formElement.reset();
    } catch (appendError) {
      setError(problemMessage(appendError));
    } finally {
      setVersioningStimulus(undefined);
    }
  }

  async function startRun(stimulusVersionId: string) {
    if (!project || !audience || !dashboard?.permissions.can_create_runs) {
      return;
    }
    const idempotencyKey =
      runKeys.current.get(stimulusVersionId) ?? crypto.randomUUID();
    runKeys.current.set(stimulusVersionId, idempotencyKey);
    setError(undefined);
    setStartingRunVersion(stimulusVersionId);
    try {
      const run = await createSimulationRun(
        project.id,
        stimulusVersionId,
        idempotencyKey,
      );
      runKeys.current.delete(stimulusVersionId);
      router.push(`/runs/${run.id}`);
    } catch (runError) {
      setError(problemMessage(runError));
    } finally {
      setStartingRunVersion(undefined);
    }
  }

  async function startBehavioralRun(
    stimulusVersionId: string,
    variantKey: string,
  ) {
    if (
      !behavioralDemoEnabled ||
      !project ||
      !audience ||
      !dashboard?.permissions.can_create_runs
    ) {
      return;
    }
    const runKey = `${stimulusVersionId}:${variantKey}`;
    const idempotencyKey = runKeys.current.get(runKey) ?? crypto.randomUUID();
    runKeys.current.set(runKey, idempotencyKey);
    setError(undefined);
    setStartingBehavioralRun(runKey);
    try {
      const run = await createBehavioralDemoRun(
        project.id,
        stimulusVersionId,
        variantKey,
        idempotencyKey,
      );
      runKeys.current.delete(runKey);
      router.push(`/runs/${run.id}`);
    } catch (runError) {
      setError(problemMessage(runError));
    } finally {
      setStartingBehavioralRun(undefined);
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
      <WorkspaceSidebar
        current="project"
        organizationId={project?.organization_id}
        projectId={projectId}
      />
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/organizations">Organizations</Link>
        <span aria-hidden="true"> / </span>
        {project ? (
          <Link href={`/organizations/${project.organization_id}/projects`}>
            Projects
          </Link>
        ) : null}
        <span aria-hidden="true"> / </span>
        <span>Project</span>
      </nav>
      {loading ? <p aria-live="polite">Loading project…</p> : null}
      {error ? (
        <p className="problem" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && error && !project ? (
        <section className="panel" aria-labelledby="project-unavailable-title">
          <p className="eyebrow">Access boundary</p>
          <h1 id="project-unavailable-title">Project unavailable</h1>
          <p>
            This project is unavailable to the current account. Return to your
            secured workspace directory.
          </p>
          <Link className="primary-link" href="/organizations">
            Back to organizations
          </Link>
        </section>
      ) : null}
      {project && audience && dashboard ? (
        <>
          <section className="workspace-grid" aria-labelledby="page-title">
            <div>
              <p className="eyebrow">
                Campaign message · Philippines · English
              </p>
              <h1 id="page-title">{project.name}</h1>
              <p className="lede">
                Version {project.version}. Text is confidential within this
                workspace.
              </p>
              <Link
                className="primary-link"
                href={`/projects/${project.id}/methodology`}
              >
                Open methodology lab
              </Link>
              <Link
                className="button-ghost"
                href={`/projects/${project.id}/evidence`}
              >
                Open evidence lab
              </Link>
              <Link
                className="button-ghost"
                href={`/projects/${project.id}/campaign-lab`}
              >
                Open Campaign Simulation Lab
              </Link>
            </div>
            {dashboard.permissions.can_create_projects ? (
              <form
                className="panel form-stack"
                id="settings"
                onSubmit={saveProject}
              >
                <h2>Project details</h2>
                <label htmlFor="edit-project-name">Project name</label>
                <input
                  defaultValue={project.name}
                  id="edit-project-name"
                  maxLength={80}
                  minLength={2}
                  name="name"
                  required
                />
                <label htmlFor="edit-project-objective">Objective</label>
                <textarea
                  defaultValue={project.objective}
                  id="edit-project-objective"
                  maxLength={1000}
                  name="objective"
                  required
                  rows={4}
                />
                <button disabled={savingProject} type="submit">
                  {savingProject ? "Saving…" : "Save project"}
                </button>
              </form>
            ) : (
              <div className="panel">
                <h2>Project details</h2>
                <p>{project.objective}</p>
                <p className="field-note">Viewer role · read-only</p>
              </div>
            )}
          </section>
          <section
            className="panel"
            aria-labelledby="audience-disclosure-title"
          >
            <p className="eyebrow">Required pre-run disclosure</p>
            <h2 id="audience-disclosure-title">{audience.name}</h2>
            <p>
              <strong>{audience.kind}</strong> · version {audience.version} ·{" "}
              {audience.non_representative
                ? "non-representative"
                : "unavailable"}
            </p>
            {audience.limitations.map((limitation) => (
              <p className="field-note" key={limitation}>
                {limitation}
              </p>
            ))}
            <p className="field-note">
              Purpose: {audience.purpose} Prohibited uses:{" "}
              {audience.prohibited_uses.join(", ")}.
            </p>
            <p className="resource-meta">
              Fixture checksum: <code>{audience.checksum_sha256}</code>
            </p>
          </section>
          <section className="content-section" aria-labelledby="stimuli-title">
            <div>
              <p className="eyebrow">Immutable source material</p>
              <h2 id="stimuli-title">Text stimuli</h2>
              <p className="lede">
                Saving a revision creates a new version. Prior versions and
                their checksums remain unchanged.
              </p>
            </div>
            {dashboard.permissions.can_create_projects ? (
              <form className="panel form-stack" onSubmit={addStimulus}>
                <h3>Add text stimulus</h3>
                <label htmlFor="stimulus-name">Stimulus name</label>
                <input
                  id="stimulus-name"
                  maxLength={80}
                  minLength={2}
                  name="name"
                  required
                />
                <label htmlFor="stimulus-content">Text</label>
                <textarea
                  id="stimulus-content"
                  maxLength={5000}
                  name="content"
                  required
                  rows={7}
                />
                <p className="field-note">
                  Maximum 5,000 characters. Do not enter personal or sensitive
                  data.
                </p>
                <button disabled={savingStimulus} type="submit">
                  {savingStimulus ? "Adding…" : "Add immutable stimulus"}
                </button>
              </form>
            ) : (
              <div className="panel">
                <h3>Read-only stimuli</h3>
                <p className="field-note">
                  Viewer role can inspect immutable versions only.
                </p>
              </div>
            )}
          </section>
          {project.stimuli.length === 0 ? (
            <p className="empty-state">
              No text stimuli yet. Add one to create its first immutable
              version.
            </p>
          ) : null}
          <div className="stimulus-grid">
            {project.stimuli.map((stimulus: Stimulus) => (
              <article className="panel stimulus-card" key={stimulus.id}>
                <h3>{stimulus.name}</h3>
                <p className="resource-meta">
                  {stimulus.versions.length} immutable version(s)
                </p>
                <ol className="version-list">
                  {stimulus.versions.map(
                    (version: Stimulus["versions"][number]) => (
                      <li key={version.id}>
                        <div className="version-heading">
                          <strong>Version {version.version}</strong>
                          <code title="SHA-256 checksum">
                            {version.content_sha256}
                          </code>
                        </div>
                        <p>{version.content}</p>
                        {dashboard.permissions.can_create_runs ? (
                          <>
                            <div className="run-launch">
                              <div>
                                <strong>Pipeline integrity demo</strong>
                                <p className="field-note">
                                  Fixed authored output. Tests the durable
                                  pipeline; it estimates nobody.
                                </p>
                              </div>
                              <button
                                disabled={
                                  !audience || startingRunVersion === version.id
                                }
                                onClick={() => void startRun(version.id)}
                                type="button"
                              >
                                {startingRunVersion === version.id
                                  ? "Starting run…"
                                  : `Run pipeline demo ${version.version}`}
                              </button>
                            </div>
                            {behavioralDemoEnabled ? (
                              <BehavioralRunLauncher
                                disabled={!audience}
                                isStarting={
                                  startingBehavioralRun?.startsWith(
                                    `${version.id}:`,
                                  ) ?? false
                                }
                                onStart={(variantKey) =>
                                  void startBehavioralRun(
                                    version.id,
                                    variantKey,
                                  )
                                }
                                version={version.version}
                              />
                            ) : null}
                          </>
                        ) : null}
                      </li>
                    ),
                  )}
                </ol>
                {privateAssetWorkflowEnabled ? (
                  <StimulusAssetsPanel
                    canMutate={dashboard.permissions.can_create_projects}
                    stimulusId={stimulus.id}
                    stimulusName={stimulus.name}
                    visualProfileEnabled={technicalVisualProfileEnabled}
                  />
                ) : null}
                {dashboard.permissions.can_create_projects ? (
                  <form
                    className="form-stack"
                    onSubmit={(event) => void addVersion(event, stimulus.id)}
                  >
                    <label htmlFor={`version-${stimulus.id}`}>
                      New version text
                    </label>
                    <textarea
                      id={`version-${stimulus.id}`}
                      maxLength={5000}
                      name="content"
                      required
                      rows={5}
                    />
                    <button
                      disabled={versioningStimulus === stimulus.id}
                      type="submit"
                    >
                      {versioningStimulus === stimulus.id
                        ? "Saving…"
                        : "Save new immutable version"}
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}
