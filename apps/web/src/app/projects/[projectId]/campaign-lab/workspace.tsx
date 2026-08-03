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
  const [syntheticObservationsJson, setSyntheticObservationsJson] =
    useState("[]");
  const [calibrationRun, setCalibrationRun] = useState<CampaignLabDurableRun>();
  const [backtestProtocolJson, setBacktestProtocolJson] = useState(
    backtestProtocolExample,
  );
  const [backtestPredictionJson, setBacktestPredictionJson] = useState(
    backtestPredictionExample,
  );
  const [backtestOutcomesJson, setBacktestOutcomesJson] = useState(
    backtestOutcomesExample,
  );
  const [backtestRun, setBacktestRun] = useState<CampaignLabDurableRun>();
  const [complianceJson, setComplianceJson] = useState(complianceExample);
  const [complianceReviewer, setComplianceReviewer] = useState("");
  const [complianceRun, setComplianceRun] = useState<CampaignLabDurableRun>();
  const [reportRun, setReportRun] = useState<CampaignLabDurableRun>();
  const [reportApprovalStatus, setReportApprovalStatus] =
    useState("needs_human_review");
  const [reportReviewer, setReportReviewer] = useState("");
  const [interviewVariantKey, setInterviewVariantKey] = useState("control");
  const [interviewAgentId, setInterviewAgentId] = useState("");
  const [interviewQuestion, setInterviewQuestion] = useState(
    "What happened in this simulation?",
  );
  const [interviewRun, setInterviewRun] = useState<CampaignLabDurableRun>();
  const [busyStage, setBusyStage] = useState<string>();
  const [audit, setAudit] = useState<CampaignLabAuditPage>();

  const selectedCampaign = useMemo(
    () =>
      campaigns.find((campaign) => campaignId(campaign) === selectedCampaignId),
    [campaigns, selectedCampaignId],
  );

  const complianceFetcher = useMemo(
    () => (runId: string) =>
      selectedCampaignId
        ? getCampaignLabComplianceRun(selectedCampaignId, runId)
        : Promise.reject(new Error("Select a Campaign Lab workspace first.")),
    [selectedCampaignId],
  );

  useDurableRunPolling(
    surveyRun,
    getCampaignLabSurveyImportRun,
    (nextRun) => {
      setSurveyRun(nextRun);
      const dataset = nextRun.result?.dataset;
      if (nextRun.status === "succeeded" && isRecord(dataset)) {
        setSurveyDatasetJson(JSON.stringify(dataset, null, 2));
      }
    },
    (pollError) => setError(problemMessage(pollError)),
  );
  useDurableRunPolling(
    calibrationRun,
    getCampaignLabCalibrationRun,
    setCalibrationRun,
    (pollError) => setError(problemMessage(pollError)),
  );
  useDurableRunPolling(
    backtestRun,
    getCampaignLabBacktestRun,
    setBacktestRun,
    (pollError) => setError(problemMessage(pollError)),
  );
  useDurableRunPolling(
    complianceRun,
    complianceFetcher,
    setComplianceRun,
    (pollError) => setError(problemMessage(pollError)),
  );
  useDurableRunPolling(
    reportRun,
    getCampaignLabReportRun,
    setReportRun,
    (pollError) => setError(problemMessage(pollError)),
  );
  useDurableRunPolling(
    interviewRun,
    getCampaignLabInterviewRun,
    setInterviewRun,
    (pollError) => setError(problemMessage(pollError)),
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

  function adoptSimulationResult(nextResult: CampaignLabSimulationResult) {
    setResult(nextResult);
    const diagnostics = nextResult.result.behavioral_diagnostics;
    const firstVariant = diagnostics?.variants[0];
    const firstAgent = firstVariant?.interviewable_agents[0];
    if (firstVariant) setInterviewVariantKey(firstVariant.variant_key);
    if (firstAgent) setInterviewAgentId(firstAgent.agent_id);
    setSyntheticObservationsJson(
      JSON.stringify(nextResult.result.synthetic_observations, null, 2),
    );
  }

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
                  adoptSimulationResult(nextResult);
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
                    ...existingSources.filter(
                      (item) => item.source_id !== sourceId,
                    ),
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
        adoptSimulationResult(
          await getCampaignLabSimulationResults(nextRun.id),
        );
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

  async function importSurvey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      const rawText = await surveyImportFile.text();
      const payload =
        surveyImportFormat === "csv" ? rawText : JSON.parse(rawText);
      const created = await createCampaignLabSurveyImport(selectedCampaignId, {
        format: surveyImportFormat,
        metadata,
        field_map: fieldMap,
        secret_payload: { payload },
      });
      setSurveyRun(commandRun(created, selectedCampaignId, "survey_import"));
      setSurveyImportFile(null);
      event.currentTarget.reset();
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

  async function runCalibration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCampaignId) {
      setError("Create or select a Campaign Lab workspace first.");
      return;
    }
    setBusyStage("calibration");
    setError(undefined);
    try {
      const syntheticObservations = JSON.parse(syntheticObservationsJson);
      const survey = JSON.parse(surveyDatasetJson);
      if (!Array.isArray(syntheticObservations)) {
        throw new Error("Synthetic observations must be a JSON array.");
      }
      const created = await createCampaignLabCalibration(selectedCampaignId, {
        synthetic_observations: syntheticObservations,
        survey,
        calibration_version: "calibration_v1",
        model_version: "campaign-lab-population-weighted-v1",
      });
      setCalibrationRun(
        commandRun(created, selectedCampaignId, "survey_calibration"),
      );
    } catch (calibrationError) {
      setError(
        calibrationError instanceof SyntaxError
          ? "Calibration JSON is not valid."
          : problemMessage(calibrationError),
      );
    } finally {
      setBusyStage(undefined);
    }
  }

  async function runBacktest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCampaignId) {
      setError("Create or select a Campaign Lab workspace first.");
      return;
    }
    setBusyStage("backtesting");
    setError(undefined);
    try {
      const protocol = JSON.parse(backtestProtocolJson);
      const predictionSet = JSON.parse(backtestPredictionJson);
      const outcomes = JSON.parse(backtestOutcomesJson);
      const created = await createCampaignLabBacktest(selectedCampaignId, {
        protocol,
        prediction_set: predictionSet,
        secret_payload: { outcomes },
      });
      setBacktestRun(
        commandRun(created, selectedCampaignId, "historical_backtest"),
      );
    } catch (backtestError) {
      setError(
        backtestError instanceof SyntaxError
          ? "Backtest protocol, predictions, or outcomes JSON is not valid."
          : problemMessage(backtestError),
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
        {
          payload,
          reviewer: complianceReviewer.trim() || null,
        },
      );
      setComplianceRun(
        commandRun(created, selectedCampaignId, "compliance_review"),
      );
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
      const created = await createCampaignLabInterview(selectedCampaignId, {
        source_run_id: run.id,
        agent_id: interviewAgentId,
        variant_key: interviewVariantKey,
        question: interviewQuestion,
        prompt_version: "campaign-lab-interview-v1",
      });
      setInterviewRun(commandRun(created, selectedCampaignId, "interview"));
    } catch (interviewError) {
      setError(problemMessage(interviewError));
    } finally {
      setBusyStage(undefined);
    }
  }

  async function createReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCampaignId || !run?.id) {
      setError("Run a successful simulation before creating a report.");
      return;
    }
    if (
      reportApprovalStatus === "approved_experimental" &&
      (!complianceRun?.id || !reportReviewer.trim())
    ) {
      setError(
        "An approved experimental report requires a completed compliance review and named human reviewer.",
      );
      return;
    }
    setBusyStage("reports");
    setError(undefined);
    try {
      const created = await createCampaignLabReport(selectedCampaignId, {
        run_id: run.id,
        calibration_run_id: calibrationRun?.id ?? null,
        historical_backtest_run_id: backtestRun?.id ?? null,
        compliance_review_run_id: complianceRun?.id ?? null,
        human_reviewer: reportReviewer.trim() || null,
        approval_status: reportApprovalStatus,
      });
      setReportRun(commandRun(created, selectedCampaignId, "report"));
    } catch (reportError) {
      setError(problemMessage(reportError));
    } finally {
      setBusyStage(undefined);
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
        <section
          className="workspace-grid"
          aria-label="Simulation request"
          id="simulation-config"
        >
          <form
            className="panel form-stack"
            id="message-lab"
            onSubmit={launchSimulation}
          >
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
                ? "Queueing survey…"
                : "Queue survey import"}
            </button>
          </form>
          {surveyRun ? (
            <p aria-live="polite" className="field-note">
              Survey import: <strong>{surveyRun.status}</strong> ·{" "}
              {surveyRun.progress}% · run <code>{surveyRun.id}</code>
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
                ? "Queueing calibration…"
                : "Queue calibration"}
            </button>
          </form>
          <div className="panel" aria-live="polite">
            <p className="eyebrow">Calibration run</p>
            {calibrationRun ? (
              <>
                <h2>{calibrationRun.status}</h2>
                <p>
                  {calibrationRun.stage} · {calibrationRun.progress}%
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
                ? "Queueing backtest…"
                : "Queue held-out backtest"}
            </button>
          </form>
          {backtestRun ? (
            <p aria-live="polite" className="field-note">
              Backtest: <strong>{backtestRun.status}</strong> ·{" "}
              {backtestRun.progress}% · run <code>{backtestRun.id}</code>
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
              Attached run IDs: simulation {run?.id ?? "—"}, calibration{" "}
              {calibrationRun?.id ?? "—"}, backtest {backtestRun?.id ?? "—"},
              compliance {complianceRun?.id ?? "—"}.
            </p>
            <button disabled={busyStage === "reports"} type="submit">
              {busyStage === "reports"
                ? "Queueing report…"
                : "Generate evidence report"}
            </button>
          </form>
          {reportRun ? (
            <div aria-live="polite">
              <p className="field-note">
                Report: <strong>{reportRun.status}</strong> ·{" "}
                {reportRun.progress}% · run <code>{reportRun.id}</code>
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
