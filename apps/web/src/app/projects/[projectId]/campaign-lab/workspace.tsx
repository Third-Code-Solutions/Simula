"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { WorkspaceSidebar } from "@/app/workspace-sidebar";
import { complianceReviewInput } from "./governance";
import { StructuredEditor } from "./structured-editor";
import { RunHistory } from "./run-history";
import { BoundCalibration } from "./bound-calibration";
import { BoundBacktest } from "./bound-backtest";
import { BoundReport } from "./bound-report";
import styles from "./workspace.module.css";
import {
  ApiProblem,
  type CampaignLabAuditPage,
  type CampaignLabCampaign,
  type CampaignLabDurableRun,
  type CampaignLabForecastDataset,
  type CampaignLabResearchRun,
  type CampaignLabSimulationResult,
  type CampaignLabRunStatus,
  createCampaignLabCampaign,
  createCampaignLabAggregateForecast,
  createCampaignLabComplianceReview,
  createCampaignLabInterview,
  createCampaignLabNativeSurveyForm,
  createCampaignLabResearch,
  createCampaignLabSimulation,
  createCampaignLabSurveyImport,
  previewCampaignLabSurveyImport,
  type SurveyImportPreview,
  getCampaignLabAggregateForecastRun,
  getCampaignLabCampaign,
  getCampaignLabAudit,
  getCampaignLabComplianceRun,
  getCampaignLabInterviewRun,
  getCampaignLabResearchRun,
  getCampaignLabSimulationResults,
  getCampaignLabSimulationStatus,
  getCampaignLabSurveyImportRun,
  getMethodologyRegistry,
  getProject,
  listCampaignLabCampaigns,
  listCampaignLabForecastDatasets,
  submitCampaignLabNativeSurveyResponses,
  type MethodologyRegistry,
} from "@/lib/api";

const CAMPAIGN_LAB_STAGE_ANCHORS = [
  ["research-upload", "Research upload"],
  ["audience-cohorts", "Audience cohorts"],
  ["message-lab", "Message lab"],
  ["simulation-config", "Simulation configuration"],
  ["agent-activity", "Agent activity"],
  ["persona-interviews", "Persona interviews"],
  ["surveys", "Survey import"],
  ["calibration", "Survey calibration"],
  ["backtesting", "Historical backtesting"],
  ["forecasting", "Official forecast"],
  ["compliance", "Compliance review"],
  ["reports", "Evidence reports"],
  ["audit", "Audit trail"],
] as const;

type PopulationFrameSelection = Readonly<{
  frame: Record<string, unknown>;
  source: Record<string, unknown>;
}>;

function officialPopulationFrame(
  registry: MethodologyRegistry,
): PopulationFrameSelection | undefined {
  const row = registry.population_frames.find((candidate) => {
    if (!isRecord(candidate.manifest)) return false;
    const provenance = candidate.manifest.provenance;
    return (
      Array.isArray(provenance) &&
      provenance.some(
        (item) => isRecord(item) && item.source_id === "psa_openstat_cph_2020",
      )
    );
  });
  if (!row || !isRecord(row.manifest)) return undefined;

  const manifest = row.manifest;
  const provenance = Array.isArray(manifest.provenance)
    ? manifest.provenance.filter(isRecord)
    : [];
  const firstProvenance = provenance[0];
  const rawCells = Array.isArray(manifest.cells)
    ? manifest.cells.filter(isRecord)
    : [];
  if (
    typeof row.id !== "string" ||
    typeof row.population_frame_id !== "string" ||
    typeof row.version !== "number" ||
    typeof manifest.geography !== "string" ||
    typeof manifest.target_population !== "string" ||
    !Array.isArray(manifest.inclusion) ||
    !Array.isArray(manifest.exclusion) ||
    provenance.length === 0 ||
    rawCells.length === 0 ||
    !firstProvenance ||
    typeof firstProvenance.source_id !== "string" ||
    typeof firstProvenance.source_version !== "string"
  ) {
    return undefined;
  }

  const cells = rawCells.map((cell) => {
    if (!isRecord(cell.dimensions)) return cell;
    return {
      ...cell,
      dimensions: Object.entries(cell.dimensions)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([dimension, value]) => ({ dimension, value })),
    };
  });
  const limitations = [
    "This is an official historical population frame, not a campaign outcome benchmark.",
    "The engine uses only regional population weights; behavioral outputs remain synthetic until calibrated.",
    "The 2,098-person national-versus-regional difference is excluded and disclosed.",
  ];
  const sourceLimitations = [
    ...(Array.isArray(firstProvenance.coverage_limitations)
      ? firstProvenance.coverage_limitations.filter(
          (item): item is string => typeof item === "string",
        )
      : []),
    ...limitations,
  ].slice(0, 20);
  const sourceChecksum =
    typeof manifest.source_export_sha256 === "string"
      ? manifest.source_export_sha256
      : "0000000000000000000000000000000000000000000000000000000000000000";

  return {
    frame: {
      id: row.id,
      frame_id: row.population_frame_id,
      version: row.version,
      name: "PSA 2020 regional population frame",
      geography: manifest.geography,
      target_population: manifest.target_population,
      inclusion: manifest.inclusion,
      exclusion: manifest.exclusion,
      provenance,
      cells,
      validation_status: "experimental",
      limitations,
    },
    source: {
      source_id: firstProvenance.source_id,
      title: "PSA 2020 regional population frame",
      source_type: "public_dataset",
      source_organization:
        typeof firstProvenance.owner === "string"
          ? firstProvenance.owner
          : "Philippine Statistics Authority (PSA)",
      publication_date: null,
      dataset_version: firstProvenance.source_version,
      geography: manifest.geography,
      sample_size: null,
      collection_methodology: [
        firstProvenance.collection_period,
        firstProvenance.sampling_frame,
      ]
        .filter((item): item is string => typeof item === "string")
        .join(" "),
      license_or_usage_rights:
        typeof firstProvenance.license === "string"
          ? firstProvenance.license
          : "CC BY 4.0 for PSA/GOVPH content unless otherwise stated",
      processing_date: "2026-08-04T00:00:00Z",
      transformation: Array.isArray(firstProvenance.transformations)
        ? firstProvenance.transformations
            .filter((item): item is string => typeof item === "string")
            .join(" ")
        : "Normalized regional aggregate counts into population weights.",
      confidence_level: null,
      known_limitations: sourceLimitations,
      checksum_sha256: sourceChecksum,
      validation_status: "validated",
    },
  };
}

