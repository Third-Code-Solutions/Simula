import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";

import type { SimulationResultArtifactDto } from "./run.dto";

function loadSchema(): unknown {
  const schemaPath = require.resolve("@simula/contracts/result.schema.json");
  const raw = readFileSync(schemaPath, "utf8");
  if (Buffer.byteLength(raw, "utf8") > 64 * 1024) {
    throw new Error("result schema exceeds its compile-time budget");
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
ajv.addKeyword({
  keyword: "discriminator",
  schemaType: "object",
  valid: true,
});
const validateResult = ajv.compile(
  loadSchema() as object,
) as ValidateFunction<SimulationResultArtifactDto>;

export function validatedResultArtifact(
  value: unknown,
): SimulationResultArtifactDto {
  if (!validateResult(value)) {
    throw new Error("database returned an invalid simulation result");
  }
  return value;
}
