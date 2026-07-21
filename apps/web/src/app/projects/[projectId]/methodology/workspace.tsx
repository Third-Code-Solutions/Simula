"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SignOutButton } from "@/app/sign-out-button";
import { WorkspaceSidebar } from "@/app/workspace-sidebar";
import {
  ApiProblem,
  type MethodologyRegistry,
  type OrganizationDashboard,
  type ProductRecord,
  type ProjectDetail,
  createAudienceDefinition,
  createMethodologyPreview,
  createSimulationConfiguration,
  createVariantGroup,
  getMethodologyRegistry,
  getOrganizationAdminSummary,
  getOrganizationAudit,
  getOrganizationDashboard,
  getProject,
  listAudienceDefinitions,
  listSimulationConfigurations,
} from "@/lib/api";

function message(error: unknown): string {
  if (error instanceof ApiProblem) {
    return error.correlationId
      ? `${error.message} Correlation: ${error.correlationId}.`
      : error.message;
  }
  return "SIMULA could not complete that request.";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function records(value: unknown): ProductRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is ProductRecord => !!item && typeof item === "object",
      )
    : [];
}

function record(value: unknown): ProductRecord {
  return value && typeof value === "object" ? (value as ProductRecord) : {};
}

function latestVersions(project: ProjectDetail): Array<{
  id: string;
  label: string;
}> {
  return project.stimuli.flatMap((stimulus) => {
    const version = stimulus.versions.at(-1);
    return version
      ? [{ id: version.id, label: `${stimulus.name} · v${version.version}` }]
      : [];
  });
}

