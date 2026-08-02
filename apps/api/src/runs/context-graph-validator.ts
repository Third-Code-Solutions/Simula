import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type { BehavioralContextGraphDto } from "./run.dto";

function loadSchema(): unknown {
  const schemaPath =
    require.resolve("@simula/contracts/context-graph.schema.json");
  const raw = readFileSync(schemaPath, "utf8");
  if (Buffer.byteLength(raw, "utf8") > 64 * 1024) {
    throw new Error("context graph schema exceeds its compile-time budget");
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
const validateGraph = ajv.compile(
  loadSchema() as object,
) as ValidateFunction<BehavioralContextGraphDto>;

function contentSha256(content: string): string {
  return createHash("sha256")
    .update(JSON.stringify(content), "utf8")
    .digest("hex");
}

function semanticGraphIsValid(graph: BehavioralContextGraphDto): boolean {
  if (
    !Array.isArray(graph.nodes) ||
    graph.nodes.length === 0 ||
    !Array.isArray(graph.edges) ||
    typeof graph.checksum_sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(graph.checksum_sha256) ||
    graph.checksum_sha256 === "0".repeat(64)
  ) {
    return false;
  }

  const nodeIds = graph.nodes.map((node) => node.node_id);
  if (
    nodeIds.some((nodeId, index) => index > 0 && nodeIds[index - 1]! >= nodeId)
  ) {
    return false;
  }
  for (const node of graph.nodes) {
    if (
      typeof node.content_sha256 !== "string" ||
      node.content_sha256 !== contentSha256(node.content)
    ) {
      return false;
    }
  }

  const nodeSet = new Set(nodeIds);
  const edgeKeys = graph.edges.map(
    (edge) =>
      `${edge.source_node_id}\u0000${edge.target_node_id}\u0000${edge.relationship}`,
  );
  if (
    edgeKeys.some(
      (edgeKey, index) => index > 0 && edgeKeys[index - 1]! >= edgeKey,
    )
  ) {
    return false;
  }
  return graph.edges.every(
    (edge) =>
      edge.source_node_id !== edge.target_node_id &&
      nodeSet.has(edge.source_node_id) &&
      nodeSet.has(edge.target_node_id),
  );
}

export function validatedContextGraph(
  value: unknown,
): BehavioralContextGraphDto {
  if (!validateGraph(value) || !semanticGraphIsValid(value)) {
    throw new Error("database returned an invalid behavioral context graph");
  }
  return value;
}