function starterRequest(
  campaignId: string,
  selectedPopulationFrame?: PopulationFrameSelection,
): Record<string, unknown> {
  const fixtureSource = {
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
  const fixturePopulationFrame = {
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
  };
  const source = selectedPopulationFrame?.source ?? fixtureSource;
  const populationFrame =
    selectedPopulationFrame?.frame ?? fixturePopulationFrame;
  const usingOfficialPopulationFrame = Boolean(selectedPopulationFrame);
  const cohortName = usingOfficialPopulationFrame
    ? "Philippine 17-region aggregate cohort"
    : "Philippine aggregate fixture cohort";
  const cohortDimensions = usingOfficialPopulationFrame
    ? [{ dimension: "region", value: "17_regions" }]
    : [{ dimension: "region", value: "national" }];
  const cohortLimitations = usingOfficialPopulationFrame
    ? [
        "Population weights use the cited PSA 2020 17-region frame.",
        "Behavioral outputs remain synthetic until real survey calibration is admitted.",
      ]
    : ["Fixture only; synthetic output is not human evidence."];
  return {
    campaign_id: campaignId,
    objective:
      "Compare two authored messages using aggregate population weighting.",
    purpose: "commercial_marketing",
    cohort: {
      cohort_id: "30000000-0000-4000-8000-000000000202",
      name: cohortName,
      geography: "Philippines",
      dimensions: cohortDimensions,
      population_frame: populationFrame,
      audience: {
        id: "30000000-0000-4000-8000-000000000205",
        audience_id: "30000000-0000-4000-8000-000000000206",
        version: 1,
        name: usingOfficialPopulationFrame
          ? "All PSA regional cells"
          : "All declared aggregate cells",
        criteria: [],
        minimum_cell_weight: 0,
        provenance_status: usingOfficialPopulationFrame ? "verified" : "demo",
        limitations: usingOfficialPopulationFrame
          ? ["Empty criteria admits every cited PSA regional cell."]
          : ["Fixture audience only."],
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
      known_limitations: cohortLimitations,
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
      research_corpus_version: usingOfficialPopulationFrame
        ? "psa_openstat_cph_2020-table_1_9_2020"
        : "fixture-v1",
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
    consent_recorded: false,
    authorized_for_calibration: false,
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

const nativeSurveyFormExample = JSON.stringify(
  {
    version: 1,
    title: "Native message calibration",
    description: "Consented aggregate message-testing survey.",
    language: "taglish",
    consent_text: "I agree to aggregate research use.",
    privacy_notice:
      "No identity, contact, political-affiliation, or free-text fields.",
    provenance: {
      source_id: "simula_native_survey",
      source_version: "v1",
      owner: "Research owner",
      license: "Consented internal research",
      allowed_uses: ["survey calibration"],
      collection_period: "2026-Q3",
      geography: "Philippines",
      methodology: "Describe the consented aggregate message-test method.",
      consent_recorded: false,
      authorized_for_calibration: false,
      quality_filter_version: "native_response_quality_v1",
      known_biases: ["Document sample bias."],
      coverage_limitations: ["Not a population estimate."],
    },
    questions: [
      {
        key: "variant_key",
        kind: "variant",
        label: "Which message did you see?",
        options: ["control", "variant_a"],
      },
      {
        key: "cohort_key",
        kind: "cohort",
        label: "Aggregate cohort",
        options: ["metro", "visayas"],
      },
      {
        key: "reaction",
        kind: "reaction",
        label: "Initial reaction",
        options: ["positive", "neutral", "negative", "mixed"],
      },
      { key: "clarity", kind: "metric", label: "Clarity (0-100)" },
      { key: "relevance", kind: "metric", label: "Relevance (0-100)" },
      { key: "trust", kind: "metric", label: "Trust (0-100)" },
      {
        key: "persuasiveness",
        kind: "metric",
        label: "Persuasiveness (0-100)",
      },
      {
        key: "consideration",
        kind: "metric",
        label: "Consideration (0-100)",
      },
      {
        key: "share_intent",
        kind: "share_intent",
        label: "Share intent (0-1 or 0-100)",
        required: false,
      },
      { key: "consent", kind: "consent", label: "Consent" },
    ],
    max_batch_size: 100,
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

export function useDurableRunPolling<T extends CampaignLabDurableRun>(
  run: T | undefined,
  fetchRun: (runId: string, signal?: AbortSignal) => Promise<T>,
  onUpdate: (nextRun: T) => void | Promise<void>,
  onError: (error: unknown) => void,
) {
  const [retryAttempt, setRetryAttempt] = useState(0);
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onErrorRef.current = onError;
  }, [onError, onUpdate]);
  const runId = run?.id;
  const active =
    !!run && ["queued", "running", "retrying"].includes(run.status);
  useEffect(() => {
    if (!runId || !active) return;
    let stale = false;
    const controller = new AbortController();
    let timer: number;
    const poll = async () => {
      try {
        const nextRun = await fetchRun(runId, controller.signal);
        if (stale) return;
        await onUpdateRef.current(nextRun);
        if (
          !stale &&
          ["queued", "running", "retrying"].includes(nextRun.status)
        ) {
          timer = window.setTimeout(() => {
            void poll();
          }, 2000);
        }
      } catch (pollError) {
        if (!stale) onErrorRef.current(pollError);
        // Stop after a failed request; an explicit retry avoids silent auth loops.
      }
    };
    timer = window.setTimeout(() => {
      void poll();
    }, 2000);
    return () => {
      stale = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetchRun, runId, active, retryAttempt]);
  return () => setRetryAttempt((attempt) => attempt + 1);
}

function AggregateForecastResult({
  result,
}: Readonly<{ result: Readonly<Record<string, unknown>> }>) {
  const predictions = Array.isArray(result.predictions)
    ? result.predictions.filter(isRecord)
    : [];
  const backtest = isRecord(result.backtest) ? result.backtest : undefined;
  const evidenceStatus =
    typeof result.evidence_status === "string"
      ? result.evidence_status.replaceAll("_", " ")
      : "unknown";
  return (
    <div aria-live="polite" className="panel">
      <p className="eyebrow">Official aggregate forecast</p>
      <h3>{evidenceStatus}</h3>
      <p className="field-note">
        Respondent data used: <strong>no</strong>. Strict walk-forward MAE:{" "}
        <strong>
          {typeof backtest?.mae === "number"
            ? `${backtest.mae.toFixed(2)} points`
            : "insufficient holdouts"}
        </strong>
        .
      </p>
      {predictions.length > 0 ? (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th scope="col">Option</th>
                <th scope="col">Forecast</th>
                <th scope="col">Uncertainty interval</th>
                <th scope="col">Scope sensitivity</th>
                <th scope="col">Geography</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((prediction) => {
                const option = String(prediction.option_key ?? "unknown");
                const share = prediction.predicted_vote_share;
                const lower = prediction.interval_lower;
                const upper = prediction.interval_upper;
                const scopeLower = prediction.scope_sensitivity_lower;
                const scopeUpper = prediction.scope_sensitivity_upper;
                return (
                  <tr key={`${String(prediction.geography_key)}-${option}`}>
                    <th scope="row">{option.replaceAll("_", " ")}</th>
                    <td>
                      {typeof share === "number" ? `${share.toFixed(1)}%` : "—"}
                    </td>
                    <td>
                      {typeof lower === "number" && typeof upper === "number"
                        ? `${lower.toFixed(1)}–${upper.toFixed(1)}%`
                        : "—"}
                    </td>
                    <td>
                      {typeof scopeLower === "number" &&
                      typeof scopeUpper === "number"
                        ? `${scopeLower.toFixed(1)}–${scopeUpper.toFixed(1)}%`
                        : "—"}
                    </td>
                    <td>{String(prediction.geography_key ?? "unknown")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="field-note">
        Retrospective aggregate association only. Not a sealed out-of-time
        validation, person-level prediction, or causal proof that a message
        persuades anyone.
      </p>
    </div>
  );
}

export function CampaignLabSelectionNotice() {
  return (
    <section
      aria-labelledby="campaign-lab-selection-title"
      className="panel"
      id="research"
    >
      <p className="eyebrow">Campaign Lab stages</p>
      <h2 id="campaign-lab-selection-title">
        Select a workspace to open the workflow
      </h2>
      <p className="field-note">
        Start a message test above, then work through four tasks. Your sources,
        experimental results, and review history stay with that campaign.
      </p>
      <ol className="workflow-list">
        {[
          "Prepare your sources",
          "Test authored messages",
          "Add observed evidence",
          "Review the limitations",
        ].map((label, index) => (
          <li key={label}>
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {CAMPAIGN_LAB_STAGE_ANCHORS.map(([id]) => (
        <span id={id} key={id} aria-hidden="true" />
      ))}
    </section>
  );
}

function readCampaignSelection() {
  return new URL(window.location.href).searchParams.get("campaign") ?? "";
}
function subscribeCampaignSelection(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener("simula-campaign-selection", listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener("simula-campaign-selection", listener);
  };
}

export function CampaignLabWorkspace({
  projectId,
}: Readonly<{ projectId: string }>) {
  const selection = useSyncExternalStore(
    subscribeCampaignSelection,
    readCampaignSelection,
    () => undefined,
  );
  if (selection === undefined)
    return (
      <main className="workspace-main" id="main-content">
        <p role="status">Loading campaign workspace...</p>
      </main>
    );
  function selectCampaign(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("campaign", id);
    for (const kind of [
      "simulation",
      "calibration",
      "report",
      "research",
      "survey",
      "forecast",
      "compliance",
      "interview",
    ])
      url.searchParams.delete(kind);
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event("simula-campaign-selection"));
  }
  return (
    <CampaignLabSession
      key={`${projectId}:${selection ?? "initial"}`}
      projectId={projectId}
      initialCampaignId={selection}
      onCampaignChange={selectCampaign}
    />
  );
}

function loadCampaignContext(projectId: string) {
  return Promise.all([
    listCampaignLabCampaigns(projectId),
    getMethodologyRegistry(),
    getProject(projectId).catch(() => undefined),
    listCampaignLabForecastDatasets()
      .then((page) => ({ page, error: undefined as string | undefined }))
      .catch((error: unknown) => ({
        page: { items: [] },
        error: problemMessage(error),
      })),
  ]);
}

function CampaignLabSession({
  projectId,
  initialCampaignId,
  onCampaignChange,
}: Readonly<{
  projectId: string;
  initialCampaignId?: string;
  onCampaignChange: (id: string) => void;
}>) {
  const initialization = useRef<ReturnType<typeof loadCampaignContext> | null>(
    null,
  );
  const [historyRevision, setHistoryRevision] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const commandKeys = useRef(
    new Map<string, { fingerprint: string; key: string }>(),
  );
  function commandKey(operation: string, payload: unknown) {
    const fingerprint = JSON.stringify(payload);
    const existing = commandKeys.current.get(operation);
    if (existing?.fingerprint === fingerprint) return existing.key;
    const key = crypto.randomUUID();
    commandKeys.current.set(operation, { fingerprint, key });
    return key;
  }
  const [view, setView] = useState("prepare");
  useEffect(() => {
    const followHash = () => {
      const id = window.location.hash.slice(1);
      if (
        [
          "audience-cohorts",
          "message-lab",
          "simulation-config",
          "agent-activity",
          "results",
          "persona-interviews",
        ].includes(id)
      )
        setView("simulate");
      else if (
        ["surveys", "calibration", "backtesting", "forecasting"].includes(id)
      )
        setView("evidence");
      else if (["compliance", "reports", "audit"].includes(id))
        setView("review");
      else setView("prepare");
    };
    followHash();
    window.addEventListener("hashchange", followHash);
    return () => window.removeEventListener("hashchange", followHash);
  }, []);
  function rememberRun(kind: string, runId: string) {
    if (!mounted.current) return;
    const url = new URL(window.location.href);
    url.searchParams.set("campaign", selectedCampaignId);
    url.searchParams.set(kind, runId);
    window.history.replaceState(null, "", url);
  }
  const [organizationId, setOrganizationId] = useState<string>();
  const [campaigns, setCampaigns] = useState<
    ReadonlyArray<CampaignLabCampaign>
  >([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [campaignOffset, setCampaignOffset] = useState(0);
  const [moreCampaigns, setMoreCampaigns] = useState(false);
  const [loadingMoreCampaigns, setLoadingMoreCampaigns] = useState(false);
  const [run, setRun] = useState<CampaignLabRunStatus>();
  const [result, setResult] = useState<CampaignLabSimulationResult>();
  const [resultLoadAttempt, setResultLoadAttempt] = useState(0);
  const [requestText, setRequestText] = useState("");
  const [selectedPopulationFrame, setSelectedPopulationFrame] =
    useState<PopulationFrameSelection>();
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
  const [surveySourceVersionId, setSurveySourceVersionId] = useState("");
  const [surveyRun, setSurveyRun] = useState<CampaignLabDurableRun>();
  const [nativeSurveyFormJson, setNativeSurveyFormJson] = useState(
    nativeSurveyFormExample,
  );
  const [nativeSurveyFormId, setNativeSurveyFormId] = useState("");
  const [nativeSurveyResponsesJson, setNativeSurveyResponsesJson] =
    useState("[]");
  const [forecastDatasets, setForecastDatasets] = useState<
    ReadonlyArray<CampaignLabForecastDataset>
  >([]);
  const [forecastDatasetId, setForecastDatasetId] = useState("");
  const [forecastTargetsJson, setForecastTargetsJson] = useState("[]");
  const [forecastRun, setForecastRun] = useState<CampaignLabDurableRun>();
  const [forecastDatasetError, setForecastDatasetError] = useState<string>();
  const [complianceJson, setComplianceJson] = useState(complianceExample);
  const [complianceRun, setComplianceRun] = useState<CampaignLabDurableRun>();
  const [interviewVariantKey, setInterviewVariantKey] = useState("control");
  const [interviewAgentId, setInterviewAgentId] = useState("");
  const [interviewQuestion, setInterviewQuestion] = useState(
    "What happened in this simulation?",
  );
  const [interviewRun, setInterviewRun] = useState<CampaignLabDurableRun>();
  const [busyStage, setBusyStage] = useState<string>();
  const [audit, setAudit] = useState<CampaignLabAuditPage>();

  const adoptResearchRun = useCallback((nextRun: CampaignLabResearchRun) => {
    setResearchRun(nextRun);
    const graph = nextRun.result?.knowledge_graph;
    const source = nextRun.result?.source;
    if (
      nextRun.status !== "succeeded" ||
      !isRecord(graph) ||
      !isRecord(source)
    ) {
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
        const sourceId =
          typeof source.source_id === "string" ? source.source_id : null;
        const nextSources = sourceId
          ? [
              ...existingSources.filter((item) => item.source_id !== sourceId),
              source,
            ]
          : existingSources;
        const nextKnowledge = sourceId
          ? [
              ...existingKnowledge.filter(
                (item) => item.source_id !== sourceId,
              ),
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
  }, []);

  const complianceFetcher = useMemo(
    () => (runId: string, signal?: AbortSignal) =>
      selectedCampaignId
        ? getCampaignLabComplianceRun(selectedCampaignId, runId, signal)
        : Promise.reject(new Error("Select a Campaign Lab workspace first.")),
    [selectedCampaignId],
  );

  const retrySurvey = useDurableRunPolling(
    surveyRun,
    getCampaignLabSurveyImportRun,
    setSurveyRun,
    (pollError) => setError(problemMessage(pollError)),
  );
  const retryForecast = useDurableRunPolling(
    forecastRun,
    getCampaignLabAggregateForecastRun,
    setForecastRun,
    (pollError) => setError(problemMessage(pollError)),
  );
  const retryCompliance = useDurableRunPolling(
    complianceRun,
    complianceFetcher,
    setComplianceRun,
    (pollError) => setError(problemMessage(pollError)),
  );
  const retryInterview = useDurableRunPolling(
    interviewRun,
    getCampaignLabInterviewRun,
    setInterviewRun,
    (pollError) => setError(problemMessage(pollError)),
  );

  useEffect(() => {
    let stale = false;
    initialization.current ??= loadCampaignContext(projectId);
    void initialization.current
      .then(async ([page, registry, project, forecast]) => {
        const forecastDatasetPage = forecast.page;
        if (stale) return;
        setForecastDatasetError(forecast.error);
        let items = page.items;
        if (
          initialCampaignId &&
          !items.some((item) => campaignId(item) === initialCampaignId)
        ) {
          const detail = await getCampaignLabCampaign(initialCampaignId);
          if (stale) return;
          if (detail.campaign.project_id !== projectId)
            throw new Error("Campaign does not belong to this project");
          items = [detail.campaign, ...items];
        }
        setCampaignOffset(page.items.length);
        setMoreCampaigns(page.items.length >= (page.pagination?.limit ?? 50));
        const nextPopulationFrame = officialPopulationFrame(registry);
        const nextForecastDataset = forecastDatasetPage.items[0];
        setCampaigns(items);
        setOrganizationId(
          project?.organization_id ?? page.items[0]?.organization_id,
        );
        setSelectedPopulationFrame(nextPopulationFrame);
        setForecastDatasets(forecastDatasetPage.items);
        if (nextForecastDataset) {
          setForecastDatasetId(nextForecastDataset.id);
          const defaultTargets = nextForecastDataset.manifest.default_targets;
          if (Array.isArray(defaultTargets)) {
            setForecastTargetsJson(JSON.stringify(defaultTargets, null, 2));
          }
        }
        const first =
          items.find(
            (campaign) => campaignId(campaign) === initialCampaignId,
          ) ?? items[0];
        if (first) {
          const id = campaignId(first);
          setSelectedCampaignId(id);
          setRequestText(
            JSON.stringify(starterRequest(id, nextPopulationFrame), null, 2),
          );
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
  }, [projectId, initialCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId) {
      return;
    }
    let stale = false;
    void getCampaignLabAudit(selectedCampaignId)
      .then((nextAudit) => {
        if (!stale) setAudit(nextAudit);
      })
      .catch((auditError: unknown) => {
        if (!stale) setError(problemMessage(auditError));
      });
    return () => {
      stale = true;
    };
  }, [selectedCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId) return;
    const params = new URL(window.location.href).searchParams;
    if (params.get("campaign") !== selectedCampaignId) return;
    let stale = false;
    const controller = new AbortController();
    const restore = <T extends CampaignLabDurableRun>(
      kind: string,
      fetchRun: (id: string, signal?: AbortSignal) => Promise<T>,
      update: (run: T) => void,
    ) => {
      const id = params.get(kind);
      if (!id) return;
      void fetchRun(id, controller.signal)
        .then((saved) => {
          if (!stale && saved.campaign_id === selectedCampaignId) update(saved);
        })
        .catch((restoreError: unknown) => {
          if (!stale) setError(problemMessage(restoreError));
        });
    };
    restore("simulation", getCampaignLabSimulationStatus, setRun);
    restore("research", getCampaignLabResearchRun, adoptResearchRun);
    restore("survey", getCampaignLabSurveyImportRun, setSurveyRun);
    restore("forecast", getCampaignLabAggregateForecastRun, setForecastRun);
    restore("compliance", complianceFetcher, setComplianceRun);
    restore("interview", getCampaignLabInterviewRun, setInterviewRun);
    return () => {
      stale = true;
      controller.abort();
    };
  }, [selectedCampaignId, complianceFetcher, adoptResearchRun]);

  async function loadMoreCampaigns() {
    setLoadingMoreCampaigns(true);
    try {
      const page = await listCampaignLabCampaigns(projectId, campaignOffset);
      if (!mounted.current) return;
      setCampaigns((current) => [
        ...current,
        ...page.items.filter(
          (item) =>
            !current.some(
              (existing) => campaignId(existing) === campaignId(item),
            ),
        ),
      ]);
      setCampaignOffset((offset) => offset + page.items.length);
      setMoreCampaigns(page.items.length >= page.pagination.limit);
    } catch (loadError) {
      if (mounted.current) setError(problemMessage(loadError));
    } finally {
      if (mounted.current) setLoadingMoreCampaigns(false);
    }
  }

  async function reopenRun(saved: CampaignLabRunStatus) {
    if (saved.campaign_id !== selectedCampaignId)
      throw new Error("Campaign mismatch");
    const fetchers = {
      repeated_simulation: getCampaignLabSimulationStatus,
      research_ingestion: getCampaignLabResearchRun,
      survey_import: getCampaignLabSurveyImportRun,
      aggregate_forecast: getCampaignLabAggregateForecastRun,
      compliance_review: complianceFetcher,
      interview: getCampaignLabInterviewRun,
    };
    if (!(saved.run_type in fetchers))
      throw new Error("This activity cannot be reopened");
    const next = await fetchers[saved.run_type as keyof typeof fetchers](
      saved.id,
    );
    if (!mounted.current) return;
    if (next.campaign_id !== selectedCampaignId)
      throw new Error("Campaign mismatch");
    switch (saved.run_type) {
      case "repeated_simulation":
        setResultLoadAttempt((attempt) => attempt + 1);
        setResult(undefined);
        setRun(next);
        rememberRun("simulation", next.id);
        setView("simulate");
        break;
      case "research_ingestion":
        adoptResearchRun({
          ...next,
          result:
            "result" in next && isRecord(next.result) ? next.result : undefined,
        });
        rememberRun("research", next.id);
        setView("prepare");
        break;
      case "survey_import":
        setSurveyRun(next);
        rememberRun("survey", next.id);
        setView("evidence");
        break;
      case "aggregate_forecast":
        setForecastRun(next);
        rememberRun("forecast", next.id);
        setView("evidence");
        break;
      case "compliance_review":
        setComplianceRun(next);
        rememberRun("compliance", next.id);
        setView("review");
        break;
      case "interview":
        setInterviewRun(next);
        rememberRun("interview", next.id);
        setView("simulate");
        break;
    }
  }

  function adoptSimulationResult(nextResult: CampaignLabSimulationResult) {
    setResult(nextResult);
    const diagnostics = nextResult.result.behavioral_diagnostics;
    const firstVariant = diagnostics?.variants[0];
    const firstAgent = firstVariant?.interviewable_agents[0];
    if (firstVariant) setInterviewVariantKey(firstVariant.variant_key);
    if (firstAgent) setInterviewAgentId(firstAgent.agent_id);
  }

  const retrySimulation = useDurableRunPolling(
    run,
    getCampaignLabSimulationStatus,
    (nextRun) => {
      setRun(nextRun);
    },
    (pollError) => setError(problemMessage(pollError)),
  );

  const completedRunId = run?.status === "succeeded" ? run.id : undefined;
  useEffect(() => {
    if (!completedRunId) return;
    let stale = false;
    let timer: number | undefined;
    let attempts = 0;
    const controller = new AbortController();
    const loadResult = async () => {
      attempts += 1;
      try {
        const nextResult = await getCampaignLabSimulationResults(
          completedRunId,
          controller.signal,
        );
        if (!stale) adoptSimulationResult(nextResult);
      } catch (resultError) {
        if (stale) return;
        if (
          resultError instanceof ApiProblem &&
          resultError.status === 429 &&
          resultError.retryAfterSeconds &&
          resultError.retryAfterSeconds <= 10 &&
          attempts < 3
        ) {
          timer = window.setTimeout(() => {
            void loadResult();
          }, resultError.retryAfterSeconds * 1000);
        } else setError(problemMessage(resultError));
      }
    };
    void loadResult();
    return () => {
      stale = true;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [completedRunId, resultLoadAttempt]);

  const retryResearch = useDurableRunPolling(
    researchRun,
    getCampaignLabResearchRun,
    adoptResearchRun,
    (pollError) => setError(problemMessage(pollError)),
  );

  async function createCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const name = form.get("name");
    const objective = form.get("objective");
    if (typeof name !== "string" || typeof objective !== "string") return;
    setSaving(true);
    setError(undefined);
    try {
      const payload = {
        project_id: projectId,
        name,
        objective,
        purpose: "commercial_marketing",
        decision: { decision: "compare_authored_variants" },
      };
      const created = await createCampaignLabCampaign(
        payload,
        commandKey("campaign", payload),
      );
      if (!mounted.current) return;
      commandKeys.current.delete("campaign");
      setHistoryRevision((revision) => revision + 1);
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
      setRequestText(
        JSON.stringify(starterRequest(id, selectedPopulationFrame), null, 2),
      );
      formElement.reset();
      onCampaignChange(id);
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
    if (!selectedPopulationFrame) {
      setError(
        "The cited PSA 2020 population frame is unavailable; simulation launch is blocked.",
      );
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
        commandKey("simulation", parsed),
      );
      if (!mounted.current) return;
      commandKeys.current.delete("simulation");
      setHistoryRevision((revision) => revision + 1);
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
        retention_until: null,
      } satisfies CampaignLabRunStatus;
      rememberRun("simulation", nextRun.id);
      setRun(nextRun);
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
    const formElement = event.currentTarget;
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
      const payload = {
        title: researchFile.name,
        payload: {},
        provenance: source,
        source,
        filename: researchFile.name,
        media_type: mediaType,
        chunk_size: 1200,
        overlap: 120,
        secret_payload: secretPayload,
      };
      const created = await createCampaignLabResearch(
        selectedCampaignId,
        payload,
        commandKey("research", payload),
      );
      if (!mounted.current) return;
      commandKeys.current.delete("research");
      setHistoryRevision((revision) => revision + 1);
      if (!created.run_id) {
        throw new Error("Research ingestion did not return a run id.");
      }
      rememberRun("research", created.run_id);
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
        retention_until: null,
      });
      setResearchFile(null);
      formElement.reset();
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

  const [surveyPreview, setSurveyPreview] = useState<{
    file: File;
    config: string;
    data: SurveyImportPreview;
  }>();
  const surveyPreviewConfig = JSON.stringify([
    surveyImportFormat,
    surveyMetadataJson,
    surveyFieldMapJson,
    surveySourceVersionId,
  ]);
  const currentSurveyPreview =
    surveyPreview?.file === surveyImportFile &&
    surveyPreview.config === surveyPreviewConfig
      ? surveyPreview.data
      : undefined;

  async function importSurvey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!selectedCampaignId || !surveyImportFile) {
      setError("Select a Campaign Lab and a survey export first.");
      return;
    }
    setBusyStage("surveys");
    setError(undefined);
    try {
      const metadata = JSON.parse(surveyMetadataJson) as Record<
        string,
        unknown
      >;
      const fieldMap = JSON.parse(surveyFieldMapJson) as Record<
        string,
        unknown
      >;
      if (surveyImportFile.size > 200_000) {
        throw new Error("Choose a survey export of at most 200 KB.");
      }
      const rawText = await surveyImportFile.text();
      const rawPayload =
        surveyImportFormat === "csv" ? rawText : JSON.parse(rawText);
      const payload = {
        format: surveyImportFormat,
        metadata,
        field_map: fieldMap,
        source_version_id: surveySourceVersionId.trim() || undefined,
        secret_payload: { payload: rawPayload },
      };
      if (!currentSurveyPreview) {
        const data = await previewCampaignLabSurveyImport(
          selectedCampaignId,
          payload,
        );
        if (!mounted.current) return;
        setSurveyPreview({
          file: surveyImportFile,
          config: surveyPreviewConfig,
          data,
        });
        return;
      }
      const created = await createCampaignLabSurveyImport(
        selectedCampaignId,
        payload,
        commandKey("survey", payload),
      );
      if (!mounted.current) return;
      commandKeys.current.delete("survey");
      setHistoryRevision((revision) => revision + 1);
      setSurveyRun(commandRun(created, selectedCampaignId, "survey_import"));
      if (created.run_id) rememberRun("survey", created.run_id);
      setSurveyImportFile(null);
      formElement.reset();
    } catch (importError) {
      setError(
        importError instanceof SyntaxError
          ? "Survey metadata, field map, or JSON export is not valid."
          : problemMessage(importError),
      );
    } finally {
      setBusyStage(undefined);
    }
  }

  async function createNativeSurveyForm(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!selectedCampaignId) {
      setError("Create or select a Campaign Lab workspace first.");
      return;
    }
    setBusyStage("native-survey-form");
    setError(undefined);
    try {
      const form = JSON.parse(nativeSurveyFormJson);
      if (!isRecord(form)) {
        throw new Error("Native survey form must be a JSON object.");
      }
      const created = await createCampaignLabNativeSurveyForm(
        selectedCampaignId,
        form,
        commandKey("native-form", form),
      );
      if (!mounted.current) return;
      commandKeys.current.delete("native-form");
      setHistoryRevision((revision) => revision + 1);
      if (!created.artifact_id) {
        throw new Error("Native survey form did not return a form id.");
      }
      setNativeSurveyFormId(created.artifact_id);
    } catch (formError) {
      setError(
        formError instanceof SyntaxError
          ? "Native survey form JSON is not valid."
          : problemMessage(formError),
      );
    } finally {
      setBusyStage(undefined);
    }
  }

  async function submitNativeSurveyResponses(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!selectedCampaignId || !nativeSurveyFormId.trim()) {
      setError("Create or enter a native survey form id first.");
      return;
    }
    setBusyStage("native-survey-responses");
    setError(undefined);
    try {
      const responses = JSON.parse(nativeSurveyResponsesJson);
      if (!Array.isArray(responses) || responses.length === 0) {
        throw new Error("Native survey responses must be a JSON array.");
      }
      const created = await submitCampaignLabNativeSurveyResponses(
        selectedCampaignId,
        nativeSurveyFormId.trim(),
        responses,
        commandKey("responses", {
          formId: nativeSurveyFormId.trim(),
          responses,
        }),
      );
      if (!mounted.current) return;
      commandKeys.current.delete("responses");
      setHistoryRevision((revision) => revision + 1);
      setSurveyRun(commandRun(created, selectedCampaignId, "survey_import"));
      if (created.run_id) rememberRun("survey", created.run_id);
    } catch (responseError) {
      setError(
        responseError instanceof SyntaxError
          ? "Native survey response JSON is not valid."
          : problemMessage(responseError),
      );
    } finally {
      setBusyStage(undefined);
    }
  }

  async function runAggregateForecast(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCampaignId) {
      setError("Create or choose a message test first.");
      return;
    }
    if (!forecastDatasetId) {
      setError("No admitted official aggregate forecast dataset is available.");
      return;
    }
    setBusyStage("forecasting");
    setError(undefined);
    try {
      const targets = JSON.parse(forecastTargetsJson);
      if (!Array.isArray(targets) || targets.length < 2) {
        throw new Error(
          "Official forecast targets must contain at least two options.",
        );
      }
      const payload = {
        dataset_id: forecastDatasetId,
        model_version: "aggregate_trend_v1",
        targets,
      };
      const created = await createCampaignLabAggregateForecast(
        selectedCampaignId,
        payload,
        commandKey("forecast", payload),
      );
      if (!mounted.current) return;
      commandKeys.current.delete("forecast");
      setHistoryRevision((revision) => revision + 1);
      setForecastRun(
        commandRun(created, selectedCampaignId, "aggregate_forecast"),
      );
      if (created.run_id) rememberRun("forecast", created.run_id);
    } catch (forecastError) {
      setError(
        forecastError instanceof SyntaxError
          ? "The official forecast targets are not valid JSON."
          : problemMessage(forecastError),
      );
    } finally {
      setBusyStage(undefined);
    }
  }

  async function runCompliance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCampaignId) {
      setError("Create or select a Campaign Lab workspace first.");
      return;
    }
    setBusyStage("compliance");
    setError(undefined);
    try {
      const payload = JSON.parse(complianceJson);
      const created = await createCampaignLabComplianceReview(
        selectedCampaignId,
        complianceReviewInput(payload),
        commandKey("compliance", complianceReviewInput(payload)),
      );
      if (!mounted.current) return;
      commandKeys.current.delete("compliance");
      setHistoryRevision((revision) => revision + 1);
      setComplianceRun(
        commandRun(created, selectedCampaignId, "compliance_review"),
      );
      if (created.run_id) rememberRun("compliance", created.run_id);
    } catch (complianceError) {
      setError(
        complianceError instanceof SyntaxError
          ? "Compliance JSON is not valid."
          : problemMessage(complianceError),
      );
    } finally {
      setBusyStage(undefined);
    }
  }

  async function createInterview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCampaignId || !run?.id || !interviewAgentId) {
      setError(
        "Run a successful simulation and select an interview agent first.",
      );
      return;
    }
    setBusyStage("interviews");
    setError(undefined);
    try {
      const payload = {
        source_run_id: run.id,
        agent_id: interviewAgentId,
        variant_key: interviewVariantKey,
        question: interviewQuestion,
        prompt_version: "campaign-lab-interview-v1",
      };
      const created = await createCampaignLabInterview(
        selectedCampaignId,
        payload,
        commandKey("interview", payload),
      );
      if (!mounted.current) return;
      commandKeys.current.delete("interview");
      setHistoryRevision((revision) => revision + 1);
      setInterviewRun(commandRun(created, selectedCampaignId, "interview"));
      if (created.run_id) rememberRun("interview", created.run_id);
    } catch (interviewError) {
      setError(problemMessage(interviewError));
    } finally {
      setBusyStage(undefined);
    }
  }

  return (
    <main
      className={`workspace-main workspace-main-wide ${styles.workspace}`}
      data-view={view}
      id="main-content"
      tabIndex={-1}
    >
      <header className="workspace-header" id="overview">
        <Link className="wordmark" href={`/projects/${projectId}`}>
          SIMULA
        </Link>
      </header>
      <WorkspaceSidebar
        current="campaign-lab"
        organizationId={organizationId}
        projectId={projectId}
      />
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href={`/projects/${projectId}`}>Project workspace</Link>
        <span aria-hidden="true"> / </span>
        <span>Campaign Simulation Lab</span>
      </nav>
      <section aria-labelledby="campaign-lab-title" className="workspace-intro">
        <div>
          <p className="eyebrow">Aggregate research · Philippines</p>
          <h1 id="campaign-lab-title">Campaign Simulation Lab</h1>
          <p className="lede">
            Build a message test, compare experimental results, and check the
            evidence before making a decision.
          </p>
        </div>
        <div className="panel">
          <strong>
            Population frame:{" "}
            {selectedPopulationFrame ? "PSA 2020" : "unavailable"}
          </strong>
          <p className="field-note">
            No individual voter records. Behavioral output remains
            synthetic-only. No final viral score. No vote-share claim.
          </p>
        </div>
      </section>
      {error ? (
        <div className="problem" role="alert">
          <p>{error}</p>
          <button
            className="button-quiet"
            type="button"
            onClick={() => {
              setError(undefined);
              retrySurvey();
              retryForecast();
              retryCompliance();
              retryInterview();
              retrySimulation();
              retryResearch();
              setResultLoadAttempt((attempt) => attempt + 1);
            }}
          >
            Retry loading
          </button>
        </div>
      ) : null}
      <section className="workspace-grid" aria-label="Campaign Lab setup">
        <details className="panel" open={campaigns.length === 0}>
          <summary>Create a new message test</summary>
          <form className="form-stack" onSubmit={createCampaign}>
            <p className="eyebrow">01 / Campaign definition</p>
            <h2>Start a message test</h2>
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
              {saving ? "Saving…" : "Create message test"}
            </button>
          </form>
        </details>
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
                  aria-pressed={id === selectedCampaignId}
                  disabled={saving || running || researchBusy || !!busyStage}
                  key={id}
                  onClick={() => onCampaignChange(id)}
                  type="button"
                >
                  {campaign.name} · {campaign.status}
                </button>
              );
            })}
            {moreCampaigns ? (
              <button
                className="button-quiet"
                type="button"
                disabled={loadingMoreCampaigns}
                onClick={() => {
                  void loadMoreCampaigns();
                }}
              >
                {loadingMoreCampaigns
                  ? "Loading more campaigns..."
                  : "Load more campaigns"}
              </button>
            ) : null}
          </div>
        </div>
      </section>
      {selectedCampaignId ? (
        <RunHistory
          campaignId={selectedCampaignId}
          onOpen={reopenRun}
          revision={String(historyRevision)}
        />
      ) : null}
      <nav aria-label="Campaign tasks" className={styles.taskNav}>
        {[
          ["prepare", "research-upload", "1. Prepare"],
          ["simulate", "audience-cohorts", "2. Test messages"],
          ["evidence", "surveys", "3. Add evidence"],
          ["review", "compliance", "4. Review"],
        ].map(([key, anchor, label]) => (
          <a
            key={key}
            href={`#${anchor}`}
            aria-current={view === key ? "page" : undefined}
            onClick={() => setView(key!)}
          >
            {label}
          </a>
        ))}
      </nav>
      {!selectedCampaignId ? <CampaignLabSelectionNotice /> : null}
      {selectedCampaignId ? (
        <section
          aria-labelledby="research-upload-title"
          className="panel"
          id="research-upload"
          data-step="prepare"
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
            <StructuredEditor
              id="campaign-lab-research-source"
              label="Research source"
              value={researchSourceJson}
              onChange={setResearchSourceJson}
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
        <section
          className="workspace-grid"
          aria-label="Audience cohorts and simulation request"
          id="audience-cohorts"
          data-step="simulate"
        >
          <form
            className="panel form-stack"
            id="message-lab"
            onSubmit={launchSimulation}
          >
            <p className="eyebrow">03 / Repeated simulation</p>
            <h2 id="simulation-config">Set up your message comparison</h2>
            <StructuredEditor
              id="campaign-lab-request"
              label="Message test settings"
              value={requestText}
              onChange={setRequestText}
              fields={[
                "objective",
                "variants",
                "configuration",
                "ranking_metric",
              ]}
            />
            <p className="field-note" id="campaign-lab-request-note">
              {selectedPopulationFrame
                ? "Starter request uses the hosted, cited PSA 2020 17-region frame. Add separately authorized survey and historical outcome evidence before treating results as real-world evidence."
                : "The hosted PSA frame was unavailable, so this request remains an authored fixture. Do not use it for a real decision until a cited population frame is loaded."}
            </p>
            <button
              disabled={
                running ||
                !selectedPopulationFrame ||
                (!!run &&
                  ["queued", "running", "retrying"].includes(run.status))
              }
              type="submit"
            >
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
          data-step="simulate"
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
                  <h3>{ranking.top_variant_key ?? "No stable top variant"}</h3>
                  <p>
                    {ranking.stability_label} · pairwise agreement{" "}
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
          <div className="campaign-lab-cohort-results" id="cohort-findings">
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
          data-step="simulate"
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
            <button
              disabled={
                busyStage === "interviews" ||
                run?.status !== "succeeded" ||
                !interviewAgentId
              }
              type="submit"
            >
              {busyStage === "interviews"
                ? "Queueing interview…"
                : "Queue synthetic interview"}
            </button>
          </form>
          {interviewRun ? (
            <p aria-live="polite" className="field-note">
              Interview: <strong>{interviewRun.status}</strong> ·{" "}
              {interviewRun.progress}% · run <code>{interviewRun.id}</code>
            </p>
          ) : null}
          {interviewRun?.result ? (
            <div className="panel">
              <p>
                {typeof interviewRun.result.transcript === "string"
                  ? interviewRun.result.transcript
                  : "The completed record is available in the details below."}
              </p>
              <p className="field-note">
                This is a synthetic explanation, not a respondent quotation.
              </p>
              <details>
                <summary>View supporting evidence record</summary>
                <pre className="field-note">
                  {JSON.stringify(interviewRun.result, null, 2)}
                </pre>
              </details>
            </div>
          ) : null}
        </section>
      ) : null}
      {selectedCampaignId ? (
        <section
          className="panel"
          id="surveys"
          data-step="evidence"
          aria-labelledby="survey-title"
        >
          <p className="eyebrow">06 / Survey import</p>
          <h2 id="survey-title">Import a consented aggregate survey</h2>
          <p className="field-note">
            Preview a CSV or JSON export up to 200 KB before queueing. Raw rows
            are processed transiently for validation and sent in a private
            worker envelope; only aggregate results and provenance are returned.
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
            <StructuredEditor
              id="campaign-lab-survey-metadata"
              label="Survey provenance"
              value={surveyMetadataJson}
              onChange={setSurveyMetadataJson}
            />
            <label htmlFor="campaign-lab-survey-source-version">
              Approved survey source version ID (production)
            </label>
            <input
              id="campaign-lab-survey-source-version"
              onChange={(event) => setSurveySourceVersionId(event.target.value)}
              placeholder="UUID from the evidence source registry"
              value={surveySourceVersionId}
            />
            <details>
              <summary>Review column mapping</summary>
              <p className="field-note">
                Match each metric to the column name in your export. Default
                names match the standard SIMULA aggregate format.
              </p>
              <StructuredEditor
                id="campaign-lab-survey-field-map"
                label="Column mapping"
                value={surveyFieldMapJson}
                onChange={setSurveyFieldMapJson}
              />
            </details>
            {currentSurveyPreview && (
              <div
                className="notice"
                role="status"
                aria-label="Survey import preview"
              >
                <h3>Review the import</h3>
                <p>
                  {currentSurveyPreview.summary.accepted_response_count}{" "}
                  accepted of{" "}
                  {currentSurveyPreview.summary.input_response_count} responses
                  across {currentSurveyPreview.aggregate_group_count} aggregate
                  groups.
                </p>
                <p>
                  Excluded:{" "}
                  {currentSurveyPreview.summary.duplicate_response_count}{" "}
                  duplicates,{" "}
                  {currentSurveyPreview.summary.low_quality_response_count} low
                  quality, {currentSurveyPreview.summary.bot_response_count}{" "}
                  flagged as bots,{" "}
                  {currentSurveyPreview.summary.malformed_response_count}{" "}
                  malformed.
                </p>
                <p>{currentSurveyPreview.disclosure}</p>
                <details>
                  <summary>Verify import fingerprints</summary>
                  <dl>
                    {Object.entries(currentSurveyPreview.evidence_binding).map(
                      ([key, value]) => (
                        <div key={key}>
                          <dt>{key.replaceAll("_", " ")}</dt>
                          <dd style={{ overflowWrap: "anywhere" }}>
                            {value ?? "No admitted source selected"}
                          </dd>
                        </div>
                      ),
                    )}
                  </dl>
                </details>
              </div>
            )}
            <button disabled={busyStage === "surveys"} type="submit">
              {busyStage === "surveys"
                ? "Checking survey..."
                : currentSurveyPreview
                  ? "Confirm and queue survey import"
                  : "Preview survey import"}
            </button>
          </form>
          <details className="panel">
            <summary>Collect responses with a SIMULA form</summary>
            <div className="workspace-grid">
              <form
                className="panel form-stack"
                onSubmit={createNativeSurveyForm}
              >
                <p className="eyebrow">Native form</p>
                <h3>Create a SIMULA-native calibration form</h3>
                <p className="field-note">
                  The schema accepts only aggregate message-testing fields and
                  required consent. It rejects identity, political-affiliation,
                  vulnerability, and free-text questions.
                </p>
                <StructuredEditor
                  id="campaign-lab-native-survey-form"
                  label="Survey form"
                  value={nativeSurveyFormJson}
                  onChange={setNativeSurveyFormJson}
                />
                <button
                  disabled={busyStage === "native-survey-form"}
                  type="submit"
                >
                  {busyStage === "native-survey-form"
                    ? "Saving form…"
                    : "Save native form"}
                </button>
              </form>
              <form
                className="panel form-stack"
                onSubmit={submitNativeSurveyResponses}
              >
                <p className="eyebrow">Native collection</p>
                <h3>Queue consented aggregate responses</h3>
                <p className="field-note">
                  Responses are sent to the worker-only import envelope, then
                  reduced to aggregate survey observations and deleted.
                </p>
                <label htmlFor="campaign-lab-native-survey-form-id">
                  Native form id
                </label>
                <input
                  id="campaign-lab-native-survey-form-id"
                  onChange={(event) =>
                    setNativeSurveyFormId(event.target.value)
                  }
                  placeholder="Filled after saving a form"
                  value={nativeSurveyFormId}
                />
                <label htmlFor="native-response-upload">
                  Response export (.json)
                </label>
                <input
                  id="native-response-upload"
                  type="file"
                  accept=".json,application/json"
                  required
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      setNativeSurveyResponsesJson("[]");
                      return;
                    }
                    void file
                      .text()
                      .then((text) => {
                        if (!mounted.current) return;
                        const parsed: unknown = JSON.parse(text);
                        if (!Array.isArray(parsed) || !parsed.every(isRecord))
                          throw new Error("Invalid response batch");
                        setNativeSurveyResponsesJson(JSON.stringify(parsed));
                      })
                      .catch(() => {
                        if (mounted.current) {
                          setNativeSurveyResponsesJson("[]");
                          setError(
                            "Choose a JSON export containing an array of response objects.",
                          );
                        }
                      });
                  }}
                />
                <details>
                  <summary>Review uploaded responses</summary>
                  <StructuredEditor
                    id="campaign-lab-native-survey-responses"
                    label="Response batch"
                    value={nativeSurveyResponsesJson}
                    onChange={setNativeSurveyResponsesJson}
                  />
                </details>

                <button
                  disabled={
                    busyStage === "native-survey-responses" ||
                    !nativeSurveyFormId ||
                    nativeSurveyResponsesJson === "[]"
                  }
                  type="submit"
                >
                  {busyStage === "native-survey-responses"
                    ? "Queueing responses…"
                    : "Queue response batch"}
                </button>
              </form>
            </div>
          </details>
          {surveyRun ? (
            <p aria-live="polite" className="field-note">
              Survey import: <strong>{surveyRun.status}</strong> ·{" "}
              {surveyRun.progress}% · run <code>{surveyRun.id}</code>
            </p>
          ) : null}
        </section>
      ) : null}
      {selectedCampaignId ? (
        <BoundCalibration campaignId={selectedCampaignId} />
      ) : null}
      {selectedCampaignId ? (
        <BoundBacktest campaignId={selectedCampaignId} />
      ) : null}
      {selectedCampaignId ? (
        <section
          className="panel"
          id="forecasting"
          data-step="evidence"
          aria-labelledby="forecast-title"
        >
          <p className="eyebrow">09 / Official forecast</p>
          <h2 id="forecast-title">Forecast from official aggregate history</h2>
          <p className="field-note">
            No respondents. No synthetic people. The worker uses only an
            admitted, checksum-locked official election series and scores the
            method on earlier elections before showing a future aggregate.
          </p>
          <form className="form-stack" onSubmit={runAggregateForecast}>
            <label htmlFor="campaign-lab-forecast-dataset">
              Official historical dataset
            </label>
            <select
              id="campaign-lab-forecast-dataset"
              onChange={(event) => {
                const nextId = event.target.value;
                setForecastDatasetId(nextId);
                const dataset = forecastDatasets.find(
                  (candidate) => candidate.id === nextId,
                );
                const defaultTargets = dataset?.manifest.default_targets;
                if (Array.isArray(defaultTargets)) {
                  setForecastTargetsJson(
                    JSON.stringify(defaultTargets, null, 2),
                  );
                }
              }}
              value={forecastDatasetId}
            >
              {forecastDatasets.length === 0 ? (
                <option value="">
                  {forecastDatasetError
                    ? "Dataset registry unavailable"
                    : "No admitted dataset available"}
                </option>
              ) : null}
              {forecastDatasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.source_key} · {dataset.source_version}
                </option>
              ))}
            </select>
            {forecastDatasetError ? (
              <p className="field-note" role="alert">
                Official dataset registry unavailable: {forecastDatasetError}
              </p>
            ) : null}
            {forecastDatasetId ? (
              <p className="field-note">
                {forecastDatasets.find(
                  (dataset) => dataset.id === forecastDatasetId,
                )?.owner_name ?? "Official source"}
                {" · "}
                {forecastDatasets.find(
                  (dataset) => dataset.id === forecastDatasetId,
                )?.observation_period ?? "Versioned observation period"}
              </p>
            ) : null}
            <StructuredEditor
              id="campaign-lab-forecast-targets"
              label="Forecast options"
              value={forecastTargetsJson}
              onChange={setForecastTargetsJson}
            />
            <button
              disabled={busyStage === "forecasting" || !forecastDatasetId}
              type="submit"
            >
              {busyStage === "forecasting"
                ? "Starting official forecast…"
                : "Run official forecast"}
            </button>
          </form>
          {forecastRun ? (
            <p aria-live="polite" className="field-note">
              Forecast: <strong>{forecastRun.status}</strong> ·{" "}
              {forecastRun.progress}% · run <code>{forecastRun.id}</code>
            </p>
          ) : null}
          {forecastRun?.result ? (
            <AggregateForecastResult result={forecastRun.result} />
          ) : null}
        </section>
      ) : null}
      {selectedCampaignId ? (
        <section
          className="panel"
          id="compliance"
          data-step="review"
          aria-labelledby="compliance-title"
        >
          <p className="eyebrow">10 / Compliance review</p>
          <h2 id="compliance-title">Review aggregate-use controls</h2>
          <p className="field-note">
            This automated scan can only queue findings for human review. It
            cannot name or impersonate a reviewer, and it cannot approve a
            report.
          </p>
          <form className="form-stack" onSubmit={runCompliance}>
            <StructuredEditor
              id="campaign-lab-compliance-payload"
              label="Use and safeguards"
              value={complianceJson}
              onChange={setComplianceJson}
            />
            <button disabled={busyStage === "compliance"} type="submit">
              {busyStage === "compliance"
                ? "Queueing review…"
                : "Queue compliance review"}
            </button>
          </form>
          {complianceRun ? (
            <p aria-live="polite" className="field-note">
              Compliance: <strong>{complianceRun.status}</strong> ·{" "}
              {complianceRun.progress}% · run <code>{complianceRun.id}</code>
            </p>
          ) : null}
          {complianceRun?.result ? (
            <div className="panel">
              <p>
                {typeof complianceRun.result.rationale === "string"
                  ? complianceRun.result.rationale
                  : "The completed record is available in the details below."}
              </p>
              <p className="field-note">
                An automated control scan does not grant independent human
                approval.
              </p>
              <details>
                <summary>View supporting evidence record</summary>
                <pre className="field-note">
                  {JSON.stringify(complianceRun.result, null, 2)}
                </pre>
              </details>
            </div>
          ) : null}
        </section>
      ) : null}
      {selectedCampaignId ? (
        <BoundReport campaignId={selectedCampaignId} />
      ) : null}
      {selectedCampaignId ? (
        <section
          className="panel"
          id="audit"
          data-step="review"
          aria-labelledby="audit-title"
        >
          <p className="eyebrow">12 / Audit trail</p>
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
                {String(event.event_kind ?? event.stage ?? "event")} ·{" "}
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
