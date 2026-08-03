"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { WorkspaceSidebar } from "@/app/workspace-sidebar";
import {
  ApiProblem,
  type CampaignLabCampaign,
  type CampaignLabResearchRun,
  type CampaignLabSimulationResult,
  type CampaignLabRunStatus,
  createCampaignLabCampaign,
  createCampaignLabResearch,
  createCampaignLabSimulation,
  getCampaignLabResearchRun,
  getCampaignLabSimulationResults,
  getCampaignLabSimulationStatus,
  listCampaignLabCampaigns,
} from "@/lib/api";

const STAGES = [
  "Campaign",
  "Decision",
  "Research",
  "Cohort",
  "Weighted panel",
  "Variants",
  "Configuration",
  "Repeated simulations",
  "Aggregate metrics",
  "Compare components",
  "Cohort analysis",
  "Synthetic interviews",
  "Survey import",
  "Survey calibration",
  "Historical backtest",
  "Compliance",
  "Report",
] as const;

const STAGE_KEYS = [
  "campaign_created",
  "decision_defined",
  "research_validated",
  "cohort_defined",
  "panel_weighted",
  "variants_added",
  "simulation_configured",
  "simulated",
  "aggregated",
  "compared",
  "cohorts_analyzed",
  "interviewed",
  "survey_imported",
  "calibrated",
  "backtested",
  "compliance_reviewed",
  "reported",
] as const;

function starterRequest(campaignId: string): Record<string, unknown> {
  const source = {
    source_id: "philippine_population_frame",
    title: "Philippine aggregate population frame fixture",
    source_type: "public_dataset",
    source_organization: "SIMULA research fixture",
    publication_date: "2026-01-01T00:00:00Z",
    dataset_version: "fixture-v1",
    geography: "Philippines",
    sample_size: 100000,
    collection_methodology:
      "Aggregate cell fixture for local workflow rehearsal.",
    license_or_usage_rights:
      "Replace with the declared source license before external use.",
    processing_date: "2026-08-02T00:00:00Z",
    transformation: "One aggregate cell; no individual records.",
    confidence_level: 0.5,
    known_limitations: ["Fixture only; not a population estimate."],
    checksum_sha256:
      "0000000000000000000000000000000000000000000000000000000000000000",
  };
  return {
    campaign_id: campaignId,
    objective:
      "Compare two authored messages using aggregate population weighting.",
    purpose: "commercial_marketing",
    cohort: {
      cohort_id: "30000000-0000-4000-8000-000000000202",
      name: "Philippine aggregate fixture cohort",
      geography: "Philippines",
      dimensions: [{ dimension: "region", value: "national" }],
      population_frame: {
        id: "30000000-0000-4000-8000-000000000203",
        frame_id: "30000000-0000-4000-8000-000000000204",
        version: 1,
        name: "Philippine aggregate fixture",
        geography: "Philippines",
        target_population: "Aggregate adults in the declared Philippine frame",
        inclusion: ["Declared aggregate cell only"],
        exclusion: ["Individual voter or respondent records"],
        provenance: [
          {
            source_id: "philippine_population_frame",
            source_version: "fixture-v1",
            owner: "SIMULA research fixture",
            license: "Replace before external use",
            allowed_uses: ["aggregate_campaign_research"],
            collection_period: "2026",
            sampling_frame: "Aggregate fixture",
            transformations: ["No individual records"],
            known_biases: ["Fixture is not representative evidence"],
            coverage_limitations: ["One aggregate cell"],
            validation_status: "experimental",
          },
        ],
        cells: [
          {
            key: "national_aggregate",
            weight: 1,
            dimensions: [
              { dimension: "age_bracket", value: "adult" },
              { dimension: "primary_language", value: "fil" },
              { dimension: "region", value: "national" },
            ],
          },
        ],
        validation_status: "experimental",
        limitations: ["Fixture only; replace with a cited frozen frame."],
      },
      audience: {
        id: "30000000-0000-4000-8000-000000000205",
        audience_id: "30000000-0000-4000-8000-000000000206",
        version: 1,
        name: "All declared aggregate cells",
        criteria: [],
        minimum_cell_weight: 0,
        provenance_status: "demo",
        limitations: ["Fixture audience only."],
      },
      source_provenance: [source],
      weighting_method: "population_weighted",
      behavioral_model_version: "deterministic-behavior-v1",
      behavioral_dimensions: [
        {
          key: "openness_to_information",
          definition: "Illustrative aggregate model dimension.",
          minimum: 0,
          maximum: 1,
          provenance: "Assumed",
          derivation_method: "Seeded deterministic fixture value.",
          validation_status: "unknown",
          model_version: "deterministic-behavior-v1",
          known_limitations: ["Not observed human behavior."],
        },
      ],
      confidence: 0.2,
      known_limitations: [
        "Fixture only; synthetic output is not human evidence.",
      ],
    },
    variants: [
      {
        key: "control",
        label: "Control message",
        content: "A clear, evidence-led message for the community.",
        language: "en",
        content_type: "social_post",
      },
      {
        key: "variant_b",
        label: "Variant B",
        content: "A warmer message that explains the same community benefit.",
        language: "en",
        content_type: "social_post",
      },
    ],
    configuration: {
      random_seed: 20260802,
      panel_size: 10,
      repetitions: 3,
      rounds: 1,
      network_topology: "independent",
      provider: "deterministic",
      model_name: "deterministic-methodology-engine",
      model_parameters: {},
      prompt_version: "none-deterministic-v1",
      research_corpus_version: "fixture-v1",
      persona_generation_version: "structured-persona-v1",
      scoring_version: "component-metrics-v1",
      simulation_engine_version: "campaign-lab-population-weighted-v1",
      cost_ceiling_microusd: 0,
      timeout_seconds: 30,
      sampling_minimum_per_cell: 1,
      sampling_maximum_cells: 10,
      sparse_cell_threshold: 1,
    },
    research_sources: [source],
    ranking_metric: "clarity",
  };
}

