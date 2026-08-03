"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { WorkspaceSidebar } from "@/app/workspace-sidebar";
import {
  ApiProblem,
  type CampaignLabAuditPage,
  type CampaignLabCampaign,
  type CampaignLabDurableRun,
  type CampaignLabResearchRun,
  type CampaignLabSimulationResult,
  type CampaignLabRunStatus,
  createCampaignLabCampaign,
  createCampaignLabBacktest,
  createCampaignLabCalibration,
  createCampaignLabComplianceReview,
  createCampaignLabInterview,
  createCampaignLabReport,
  createCampaignLabResearch,
  createCampaignLabSimulation,
  createCampaignLabSurveyImport,
  getCampaignLabBacktestRun,
  getCampaignLabAudit,
  getCampaignLabCalibrationRun,
  getCampaignLabComplianceRun,
  getCampaignLabInterviewRun,
  getCampaignLabReportRun,
  getCampaignLabResearchRun,
  getCampaignLabSimulationResults,
  getCampaignLabSimulationStatus,
  getCampaignLabSurveyImportRun,
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

const surveyMetadataExample = JSON.stringify(
  {
    source_id: "consented_survey_source",
    source_version: "v1",
    owner: "Research owner",
    license: "Declared survey-use license",
    allowed_uses: ["aggregate_campaign_research", "calibration"],
    collection_period: "2026-Q2",
    geography: "Philippines",
    methodology: "Describe the consented survey methodology.",
    consent_recorded: true,
    authorized_for_calibration: true,
    quality_filter_version: "quality-filter-v1",
    known_biases: ["Replace this fixture note with documented survey bias."],
    coverage_limitations: [
      "Replace this fixture note with documented coverage.",
    ],
  },
  null,
  2,
);

const surveyFieldMapExample = JSON.stringify(
  {
    variant_key: "variant_key",
    cohort_key: "cohort_key",
    reaction_positive: "reaction_positive",
    reaction_neutral: "reaction_neutral",
    reaction_negative: "reaction_negative",
    reaction_mixed: "reaction_mixed",
    metric_clarity: "clarity",
    metric_relevance: "relevance",
    metric_trust: "trust",
    metric_persuasiveness: "persuasiveness",
    metric_consideration: "consideration",
    post_stratification_weight: "post_stratification_weight",
    quality_score: "quality_score",
    completed_flag: "completed",
  },
  null,
  2,
);

const surveyDatasetExample = JSON.stringify(
  {
    provenance: {
      evidence_class: "observed_survey",
      source_id: "consented_survey_source",
      source_version: "v1",
      owner: "Research owner",
      license: "Declared survey-use license",
      allowed_uses: ["aggregate_campaign_research", "calibration"],
      collection_period: "2026-Q2",
      geography: "Philippines",
      methodology: "Aggregate consented survey fixture; replace before use.",
      consent_recorded: true,
      authorized_for_calibration: true,
      quality_filter_version: "quality-filter-v1",
      sample_size: 100,
      checksum_sha256:
        "0000000000000000000000000000000000000000000000000000000000000000",
      known_biases: ["Fixture only; document observed survey bias."],
      coverage_limitations: ["Fixture only; document coverage limitations."],
    },
    observations: [
      {
        variant_key: "control",
        cohort_key: "aggregate",
        respondent_count: 50,
        post_stratification_weight: 1,
        reaction_distribution: {
          categories: [
            { key: "positive", value: 0.4 },
            { key: "neutral", value: 0.3 },
            { key: "negative", value: 0.2 },
            { key: "mixed", value: 0.1 },
          ],
        },
        metrics: [
          { key: "clarity", value: 70 },
          { key: "relevance", value: 65 },
          { key: "trust", value: 60 },
          { key: "persuasiveness", value: 55 },
          { key: "consideration", value: 50 },
        ],
        quality_pass_rate: 0.95,
      },
      {
        variant_key: "variant_b",
        cohort_key: "aggregate",
        respondent_count: 50,
        post_stratification_weight: 1,
        reaction_distribution: {
          categories: [
            { key: "positive", value: 0.45 },
            { key: "neutral", value: 0.25 },
            { key: "negative", value: 0.2 },
            { key: "mixed", value: 0.1 },
          ],
        },
        metrics: [
          { key: "clarity", value: 72 },
          { key: "relevance", value: 68 },
          { key: "trust", value: 62 },
          { key: "persuasiveness", value: 59 },
          { key: "consideration", value: 54 },
        ],
        quality_pass_rate: 0.95,
      },
    ],
  },
  null,
  2,
);

const backtestProtocolExample = JSON.stringify(
  {
    protocol_id: "held_out_campaign_protocol",
    protocol_version: "v1",
    model_version: "campaign-lab-model-v1",
    methodology_version: "campaign-lab-population-weighted-v1",
    outcome_metric: "observed_message_score",
    development_campaign_ids: ["historical_development_2024"],
    holdout_campaign_ids: ["historical_holdout_2025"],
    minimum_campaigns: 1,
  },
  null,
  2,
);

const backtestPredictionExample = JSON.stringify(
  {
    protocol_id: "held_out_campaign_protocol",
    protocol_version: "v1",
    model_version: "campaign-lab-model-v1",
    methodology_version: "campaign-lab-population-weighted-v1",
    predictions_are_blind: true,
    predictions: [
      {
        campaign_key: "historical_holdout_2025",
        variant_key: "control",
        cohort_key: "aggregate",
        predicted_value: 55,
      },
      {
        campaign_key: "historical_holdout_2025",
        variant_key: "variant_b",
        cohort_key: "aggregate",
        predicted_value: 62,
      },
    ],
  },
  null,
  2,
);

const backtestOutcomesExample = JSON.stringify(
  {
    provenance: {
      evidence_class: "observed_historical_outcome",
      source_id: "held_out_outcome_source",
      source_version: "v1",
      owner: "Research owner",
      license: "Declared historical-outcome license",
      allowed_uses: ["aggregate_campaign_research", "backtesting"],
      observation_period: "2025",
      geography: "Philippines",
      outcome_definition: "Observed aggregate message score.",
      held_out: true,
      authorized_for_evaluation: true,
      checksum_sha256:
        "0000000000000000000000000000000000000000000000000000000000000000",
      known_biases: ["Fixture only; document historical outcome bias."],
      coverage_limitations: ["Fixture only; document holdout limitations."],
    },
    outcomes: [
      {
        campaign_key: "historical_holdout_2025",
        variant_key: "control",
        cohort_key: "aggregate",
        outcome_metric: "observed_message_score",
        observed_value: 54,
        cohort_weight: 1,
      },
      {
        campaign_key: "historical_holdout_2025",
        variant_key: "variant_b",
        cohort_key: "aggregate",
        outcome_metric: "observed_message_score",
        observed_value: 60,
        cohort_weight: 1,
      },
    ],
  },
  null,
  2,
);

const complianceExample = JSON.stringify(
  {
    use_case: "aggregate message research",
    geography: "Philippines",
    data_scope: [
      "population-weighted aggregate cells",
      "consented survey aggregates",
    ],
    individual_records: false,
    individual_targeting: false,
    political_targeting: false,
    voter_suppression: false,
    synthetic_outputs_disclosed: true,
    real_world_validation_required: true,
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
  throw new Error(
    "Choose a UTF-8 text, Markdown, CSV, JSON, PDF, or DOCX file.",
  );
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
    reader.onerror = () =>
      reject(new Error("The selected research file could not be read."));
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

function commandRun(
  command: Readonly<{
    run_id?: string;
    status: string;
    stage?: string;
    progress?: number;
    created_at?: string;
  }>,
  campaignId: string,
  runType: string,
): CampaignLabDurableRun {
  if (!command.run_id) {
    throw new Error(`Campaign Lab did not return a ${runType} run id.`);
  }
  return {
    id: command.run_id,
    campaign_id: campaignId,
    run_type: runType,
    status: command.status,
    stage: command.stage ?? "queued",
    progress: command.progress ?? 0,
    attempt_count: 0,
    created_at: command.created_at ?? new Date().toISOString(),
    started_at: null,
    completed_at: null,
    last_error_code: null,
    retention_until: null,
  };
}

function useDurableRunPolling(
  run: CampaignLabDurableRun | undefined,
  fetchRun: (runId: string) => Promise<CampaignLabDurableRun>,
  onUpdate: (nextRun: CampaignLabDurableRun) => void,
  onError: (error: unknown) => void,
) {
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onErrorRef.current = onError;
  }, [onError, onUpdate]);

  useEffect(() => {
    if (!run || !["queued", "running", "retrying"].includes(run.status)) {
      return;
    }
    let stale = false;
    const poll = () => {
      void fetchRun(run.id)
        .then((nextRun) => {
          if (!stale) onUpdateRef.current(nextRun);
        })
        .catch((pollError: unknown) => {
          if (!stale) onErrorRef.current(pollError);
        });
    };
    poll();
    const timer = window.setInterval(poll, 2000);
    return () => {
      stale = true;
      window.clearInterval(timer);
    };
  }, [fetchRun, run]);
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
  const [surveyImportFile, setSurveyImportFile] = useState<File | null>(null);
  const [surveyImportFormat, setSurveyImportFormat] = useState("csv");
  const [surveyMetadataJson, setSurveyMetadataJson] = useState(
    surveyMetadataExample,
  );
  const [surveyFieldMapJson, setSurveyFieldMapJson] = useState(
    surveyFieldMapExample,
  );
  const [surveyRun, setSurveyRun] = useState<CampaignLabDurableRun>();
  const [surveyDatasetJson, setSurveyDatasetJson] =
    useState(surveyDatasetExample);
  const [syntheticObservationsJson, setSy…6747 tokens truncated…                  Result persisted. Read component rankings with the run
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
                {result.result.sample_size} synthetic panel records Â·{" "}
                {result.result.repetitions} seeded repetitions Â· evidence status{" "}
                <strong>{result.evidence_status}</strong>
              </p>
            </div>
          </div>
          <div className="campaign-lab-result-grid">
            {Object.entries(result.result.overall_component_rankings).map(
              ([metric, ranking]) => (
                <article className="campaign-lab-result-card" key={metric}>
                  <p className="eyebrow">{metric}</p>
                  <h3>{ranking.top_variant_key ?? "No stable top variant"}</h3>
                  <p>
                    {ranking.stability_label} Â· pairwise agreement{" "}
                    {percent(ranking.pairwise_rank_agreement)}
                  </p>
                  <ul>
                    {ranking.variants.map((variant) => (
                      <li key={variant.variant_key}>
                        {variant.variant_key}:{" "}
                        {percent(variant.top_rank_probability)}
                        {" top-rank probability"}
                      </li>
                    ))}
                  </ul>
                </article>
              ),
            )}
          </div>
          <div className="campaign-lab-cohort-results" id="audience-cohorts">
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
                    Population weight {percent(finding.population_weight)} Â·{" "}
                    {finding.repetition_count} repetitions
                  </p>
                  <p>
                    {Object.entries(finding.dimensions)
                      .map(([key, value]) => key + ": " + value)
                      .join(" Â· ")}
                  </p>
                  <ul>
                    {Object.entries(finding.component_rankings).map(
                      ([metric, ranking]) => (
                        <li key={metric}>
                          {metric}:{" "}
                          {ranking.top_variant_key ?? "no stable leader"}
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
      {selectedCampaignId ? (
        <section
          className="panel"
          id="persona-interviews"
          aria-labelledby="interview-title"
        >
          <p className="eyebrow">05 / Persona interviews</p>
          <h2 id="interview-title">Inspect bounded synthetic agent evidence</h2>
          <p className="field-note">
            Interviews are generated only from a succeeded simulation agent
            trace. They are synthetic, never a substitute for a respondent.
          </p>
          <form className="form-stack" onSubmit={createInterview}>
            <label htmlFor="campaign-lab-interview-variant">Variant</label>
            <select
              id="campaign-lab-interview-variant"
              onChange={(event) => setInterviewVariantKey(event.target.value)}
              value={interviewVariantKey}
            >
              {(result?.result.behavioral_diagnostics?.variants ?? []).map(
                (variant) => (
                  <option key={variant.variant_key} value={variant.variant_key}>
                    {variant.variant_key}
                  </option>
                ),
              )}
              {!result?.result.behavioral_diagnostics ? (
                <option value="control">control</option>
              ) : null}
            </select>
            <label htmlFor="campaign-lab-interview-agent">
              Agent evidence ID
            </label>
            <input
              id="campaign-lab-interview-agent"
              onChange={(event) => setInterviewAgentId(event.target.value)}
              placeholder="Populated after a successful simulation"
              value={interviewAgentId}
            />
            <label htmlFor="campaign-lab-interview-question">Question</label>
            <input
              id="campaign-lab-interview-question"
              onChange={(event) => setInterviewQuestion(event.target.value)}
              value={interviewQuestion}
            />
            <button disabled={busyStage === "interviews"} type="submit">
              {busyStage === "interviews"
                ? "Queueing interviewâ€¦"
                : "Queue synthetic interview"}
            </button>
          </form>
          {interviewRun ? (
            <p aria-live="polite" className="field-note">
              Interview: <strong>{interviewRun.status}</strong> Â·{" "}
              {interviewRun.progress}% Â· run <code>{interviewRun.id}</code>
            </p>
          ) : null}
          {interviewRun?.result ? (
            <pre className="field-note">
              {JSON.stringify(interviewRun.result, null, 2)}
            </pre>
          ) : null}
        </section>
      ) : null}
      {selectedCampaignId ? (
        <section className="panel" id="surveys" aria-labelledby="survey-title">
          <p className="eyebrow">06 / Survey import</p>
          <h2 id="survey-title">Import a consented aggregate survey</h2>
          <p className="field-note">
            Raw exports travel only inside the worker secret envelope. The
            public result is an aggregate dataset with provenance and quality
            counters.
          </p>
          <form className="form-stack" onSubmit={importSurvey}>
            <label htmlFor="campaign-lab-survey-file">Survey export</label>
            <input
              accept=".csv,.json"
              id="campaign-lab-survey-file"
              onChange={(event) =>
                setSurveyImportFile(event.target.files?.[0] ?? null)
              }
              required
              type="file"
            />
            <label htmlFor="campaign-lab-survey-format">Adapter</label>
            <select
              id="campaign-lab-survey-format"
              onChange={(event) => setSurveyImportFormat(event.target.value)}
              value={surveyImportFormat}
            >
              <option value="csv">CSV</option>
              <option value="generic_json">Generic JSON</option>
              <option value="formbricks">Formbricks JSON</option>
              <option value="odk">ODK JSON</option>
            </select>
            <label htmlFor="campaign-lab-survey-metadata">
              Survey provenance JSON
            </label>
            <textarea
              id="campaign-lab-survey-metadata"
              onChange={(event) => setSurveyMetadataJson(event.target.value)}
              rows={12}
              value={surveyMetadataJson}
            />
            <label htmlFor="campaign-lab-survey-field-map">
              Field map JSON
            </label>
            <textarea
              id="campaign-lab-survey-field-map"
              onChange={(event) => setSurveyFieldMapJson(event.target.value)}
              rows={10}
              value={surveyFieldMapJson}
            />
            <button disabled={busyStage === "surveys"} type="submit">
              {busyStage === "surveys"
                ? "Queueing surveyâ€¦"
                : "Queue survey import"}
            </button>
          </form>
          {surveyRun ? (
            <p aria-live="polite" className="field-note">
              Survey import: <strong>{surveyRun.status}</strong> Â·{" "}
              {surveyRun.progress}% Â· run <code>{surveyRun.id}</code>
            </p>
          ) : null}
        </section>
      ) : null}
      {selectedCampaignId ? (
        <section
          className="workspace-grid"
          id="calibration"
          aria-label="Survey calibration"
        >
          <form className="panel form-stack" onSubmit={runCalibration}>
            <p className="eyebrow">07 / Survey calibration</p>
            <h2>Compare synthetic and observed aggregates</h2>
            <label htmlFor="campaign-lab-synthetic-observations">
              Latest synthetic observations
            </label>
            <textarea
              id="campaign-lab-synthetic-observations"
              onChange={(event) =>
                setSyntheticObservationsJson(event.target.value)
              }
              rows={16}
              value={syntheticObservationsJson}
            />
            <label htmlFor="campaign-lab-survey-dataset">
              Aggregate survey dataset JSON
            </label>
            <textarea
              id="campaign-lab-survey-dataset"
              onChange={(event) => setSurveyDatasetJson(event.target.value)}
              rows={18}
              value={surveyDatasetJson}
            />
            <p className="field-note">
              After a successful import, SIMULA fills this field with the
              normalized aggregate dataset. No respondent rows are returned.
            </p>
            <button disabled={busyStage === "calibration"} type="submit">
              {busyStage === "calibration"
                ? "Queueing calibrationâ€¦"
                : "Queue calibration"}
            </button>
          </form>
          <div className="panel" aria-live="polite">
            <p className="eyebrow">Calibration run</p>
            {calibrationRun ? (
              <>
                <h2>{calibrationRun.status}</h2>
                <p>
                  {calibrationRun.stage} Â· {calibrationRun.progress}%
                </p>
                <p className="field-note">
                  <code>{calibrationRun.id}</code>
                </p>
                {calibrationRun.result ? (
                  <pre className="field-note">
                    {JSON.stringify(calibrationRun.result, null, 2)}
                  </pre>
                ) : null}
              </>
            ) : (
              <p>
                Queue calibration after a survey import or verified aggregate
                dataset is ready.
              </p>
            )}
          </div>
        </section>
      ) : null}
      {selectedCampaignId ? (
        <section
          className="panel"
          id="backtesting"
          aria-labelledby="backtest-title"
        >
          <p className="eyebrow">08 / Historical backtesting</p>
          <h2 id="backtest-title">Evaluate a held-out historical split</h2>
          <p className="field-note">
            Predictions stay blind in the public request. Held-out outcomes are
            sent only as worker secret payload and are never used to tune the
            run.
          </p>
          <form className="form-stack" onSubmit={runBacktest}>
            <label htmlFor="campaign-lab-backtest-protocol">
              Protocol JSON
            </label>
            <textarea
              id="campaign-lab-backtest-protocol"
              onChange={(event) => setBacktestProtocolJson(event.target.value)}
              rows={12}
              value={backtestProtocolJson}
            />
            <label htmlFor="campaign-lab-backtest-predictions">
              Blind prediction set JSON
            </label>
            <textarea
              id="campaign-lab-backtest-predictions"
              onChange={(event) =>
                setBacktestPredictionJson(event.target.value)
              }
              rows={16}
              value={backtestPredictionJson}
            />
            <label htmlFor="campaign-lab-backtest-outcomes">
              Held-out outcomes JSON
            </label>
            <textarea
              id="campaign-lab-backtest-outcomes"
              onChange={(event) => setBacktestOutcomesJson(event.target.value)}
              rows={18}
              value={backtestOutcomesJson}
            />
            <button disabled={busyStage === "backtesting"} type="submit">
              {busyStage === "backtesting"
                ? "Queueing backtestâ€¦"
                : "Queue held-out backtest"}
            </button>
          </form>
          {backtestRun ? (
            <p aria-live="polite" className="field-note">
              Backtest: <strong>{backtestRun.status}</strong> Â·{" "}
              {backtestRun.progress}% Â· run <code>{backtestRun.id}</code>
            </p>
          ) : null}
          {backtestRun?.result ? (
            <pre className="field-note">
              {JSON.stringify(backtestRun.result, null, 2)}
            </pre>
          ) : null}
        </section>
      ) : null}
      {selectedCampaignId ? (
        <section
          className="panel"
          id="compliance"
          aria-labelledby="compliance-title"
        >
          <p className="eyebrow">09 / Compliance review</p>
          <h2 id="compliance-title">Review aggregate-use controls</h2>
          <p className="field-note">
            Compliance is enforced before report approval. A report cannot enter
            approved experimental state without a succeeded review and named
            human reviewer.
          </p>
          <form className="form-stack" onSubmit={runCompliance}>
            <label htmlFor="campaign-lab-compliance-payload">
              Review payload JSON
            </label>
            <textarea
              id="campaign-lab-compliance-payload"
              onChange={(event) => setComplianceJson(event.target.value)}
              rows={12}
              value={complianceJson}
            />
            <label htmlFor="campaign-lab-compliance-reviewer">
              Reviewer name (optional for review queue)
            </label>
            <input
              id="campaign-lab-compliance-reviewer"
              onChange={(event) => setComplianceReviewer(event.target.value)}
              value={complianceReviewer}
            />
            <button disabled={busyStage === "compliance"} type="submit">
              {busyStage === "compliance"
                ? "Queueing reviewâ€¦"
                : "Queue compliance review"}
            </button>
          </form>
          {complianceRun ? (
            <p aria-live="polite" className="field-note">
              Compliance: <strong>{complianceRun.status}</strong> Â·{" "}
              {complianceRun.progress}% Â· run <code>{complianceRun.id}</code>
            </p>
          ) : null}
          {complianceRun?.result ? (
            <pre className="field-note">
              {JSON.stringify(complianceRun.result, null, 2)}
            </pre>
          ) : null}
        </section>
      ) : null}
      {selectedCampaignId ? (
        <section className="panel" id="reports" aria-labelledby="report-title">
          <p className="eyebrow">10 / Evidence report</p>
          <h2 id="report-title">Generate the cited report envelope</h2>
          <p className="field-note">
            Reports preserve component metrics, cohort findings, synthetic
            diagnostics, survey calibration, historical backtesting,
            limitations, citations, and human approval state. They do not
            collapse the result into an LLM-invented viral score.
          </p>
          <form className="form-stack" onSubmit={createReport}>
            <label htmlFor="campaign-lab-report-approval">Approval state</label>
            <select
              id="campaign-lab-report-approval"
              onChange={(event) => setReportApprovalStatus(event.target.value)}
              value={reportApprovalStatus}
            >
              <option value="draft">Draft</option>
              <option value="needs_human_review">Needs human review</option>
              <option value="approved_experimental">
                Approved experimental
              </option>
            </select>
            <label htmlFor="campaign-lab-report-reviewer">Human reviewer</label>
            <input
              id="campaign-lab-report-reviewer"
              onChange={(event) => setReportReviewer(event.target.value)}
              value={reportReviewer}
            />
            <p className="field-note">
              Attached run IDs: simulation {run?.id ?? "â€”"}, calibration{" "}
              {calibrationRun?.id ?? "â€”"}, backtest {backtestRun?.id ?? "â€”"},
              compliance {complianceRun?.id ?? "â€”"}.
            </p>
            <button disabled={busyStage === "reports"} type="submit">
              {busyStage === "reports"
                ? "Queueing reportâ€¦"
                : "Generate evidence report"}
            </button>
          </form>
          {reportRun ? (
            <div aria-live="polite">
              <p className="field-note">
                Report: <strong>{reportRun.status}</strong> Â·{" "}
                {reportRun.progress}% Â· run <code>{reportRun.id}</code>
              </p>
              {reportRun.result ? (
                <pre className="field-note">
                  {JSON.stringify(reportRun.result, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
      {selectedCampaignId ? (
        <section className="panel" id="audit" aria-labelledby="audit-title">
          <p className="eyebrow">11 / Audit trail</p>
          <h2 id="audit-title">Durable evidence events</h2>
          <p className="field-note">
            Queue, retry, progress, completion, and failure events are retained
            with the campaign. Use run IDs above to reproduce any terminal
            result.
          </p>
          {!audit?.items.length ? (
            <p>No campaign events recorded yet.</p>
          ) : null}
          <ol className="workflow-list">
            {(audit?.items ?? []).map((event, index) => (
              <li key={String(event.id ?? index)} className="is-active">
                <span>{String(event.progress ?? 0)}%</span>
                {String(event.event_kind ?? event.stage ?? "event")} Â·{" "}
                {String(event.message ?? "")}
              </li>
            ))}
          </ol>
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