export function MethodologyWorkspace({
  projectId,
}: Readonly<{ projectId: string }>) {
  const [project, setProject] = useState<ProjectDetail>();
  const [dashboard, setDashboard] = useState<OrganizationDashboard>();
  const [registry, setRegistry] = useState<MethodologyRegistry>();
  const [audiences, setAudiences] = useState<ProductRecord[]>([]);
  const [configurations, setConfigurations] = useState<ProductRecord[]>([]);
  const [admin, setAdmin] = useState<ProductRecord>();
  const [audit, setAudit] = useState<ProductRecord[]>([]);
  const [preview, setPreview] = useState<ProductRecord>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string | undefined>("load");

  const stimuli = useMemo(
    () => (project ? latestVersions(project) : []),
    [project],
  );

  useEffect(() => {
    let stale = false;

    async function loadInitialState() {
      try {
        const loadedProject = await getProject(projectId);
        const loadedDashboard = await getOrganizationDashboard(
          loadedProject.organization_id,
        );
        const [loadedRegistry, loadedAudiences, loadedConfigurations] =
          await Promise.all([
            getMethodologyRegistry(),
            listAudienceDefinitions(loadedProject.organization_id),
            listSimulationConfigurations(projectId),
          ]);
        const [summary, events] = loadedDashboard.permissions
          .can_manage_settings
          ? await Promise.all([
              getOrganizationAdminSummary(loadedProject.organization_id),
              getOrganizationAudit(loadedProject.organization_id),
            ])
          : [undefined, undefined];
        if (!stale) {
          setProject(loadedProject);
          setDashboard(loadedDashboard);
          setRegistry(loadedRegistry);
          setAudiences(loadedAudiences.items);
          setConfigurations(loadedConfigurations.items);
          setAdmin(summary?.data);
          setAudit(events?.items ?? []);
          setError(undefined);
        }
      } catch (loadError) {
        if (!stale) setError(message(loadError));
      } finally {
        if (!stale) setBusy(undefined);
      }
    }

    void loadInitialState();
    return () => {
      stale = true;
    };
  }, [projectId]);

  async function addAudience(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = text(form.get("name"));
    const values = text(form.get("lifeStages"))
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    setBusy("audience");
    try {
      await createAudienceDefinition(project.organization_id, {
        name,
        manifest: {
          schema_version: 1,
          criteria: [
            { attribute: "life_stage", operator: "in", value: values },
          ],
          provenance_status: "demo",
          non_representative: true,
          target_population: "Authored fictional rehearsal cohorts only.",
        },
        limitations:
          "Experimental and non-representative. Validate with recruited human participants.",
      });
      const loaded = await listAudienceDefinitions(project.organization_id);
      setAudiences(loaded.items);
      setError(undefined);
      formElement.reset();
    } catch (createError) {
      setError(message(createError));
    } finally {
      setBusy(undefined);
    }
  }

  async function addConfiguration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!registry) return;
    const form = new FormData(event.currentTarget);
    setBusy("configuration");
    try {
      await createSimulationConfiguration(projectId, {
        name: text(form.get("name")),
        audience_version_id: text(form.get("audience")),
        population_frame_version_id: text(form.get("population")),
        methodology_version_id: text(form.get("methodology")),
        provider_configuration_version_id: text(form.get("provider")),
        sampling_configuration: {
          sample_size: Number(form.get("sampleSize")),
          minimum_per_cell: 5,
          maximum_cells: 100,
          seed: Number(form.get("seed")),
          sparse_cell_threshold: 5,
        },
        cost_ceiling_microusd: 0,
      });
      const loaded = await listSimulationConfigurations(projectId);
      setConfigurations(loaded.items);
      setError(undefined);
    } catch (createError) {
      setError(message(createError));
    } finally {
      setBusy(undefined);
    }
  }

  async function runPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("preview");
    try {
      const response = await createMethodologyPreview(projectId, {
        configuration_version_id: text(form.get("configuration")),
        stimulus_version_id: text(form.get("stimulus")),
        variant_key: "selected_variant",
        variant_label: "Selected variant",
      });
      setPreview(response.data);
      setError(undefined);
    } catch (runError) {
      setError(message(runError));
    } finally {
      setBusy(undefined);
    }
  }

  async function addVariantGroup() {
    if (stimuli.length < 2) return;
    setBusy("variants");
    try {
      await createVariantGroup(projectId, {
        name: "Primary comparison",
        members: stimuli.slice(0, 8).map((stimulus, index) => ({
          stimulus_version_id: stimulus.id,
          variant_key: index === 0 ? "baseline" : `variant_${index + 1}`,
          label: stimulus.label,
        })),
      });
      setError(undefined);
    } catch (variantError) {
      setError(message(variantError));
    } finally {
      setBusy(undefined);
    }
  }

  const report = record(preview?.report);
  const overall = record(report.overall);
  const distribution = record(overall.distribution);
  const categories = records(distribution.categories);
  const risks = records(overall.risks);
  const segments = records(report.segments);
  const rationales = records(report.rationales);
  const recommendations = Array.isArray(report.recommendations)
    ? report.recommendations.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const limitations = Array.isArray(report.limitations)
    ? report.limitations.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const transparency = record(report.transparency);

  return (
    <main className="workspace-main" id="main-content" tabIndex={-1}>
      <header className="workspace-header">
        <Link className="wordmark" href="/organizations">
          SIMULA
        </Link>
        <SignOutButton />
      </header>
      <WorkspaceSidebar
        current="methodology"
        organizationId={project?.organization_id}
        projectId={projectId}
      />
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href={`/projects/${projectId}`}>Project</Link>
        <span aria-hidden="true"> / </span>
        <span>Methodology lab</span>
      </nav>

      <section className="methodology-hero" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Experimental synthetic-cohort rehearsal</p>
          <h1 id="page-title">Methodology lab</h1>
          <p className="lede">
            Build a bounded audience, freeze a configuration, and inspect a
            reproducible diagnostic. No population or market-lift claim.
          </p>
        </div>
        <div className="methodology-notice" role="note">
          <strong>Not human evidence</strong>
          <span>
            Heuristic scores and generated qualitative artifacts only.
          </span>
        </div>
      </section>

      {busy === "load" ? (
        <p aria-live="polite">Loading methodology state…</p>
      ) : null}
      {error ? (
        <p className="problem" role="alert">
          {error}
        </p>
      ) : null}

      {dashboard?.permissions.can_create_runs ? (
        <>
          <section
            className="methodology-steps"
            aria-label="Methodology workflow"
          >
            <form className="panel form-stack" onSubmit={addAudience}>
              <p className="eyebrow">01 · Audience builder</p>
              <h2>Define rehearsal audience</h2>
              <label htmlFor="audience-name">Audience name</label>
              <input
                id="audience-name"
                maxLength={80}
                minLength={2}
                name="name"
                required
              />
              <label htmlFor="life-stages">Life-stage cell values</label>
              <input
                defaultValue="early, late"
                id="life-stages"
                name="lifeStages"
                required
              />
              <p className="field-note">
                Comma-separated values from the selected population frame.
              </p>
              <button disabled={busy === "audience"} type="submit">
                {busy === "audience"
                  ? "Creating…"
                  : "Create versioned audience"}
              </button>
            </form>

            <form className="panel form-stack" onSubmit={addConfiguration}>
              <p className="eyebrow">02 · Frozen configuration</p>
              <h2>Configure rehearsal</h2>
              <label htmlFor="configuration-name">Configuration name</label>
              <input
                defaultValue="Deterministic experimental configuration"
                id="configuration-name"
                name="name"
                required
              />
              <label htmlFor="configuration-audience">Audience version</label>
              <select id="configuration-audience" name="audience" required>
                <option value="">Select an audience</option>
                {audiences.map((audience) => (
                  <option
                    key={text(audience.audience_version_id)}
                    value={text(audience.audience_version_id)}
                  >
                    {text(audience.name)} · v{number(audience.version)}
                  </option>
                ))}
              </select>
              <input
                name="population"
                type="hidden"
                value={text(registry?.population_frames[0]?.id)}
              />
              <input
                name="methodology"
                type="hidden"
                value={text(registry?.methodologies[0]?.id)}
              />
              <input
                name="provider"
                type="hidden"
                value={text(registry?.providers[0]?.id)}
              />
              <label htmlFor="sample-size">Synthetic sample size</label>
              <input
                defaultValue="100"
                id="sample-size"
                max="5000"
                min="10"
                name="sampleSize"
                type="number"
              />
              <label htmlFor="seed">Deterministic seed</label>
              <input defaultValue="42" id="seed" name="seed" type="number" />
              <button
                disabled={!registry || busy === "configuration"}
                type="submit"
              >
                {busy === "configuration"
                  ? "Freezing…"
                  : "Freeze configuration"}
              </button>
            </form>

            <form className="panel form-stack" onSubmit={runPreview}>
              <p className="eyebrow">03 · Rehearsal</p>
              <h2>Run deterministic preview</h2>
              <label htmlFor="preview-configuration">Configuration</label>
              <select id="preview-configuration" name="configuration" required>
                <option value="">Select configuration</option>
                {configurations.map((configuration) => (
                  <option
                    key={text(configuration.configuration_version_id)}
                    value={text(configuration.configuration_version_id)}
                  >
                    {text(configuration.name)} · v
                    {number(configuration.version)}
                  </option>
                ))}
              </select>
              <label htmlFor="preview-stimulus">Stimulus version</label>
              <select id="preview-stimulus" name="stimulus" required>
                <option value="">Select stimulus</option>
                {stimuli.map((stimulus) => (
                  <option key={stimulus.id} value={stimulus.id}>
                    {stimulus.label}
                  </option>
                ))}
              </select>
              <button disabled={busy === "preview"} type="submit">
                {busy === "preview" ? "Running…" : "Run zero-cost preview"}
              </button>
            </form>
          </section>

          <section
            className="panel methodology-variant-action"
            aria-labelledby="variants-title"
          >
            <div>
              <p className="eyebrow">Variant structure</p>
              <h2 id="variants-title">Comparable stimuli</h2>
              <p className="field-note">
                Freeze the latest versions into one ordered comparison group.
                Reports remain diagnostics; no winner is declared.
              </p>
            </div>
            <button
              disabled={stimuli.length < 2 || busy === "variants"}
              onClick={() => void addVariantGroup()}
              type="button"
            >
              {busy === "variants" ? "Creating…" : "Group latest variants"}
            </button>
          </section>
        </>
      ) : dashboard ? (
        <section className="panel" aria-labelledby="methodology-read-only">
          <p className="eyebrow">Viewer access</p>
          <h2 id="methodology-read-only">Methodology is read-only</h2>
          <p className="field-note">
            Viewer role cannot create audiences, configurations, previews, or
            variant groups. Database RBAC enforces the same boundary.
          </p>
        </section>
      ) : null}

      {preview ? (
        <section className="methodology-report" aria-labelledby="report-title">
          <div className="methodology-report-heading">
            <div>
              <p className="eyebrow">Generated report · experimental</p>
              <h2 id="report-title">{text(report.executive_summary)}</h2>
            </div>
            <span className="methodology-chip">heuristic score</span>
          </div>
          <p className="methodology-warning">
            {text(report.experimental_notice)}
          </p>
          <div
            className="methodology-distribution"
            aria-label="Synthetic reaction distribution"
          >
            {categories.map((category) => (
              <div key={text(category.key)}>
                <span>{text(category.key).replaceAll("_", " ")}</span>
                <strong>{Math.round(number(category.value) * 100)}%</strong>
                <div aria-hidden="true">
                  <i style={{ width: `${number(category.value) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="methodology-report-grid">
            <section aria-labelledby="segment-results-title">
              <h3 id="segment-results-title">Segment visibility</h3>
              {segments.length ? (
                <ul>
                  {segments.map((segment) => (
                    <li key={text(segment.cell_key)}>
                      <strong>{text(segment.label)}</strong>{" "}
                      <span>{text(segment.status).replaceAll("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No supported segment output.</p>
              )}
            </section>
            <section aria-labelledby="risk-results-title">
              <h3 id="risk-results-title">Risk signals</h3>
              <ul>
                {risks.map((risk) => (
                  <li key={text(risk.key)}>
                    {text(risk.key).replaceAll("_", " ")}:{" "}
                    {number(risk.value).toFixed(1)}
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="rationale-results-title">
              <h3 id="rationale-results-title">Generated rationales</h3>
              <p className="field-note">
                Synthetic text. Never participant quotes.
              </p>
              <ul>
                {rationales.map((rationale) => (
                  <li key={text(rationale.cell_key)}>{text(rationale.text)}</li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="guidance-results-title">
              <h3 id="guidance-results-title">Decision guidance</h3>
              <ul>
                {recommendations.map((recommendation) => (
                  <li key={recommendation}>{recommendation}</li>
                ))}
              </ul>
            </section>
          </div>
          <details className="methodology-provenance">
            <summary>Limitations and uncertainty</summary>
            <ul>
              {limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </details>
          <details className="methodology-provenance">
            <summary>Methodology and reproducibility receipt</summary>
            <dl>
              <div>
                <dt>Output kind</dt>
                <dd>{text(transparency.numerical_output_kind)}</dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>{text(transparency.methodology_version)}</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>{text(transparency.provider_id)}</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>{number(transparency.cost_microusd)} microUSD</dd>
              </div>
              <div>
                <dt>Population checksum</dt>
                <dd>
                  <code>{text(transparency.population_checksum_sha256)}</code>
                </dd>
              </div>
              <div>
                <dt>Output checksum</dt>
                <dd>
                  <code>{text(transparency.output_sha256)}</code>
                </dd>
              </div>
            </dl>
          </details>
        </section>
      ) : null}

      {dashboard?.permissions.can_manage_settings ? (
        <section className="methodology-admin" aria-labelledby="admin-title">
          <div className="panel">
            <p className="eyebrow">Owner controls</p>
            <h2 id="admin-title">Workspace snapshot</h2>
            <dl className="methodology-stats">
              {admin
                ? [
                    "members",
                    "projects",
                    "audiences",
                    "runs",
                    "reports",
                    "feedback_records",
                  ].map((key) => (
                    <div key={key}>
                      <dt>{key.replaceAll("_", " ")}</dt>
                      <dd>{number(admin[key])}</dd>
                    </div>
                  ))
                : null}
            </dl>
          </div>
          <div className="panel">
            <p className="eyebrow">Audit trail</p>
            <h2>Recent actions</h2>
            <ol className="methodology-audit">
              {audit.slice(0, 8).map((event) => (
                <li key={text(event.id)}>
                  <strong>{text(event.action)}</strong>
                  <span>
                    {text(event.outcome)} · {text(event.source_service)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}
    </main>
  );
}