type ResearchMediaType =
  | "text/plain"
  | "text/markdown"
  | "text/csv"
  | "application/json"
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const researchSourceExample = JSON.stringify(
  {
    source_id: "research_upload_source",
    title: "Uploaded research source",
    source_type: "client_provided",
    source_organization: "Research owner",
    publication_date: null,
    dataset_version: "v1",
    geography: "Philippines",
    sample_size: null,
    collection_methodology: "Describe how this source was collected.",
    license_or_usage_rights: "Declare the rights and permitted use.",
    processing_date: "2026-08-03T00:00:00Z",
    transformation: "Bounded text extraction with source-chunk citations.",
    confidence_level: 0.2,
    known_limitations: ["Replace this fixture metadata before external use."],
    checksum_sha256:
      "0000000000000000000000000000000000000000000000000000000000000000",
  },
  null,
  2,
);

function researchMediaType(file: File): ResearchMediaType {
  const known: ReadonlySet<string> = new Set([
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  if (known.has(file.type)) return file.type as ResearchMediaType;
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "md" || extension === "markdown") return "text/markdown";
  if (extension === "csv") return "text/csv";
  if (extension === "json") return "application/json";
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (extension === "txt") return "text/plain";
  throw new Error("Choose a UTF-8 text, Markdown, CSV, JSON, PDF, or DOCX file.");
}

async function readResearchPayload(
  file: File,
  mediaType: ResearchMediaType,
): Promise<Readonly<{ content: string; content_encoding: "utf8" | "base64" }>> {
  if (
    mediaType === "text/plain" ||
    mediaType === "text/markdown" ||
    mediaType === "text/csv" ||
    mediaType === "application/json"
  ) {
    return { content: await file.text(), content_encoding: "utf8" };
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected research file could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const separator = dataUrl.indexOf(",");
  if (separator < 0 || !dataUrl.slice(separator + 1)) {
    throw new Error("The selected research file has no readable content.");
  }
  return {
    content: dataUrl.slice(separator + 1),
    content_encoding: "base64",
  };
}

function problemMessage(error: unknown): string {
  if (error instanceof ApiProblem) {
    return error.correlationId
      ? `${error.message} Correlation: ${error.correlationId}.`
      : error.message;
  }
  return "SIMULA could not complete that request. Retry shortly.";
}

function campaignId(campaign: CampaignLabCampaign): string {
  return campaign.campaign_id ?? campaign.id ?? "";
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function CampaignLabWorkspace({
  projectId,
}: Readonly<{ projectId: string }>) {
  const [campaigns, setCampaigns] = useState<
    ReadonlyArray<CampaignLabCampaign>
  >([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [run, setRun] = useState<CampaignLabRunStatus>();
  const [result, setResult] = useState<CampaignLabSimulationResult>();
  const [requestText, setRequestText] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [researchFile, setResearchFile] = useState<File | null>(null);
  const [researchSourceJson, setResearchSourceJson] = useState(
    researchSourceExample,
  );
  const [researchRun, setResearchRun] = useState<CampaignLabResearchRun>();
  const [researchBusy, setResearchBusy] = useState(false);

  const selectedCampaign = useMemo(
    () =>
      campaigns.find((campaign) => campaignId(campaign) === selectedCampaignId),
    [campaigns, selectedCampaignId],
  );

  useEffect(() => {
    let stale = false;
    void listCampaignLabCampaigns(projectId)
      .then((page) => {
        if (stale) return;
        setCampaigns(page.items);
        const first = page.items[0];
        if (first) {
          const id = campaignId(first);
          setSelectedCampaignId(id);
          setRequestText(JSON.stringify(starterRequest(id), null, 2));
        }
      })
      .catch((loadError: unknown) => {
        if (!stale) setError(problemMessage(loadError));
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!run || !["queued", "running", "retrying"].includes(run.status)) {
      return;
    }
    let stale = false;
    const timer = window.setInterval(() => {
      void getCampaignLabSimulationStatus(run.id)
        .then((nextRun) => {
          if (stale) return;
          if (nextRun.status === "succeeded") {
            void getCampaignLabSimulationResults(nextRun.id)
              .then((nextResult) => {
                if (!stale) {
                  setRun(nextRun);
                  setResult(nextResult);
                }
              })
              .catch((resultError: unknown) => {
                if (!stale) setError(problemMessage(resultError));
              });
          } else {
            setRun(nextRun);
          }
        })
        .catch((pollError: unknown) => setError(problemMessage(pollError)));
    }, 2000);
    return () => {
      stale = true;
      window.clearInterval(timer);
    };
  }, [run]);

  useEffect(() => {
    if (
      !researchRun ||
      !["queued", "running", "retrying"].includes(researchRun.status)
    ) {
      return;
    }
    let stale = false;
    const timer = window.setInterval(() => {
      void getCampaignLabResearchRun(researchRun.id)
        .then((nextRun) => {
          if (stale) return;
          setResearchRun(nextRun);
          const graph = nextRun.result?.knowledge_graph;
          const source = nextRun.result?.source;
          if (nextRun.status !== "succeeded" || !isRecord(graph) || !isRecord(source)) {
            return;
          }
          setRequestText((current) => {
            try {
              const parsed = JSON.parse(current) as Record<string, unknown>;
              const existingSources = Array.isArray(parsed.research_sources)
                ? parsed.research_sources.filter(isRecord)
                : [];
              const existingKnowledge = Array.isArray(parsed.research_knowledge)
                ? parsed.research_knowledge.filter(isRecord)
                : [];
              const sourceId = typeof source.source_id === "string" ? source.source_id : null;
              const nextSources = sourceId
                ? [
                    ...existingSources.filter((item) => item.source_id !== sourceId),
                    source,
                  ]
                : existingSources;
              const nextKnowledge = sourceId
                ? [
                    ...existingKnowledge.filter((item) => item.source_id !== sourceId),
                    graph,
                  ]
                : existingKnowledge;
              return JSON.stringify(
                {
                  ...parsed,
                  research_sources: nextSources,
                  research_knowledge: nextKnowledge,
                },
                null,
                2,
              );
            } catch {
              return current;
            }
          });
        })
        .catch((pollError: unknown) => {
          if (!stale) setError(problemMessage(pollError));
        });
    }, 2000);
    return () => {
      stale = true;
      window.clearInterval(timer);
    };
  }, [researchRun]);

  async function createCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = form.get("name");
    const objective = form.get("objective");
    if (typeof name !== "string" || typeof objective !== "string") return;
    setSaving(true);
    setError(undefined);
    try {
      const created = await createCampaignLabCampaign({
        project_id: projectId,
        name,
        objective,
        purpose: "commercial_marketing",
        decision: { decision: "compare_authored_variants" },
      });
      const id = created.campaign_id ?? "";
      const next = {
        ...created,
        id,
        organization_id: "",
        project_id: projectId,
        name,
        objective,
        purpose: "commercial_marketing",
        current_stage: "campaign_created",
        compliance_status: "pending",
        version: 1,
        created_at: created.created_at ?? new Date().toISOString(),
        updated_at: created.created_at ?? new Date().toISOString(),
      } satisfies CampaignLabCampaign;
      setCampaigns((current) => [next, ...current]);
      setSelectedCampaignId(id);
      setRequestText(JSON.stringify(starterRequest(id), null, 2));
      event.currentTarget.reset();
    } catch (createError) {
      setError(problemMessage(createError));
    } finally {
      setSaving(false);
    }
  }

  async function launchSimulation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCampaignId) {
      setError("Create or select a Campaign Lab workspace first.");
      return;
    }
    setRunning(true);
    setError(undefined);
    setResult(undefined);
    try {
      const parsed = JSON.parse(requestText) as Record<string, unknown>;
      parsed.campaign_id = selectedCampaignId;
      const created = await createCampaignLabSimulation(
        selectedCampaignId,
        parsed,
      );
      if (!created.run_id)
        throw new Error("Campaign Lab did not return a run id.");
      const nextRun = {
        id: created.run_id,
        campaign_id: selectedCampaignId,
        run_type: "repeated_simulation",
        status: created.status,
        stage: created.stage ?? "queued",
        progress: created.progress ?? 0,
        attempt_count: 0,
        created_at: created.created_at ?? new Date().toISOString(),
        started_at: null,
        completed_at: null,
        last_error_code: null,
      } satisfies CampaignLabRunStatus;
      setRun(nextRun);
      if (nextRun.status === "succeeded") {
        setResult(await getCampaignLabSimulationResults(nextRun.id));
      }
    } catch (launchError) {
      setError(
        launchError instanceof SyntaxError
          ? "Simulation request JSON is not valid."
          : problemMessage(launchError),
      );
    } finally {
      setRunning(false);
    }
  }

  async function uploadResearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCampaignId || !researchFile) {
      setError("Select a Campaign Lab and a research file first.");
      return;
    }
    setResearchBusy(true);
    setError(undefined);
    try {
      const mediaType = researchMediaType(researchFile);
      const source = JSON.parse(researchSourceJson) as Record<string, unknown>;
      const secretPayload = await readResearchPayload(researchFile, mediaType);
      const created = await createCampaignLabResearch(selectedCampaignId, {
        title: researchFile.name,
        payload: {},
        provenance: source,
        source,
        filename: researchFile.name,
        media_type: mediaType,
        chunk_size: 1200,
        overlap: 120,
        secret_payload: secretPayload,
      });
      if (!created.run_id) {
        throw new Error("Research ingestion did not return a run id.");
      }
      setResearchRun({
        id: created.run_id,
        campaign_id: selectedCampaignId,
        run_type: "research_ingestion",
        status: created.status,
        stage: created.stage ?? "queued",
        progress: created.progress ?? 0,
        attempt_count: 0,
        created_at: created.created_at ?? new Date().toISOString(),
        started_at: null,
        completed_at: null,
        last_error_code: null,
      });
      setResearchFile(null);
      event.currentTarget.reset();
    } catch (uploadError) {
      setError(
        uploadError instanceof SyntaxError
          ? "Research source JSON is not valid."
          : problemMessage(uploadError),
      );
    } finally {
      setResearchBusy(false);
    }
  }

  const activeStage =
    run?.stage ?? selectedCampaign?.current_stage ?? "campaign_created";
  const activeStageIndex = Math.max(
    0,
    STAGE_KEYS.indexOf(activeStage as (typeof STAGE_KEYS)[number]),
  );

  return (
    <main
      className="workspace-main workspace-main-wide"
      id="main-content"
      tabIndex={-1}
    >
      <header className="workspace-header" id="overview">
        <Link className="wordmark" href={`/projects/${projectId}`}>
          SIMULA
        </Link>
      </header>
      <WorkspaceSidebar current="campaign-lab" projectId={projectId} />
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href={`/projects/${projectId}`}>Project workspace</Link>
        <span aria-hidden="true"> / </span>
        <span>Campaign Simulation Lab</span>
      </nav>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Aggregate research · Philippines</p>
          <h1>Campaign Simulation Lab</h1>
          <p className="lede">
            Compare authored variants with population weighting, repeated seeded
            runs, survey calibration, and historical backtesting.
          </p>
        </div>
        <div className="panel">
          <strong>Evidence status: Synthetic-only</strong>
          <p className="field-note">
            No individual voter records. No final viral score. No vote-share
            claim.
          </p>
        </div>
      </header>
      {error ? (
        <p className="problem" role="alert">
          {error}
        </p>
      ) : null}
      <section className="workspace-grid" aria-label="Campaign Lab setup">
        <form className="panel form-stack" onSubmit={createCampaign}>
          <p className="eyebrow">01 / Campaign definition</p>
          <h2>Start a bounded lab</h2>
          <label htmlFor="campaign-name">Campaign name</label>
          <input id="campaign-name" minLength={2} name="name" required />
          <label htmlFor="campaign-objective">Decision objective</label>
          <textarea
            id="campaign-objective"
            name="objective"
            required
            rows={4}
          />
          <button disabled={saving} type="submit">
            {saving ? "Saving…" : "Create Campaign Lab"}
          </button>
        </form>
        <div className="panel">
          <p className="eyebrow">Saved workspaces</p>
          {loading ? (
            <p aria-live="polite">Loading Campaign Lab workspaces…</p>
          ) : null}
          {!loading && campaigns.length === 0 ? (
            <p>
              No Campaign Lab workspace yet. Start one to define the evidence
              boundary.
            </p>
          ) : null}
          <div className="form-stack">
            {campaigns.map((campaign) => {
              const id = campaignId(campaign);
              return (
                <button
                  className={
                    id === selectedCampaignId ? "button-ghost" : "button-quiet"
                  }
                  key={id}
                  onClick={() => {
                    setSelectedCampaignId(id);
                    setRequestText(JSON.stringify(starterRequest(id), null, 2));
                    setRun(undefined);
                    setResult(undefined);
                  }}
                  type="button"
                >
                  {campaign.name} · {campaign.status}
                </button>
              );
            })}
          </div>
        </div>
      </section>
      <section className="panel" aria-labelledby="flow-title" id="research">
        <p className="eyebrow">02 / Evidence workflow</p>
        <h2 id="flow-title">Traceable flow</h2>
        <ol className="workflow-list">
          {STAGES.map((stage, index) => (
            <li
              className={index <= activeStageIndex ? "is-active" : undefined}
              id={`stage-${STAGE_KEYS[index]}`}
              key={stage}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {stage}
            </li>
          ))}
        </ol>
        <p className="field-note">
          Survey-derived and historical evidence remain separate stages. The
          deterministic first release exposes component metrics and stability,
          not a synthesized campaign verdict.
        </p>
      </section>
      {selectedCampaignId ? (
        <section
          aria-labelledby="research-upload-title"
          className="panel"
          id="research-upload"
        >
          <p className="eyebrow">02A / Research ingestion</p>
          <h2 id="research-upload-title">Upload source-grounded research</h2>
          <p className="field-note">
            Files are sent to the worker-only ingestion envelope. SIMULA stores
            bounded source metadata and extracted citations, not respondent rows
            or an ungrounded knowledge claim.
          </p>
          <form className="form-stack" onSubmit={uploadResearch}>
            <label htmlFor="campaign-lab-research-file">Research file</label>
            <input
              accept=".txt,.md,.markdown,.csv,.json,.pdf,.docx"
              id="campaign-lab-research-file"
              onChange={(event) =>
                setResearchFile(event.target.files?.[0] ?? null)
              }
              required
              type="file"
            />
            <label htmlFor="campaign-lab-research-source">
              Source provenance JSON
            </label>
            <textarea
              id="campaign-lab-research-source"
              onChange={(event) => setResearchSourceJson(event.target.value)}
              rows={12}
              value={researchSourceJson}
            />
            <button disabled={researchBusy} type="submit">
              {researchBusy ? "Queueing research…" : "Queue research ingestion"}
            </button>
          </form>
          {researchRun ? (
            <p aria-live="polite" className="field-note">
              Research ingestion: <strong>{researchRun.status}</strong> ·{" "}
              {researchRun.progress}% · run <code>{researchRun.id}</code>
            </p>
          ) : null}
        </section>
      ) : null}
      {selectedCampaignId ? (
        <section className="workspace-grid" aria-label="Simulation request">
          <form className="panel form-stack" onSubmit={launchSimulation}>
            <p className="eyebrow">03 / Repeated simulation</p>
            <h2>Run an authored aggregate request</h2>
            <label htmlFor="campaign-lab-request">Frozen request JSON</label>
            <textarea
              aria-describedby="campaign-lab-request-note"
              id="campaign-lab-request"
              onChange={(event) => setRequestText(event.target.value)}
              rows={24}
              value={requestText}
            />
            <p className="field-note" id="campaign-lab-request-note">
              Replace the fixture frame with a cited, frozen Philippine
              aggregate population frame before using the output for a real
              decision.
            </p>
            <button disabled={running} type="submit">
              {running ? "Queueing…" : "Queue repeated simulation"}
            </button>
          </form>
          <div className="panel" aria-live="polite" id="agent-activity">
            <p className="eyebrow">Run status</p>
            {run ? (
              <>
                <h2>{run.status}</h2>
                <p>
                  {run.stage} · {run.progress}% · attempt {run.attempt_count}
                </p>
                <p className="field-note">
                  Run ID: <code>{run.id}</code>
                </p>
                {run.status === "succeeded" ? (
                  <p className="success">
                    Result persisted. Read component rankings with the run
                    result and attach survey/backtest evidence before approval.
                  </p>
                ) : null}
              </>
            ) : (
              <p>
                Queue a run to see durable progress and terminal evidence
                status.
              </p>
            )}
          </div>
        </section>
      ) : null}
      {result ? (
        <section
          aria-labelledby="campaign-lab-results-title"
          className="panel campaign-lab-results"
          id="results"
        >
          <p className="eyebrow">04 / Component results</p>
          <div className="section-heading-row">
            <div>
              <h2 id="campaign-lab-results-title">
                Repeated component findings
              </h2>
              <p className="field-note">
                {result.result.sample_size} synthetic panel records ·{" "}
                {result.result.repetitions} seeded repetitions · evidence status{" "}
                <strong>{result.evidence_status}</strong>
              </p>
            </div>
          </div>
          <div className="campaign-lab-result-grid">
            {Object.entries(result.result.overall_component_rankings).map(
              ([metric, ranking]) => (
                <article className="campaign-lab-result-card" key={metric}>
                  <p className="eyebrow">{metric}</p>
                  <h3>
                    {ranking.top_variant_key ?? "No stable top variant"}
                  </h3>
                  <p>
                    {ranking.stability_label} · pairwise agreement{" "}
                    {percent(ranking.pairwise_rank_agreement)}
                  </p>
                  <ul>
                    {ranking.variants.map((variant) => (
                      <li key={variant.variant_key}>
                        {variant.variant_key}: {percent(variant.top_rank_probability)}
                        {" top-rank probability"}
                      </li>
                    ))}
                  </ul>
                </article>
              ),
            )}
          </div>
          <div className="campaign-lab-cohort-results">
            <div>
              <p className="eyebrow">Cohort differences</p>
              <h3>Population-weighted cells, shown separately</h3>
            </div>
            <div className="campaign-lab-cohort-list">
              {(result.result.cohort_findings ?? []).map((finding) => (
                <article
                  className="campaign-lab-cohort-card"
                  key={finding.cohort_key}
                >
                  <h4>{finding.cohort_key}</h4>
                  <p className="field-note">
                    Population weight {percent(finding.population_weight)} ·{" "}
                    {finding.repetition_count} repetitions
                  </p>
                  <p>
                    {Object.entries(finding.dimensions)
                      .map(([key, value]) => key + ": " + value)
                      .join(" · ")}
                  </p>
                  <ul>
                    {Object.entries(finding.component_rankings).map(
                      ([metric, ranking]) => (
                        <li key={metric}>
                          {metric}: {ranking.top_variant_key ?? "no stable leader"}
                        </li>
                      ),
                    )}
                  </ul>
                </article>
              ))}
            </div>
          </div>
          <p className="field-note">
            These are synthetic repeated-run diagnostics. They are not survey
            estimates, vote-share forecasts, or evidence of individual
            persuadability. Attach consented survey calibration and held-out
            backtesting before consequential use.
          </p>
        </section>
      ) : null}
      <p className="field-note">
        Campaign Lab is a research aid. External use requires human review,
        lawful data provenance, consented survey calibration, and held-out
        historical validation.
      </p>
    </main>
  );
}
