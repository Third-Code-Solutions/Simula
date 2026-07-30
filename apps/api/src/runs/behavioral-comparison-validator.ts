import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";

import type {
  BehavioralActionKind,
  BehavioralComparisonResponseDto,
} from "./run.dto";

const METRIC_KEYS = Object.freeze(["attention", "resonance", "trust"] as const);
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
const LIMITATIONS = Object.freeze([
  "No variant winner, lift, causal effect, or human preference is established.",
  "Synthetic-agent diagnostic only. It is not observed human evidence or a population estimate.",
] as const);

function loadSchema(): unknown {
  const schemaPath =
    require.resolve("@simula/contracts/behavioral-comparison.schema.json");
  const raw = readFileSync(schemaPath, "utf8");
  if (Buffer.byteLength(raw, "utf8") > 32 * 1024) {
    throw new Error(
      "behavioral comparison schema exceeds its compile-time budget",
    );
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
const validateComparison = ajv.compile(
  loadSchema() as object,
) as ValidateFunction<BehavioralComparisonResponseDto>;

function semanticComparisonIsValid(
  comparison: BehavioralComparisonResponseDto,
): boolean {
  return (
    comparison.baseline_run_id !== comparison.candidate_run_id &&
    comparison.interpretation === "experimental_matched_synthetic_difference" &&
    comparison.winner === null &&
    comparison.metric_deltas.length === METRIC_KEYS.length &&
    comparison.metric_deltas.every(
      (metric, index) => metric.key === METRIC_KEYS[index],
    ) &&
    comparison.action_share_deltas.length === ACTION_KINDS.length &&
    comparison.action_share_deltas.every(
      (action, index) => action.key === ACTION_KINDS[index],
    ) &&
    comparison.limitations.length === LIMITATIONS.length &&
    comparison.limitations.every(
      (limitation, index) => limitation === LIMITATIONS[index],
    )
  );
}

export function validatedBehavioralComparison(
  value: unknown,
): BehavioralComparisonResponseDto {
  if (!validateComparison(value) || !semanticComparisonIsValid(value)) {
    throw new Error("invalid behavioral comparison");
  }
  return value;
}
