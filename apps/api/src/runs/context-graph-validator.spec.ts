import { createHash } from "node:crypto";

import { validatedContextGraph } from "./context-graph-validator";

function contentSha256(content: string): string {
  return createHash("sha256")
    .update(JSON.stringify(content), "utf8")
    .digest("hex");
}

function graph(): Record<string, unknown> {
  return {
    graph_id: "018f274b-3c77-7b22-b749-c9274230ef91",
    organization_id: "018f274b-3c77-7b22-b749-c9274230ef92",
    version: 1,
    nodes: [
      {
        node_id: "a_stimulus",
        kind: "stimulus_fact",
        title: "Authored stimulus",
        content: "A bounded campaign message.",
        content_sha256: contentSha256("A bounded campaign message."),
        provenance: {
          source_id: "authored_stimulus",
          source_version: "1",
          owner: "SIMULA fixture",
          license: "authored",
          allowed_use: "Synthetic behavioral demo.",
          collected_at: "2026-07-29",
          transformation: "No transformation.",
          validation_status: "experimental",
        },
      },
      {
        node_id: "b_constraint",
        kind: "brand_constraint",
        title: "Brand constraint",
        content: "Avoid unsupported performance claims.",
        content_sha256: contentSha256("Avoid unsupported performance claims."),
        provenance: {
          source_id: "authored_constraint",
          source_version: "1",
          owner: "SIMULA fixture",
          license: "authored",
          allowed_use: "Synthetic behavioral demo.",
          collected_at: "2026-07-29",
          transformation: "No transformation.",
          validation_status: "experimental",
        },
      },
    ],
    edges: [
      {
        source_node_id: "a_stimulus",
        target_node_id: "b_constraint",
        relationship: "constrains",
        evidence_strength: 1,
      },
    ],
    checksum_sha256: "a".repeat(64),
    limitations: ["Synthetic context only."],
  };
}

describe("validatedContextGraph", () => {
  it("accepts a complete canonical context graph", () => {
    expect(validatedContextGraph(graph())).toMatchObject({
      version: 1,
      checksum_sha256: "a".repeat(64),
    });
  });

  it("rejects properties outside the generated authority", () => {
    expect(() =>
      validatedContextGraph({ ...graph(), inferred_demographics: true }),
    ).toThrow("invalid behavioral context graph");
  });

  it("rejects noncanonical node order", () => {
    const value = graph();
    (value.nodes as unknown[]).reverse();

    expect(() => validatedContextGraph(value)).toThrow(
      "invalid behavioral context graph",
    );
  });

  it("rejects edges whose endpoints are absent", () => {
    const value = graph();
    (
      value.edges as {
        target_node_id: string;
      }[]
    )[0]!.target_node_id = "missing_node";

    expect(() => validatedContextGraph(value)).toThrow(
      "invalid behavioral context graph",
    );
  });
});
