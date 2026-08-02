import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";

import type { BehavioralActionKind, BehavioralReportDto } from "./run.dto";

const ACTION_KINDS: readonly BehavioralActionKind[] = Object.freeze([
  "attend",
  "resonate",
  "question",
  "reject",
  "share",
  "discuss",
  "reconsider",
  "ignore",
]);
const SCORE_KEYS = Object.freeze(["attention", "resonance", "trust"] as const);

function loadSchema(): unknown {
  const schemaPath =
    require.resolve("@simula/contracts/behavioral-report.schema.json");
  const raw = readFileSync(schemaPath, "utf8");
  if (Buffer.byteLength(raw, "utf8") > 64 * 1024) {
    throw new Error("behavioral report schema exceeds its compile-time budget");
  }
  return JSON.parse(raw) as unknown;
}

const ajv = new Ajv2020({
  allErrors: false,
  coerceTypes: false,
  ownProperties: true,
  removeAdditional: false,
  strict: true,
  useDefaults: false,
});
addFormats(ajv, ["uuid"]);
ajv.addKeyword({
  keyword: "x-generated-by",
  schemaType: "string",
  valid: true,
});
const validateReport = ajv.compile(
  loadSchema() as object,
) as ValidateFunction<BehavioralReportDto>;

function semanticReportIsValid(report: BehavioralReportDto): boolean {
  if (
    report.validation_label !== "experimental" ||
    !Array.isArray(report.limitations) ||
    report.limitations.length === 0 ||
    report.action_shares.length !== ACTION_KINDS.length
  ) {
    return false;
  }
  let actionTotal = 0;
  for (const [index, item] of report.action_shares.entries()) {
    if (
      !Array.isArray(item) ||
      item.length !== 2 ||
      item[0] !== ACTION_KINDS[index] ||
      !Number.isFinite(item[1]) ||
      item[1] < 0 ||
      item[1] > 1
    ) {
      return false;
    }
    actionTotal += item[1];
  }
  if (Math.abs(actionTotal - 1) > 1e-9) {
    return false;
  }

  const aggregates = [
    report.mean_attention,
    report.mean_resonance,
    report.mean_trust,
  ] as const;
  if (report.scores.length !== SCORE_KEYS.length) {
    return false;
  }
  for (const [index, score] of report.scores.entries()) {
    if (
      score.key !== SCORE_KEYS[index] ||
      score.score_type !== "heuristic" ||
      score.unit !== "synthetic_points" ||
      score.method !== "weighted_synthetic_agent_mean" ||
      score.value !== aggregates[index]
    ) {
      return false;
    }
  }

  if (
    report.uncertainty.uncertainty_type !==
      "synthetic_agent_dispersion_not_population_uncertainty" ||
    !Array.isArray(report.uncertainty.limitations) ||
    report.uncertainty.limitations.length === 0 ||
    report.synthesis.output_type !== "qualitative" ||
    report.synthesis.claim_scope !== "synthetic_agent_explanation" ||
    !Array.isArray(report.synthesis.limitations) ||
    report.synthesis.limitations.length === 0
  ) {
    return false;
  }
  const findingIds = report.findings.map((finding) => finding.finding_id);
  return (
    report.synthesis.evidence_finding_ids.length === findingIds.length &&
    report.synthesis.evidence_finding_ids.every(
      (findingId, index) => findingId === findingIds[index],
    )
  );
}

export function validatedBehavioralReport(value: unknown): BehavioralReportDto {
  if (!validateReport(value) || !semanticReportIsValid(value)) {
    throw new Error("database returned an invalid behavioral report");
  }
  return value;
}
