import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const DOMAIN_GOLDEN_PATHS = Object.freeze([
  ["/api/v1/audiences/demo", "/api/v2/audiences/demo"],
  ["/api/v1/auth-events", "/api/v2/auth-events"],
  ["/api/v1/exports/{export_id}", "/api/v2/exports/{export_id}"],
  ["/api/v1/me", "/api/v2/me"],
  ["/api/v1/methodology/registry", "/api/v2/methodology/registry"],
  ["/api/v1/organizations", "/api/v2/organizations"],
  [
    "/api/v1/organizations/{organization_id}/audiences",
    "/api/v2/organizations/{organization_id}/audiences",
  ],
  [
    "/api/v1/organizations/{organization_id}/projects",
    "/api/v2/organizations/{organization_id}/projects",
  ],
  ["/api/v1/projects/{project_id}", "/api/v2/projects/{project_id}"],
  [
    "/api/v1/projects/{project_id}/methodology-previews",
    "/api/v2/projects/{project_id}/methodology-previews",
  ],
  ["/api/v1/projects/{project_id}/runs", "/api/v2/projects/{project_id}/runs"],
  [
    "/api/v1/projects/{project_id}/simulation-configurations",
    "/api/v2/projects/{project_id}/simulation-configurations",
  ],
  [
    "/api/v1/projects/{project_id}/stimuli",
    "/api/v2/projects/{project_id}/stimuli",
  ],
  [
    "/api/v1/projects/{project_id}/variant-groups",
    "/api/v2/projects/{project_id}/variant-groups",
  ],
  [
    "/api/v1/reports/{report_id}/exports",
    "/api/v2/reports/{report_id}/exports",
  ],
  ["/api/v1/runs/{run_id}", "/api/v2/runs/{run_id}"],
  ["/api/v1/runs/{run_id}/cancel", "/api/v2/runs/{run_id}/cancel"],
  ["/api/v1/runs/{run_id}/provenance", "/api/v2/runs/{run_id}/provenance"],
  [
    "/api/v1/runs/{run_id}/methodology-reports",
    "/api/v2/runs/{run_id}/methodology-reports",
  ],
  ["/api/v1/runs/{run_id}/report", "/api/v2/runs/{run_id}/report"],
  ["/api/v1/runs/{run_id}/result", "/api/v2/runs/{run_id}/result"],
  [
    "/api/v1/stimuli/{stimulus_id}/versions",
    "/api/v2/stimuli/{stimulus_id}/versions",
  ],
  [
    "/api/v1/variant-groups/{variant_group_id}/comparison",
    "/api/v2/variant-groups/{variant_group_id}/comparison",
  ],
]);

function resolvedSchema(document, schema) {
  let current = schema;
  while (current?.$ref) {
    const name = current.$ref.split("/").at(-1);
    current = document.components.schemas[name];
  }
  return current;
}

function contractFields(schema) {
  return {
    properties: Object.keys(schema?.properties ?? {}).sort(),
    required: [...(schema?.required ?? [])].sort(),
  };
}

test("P2-04 OpenAPI is generated from the FastAPI authority", async () => {
  const document = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );

  assert.equal(document.info.title, "SIMULA API");
  assert.ok(document.paths["/health/live"]);
  assert.ok(document.paths["/health/ready"]);
  assert.deepEqual(Object.keys(document.paths).sort(), [
    "/api/v1/audiences/demo",
    "/api/v1/auth-events",
    "/api/v1/campaign-lab/backtests/{run_id}",
    "/api/v1/campaign-lab/calibrations/{run_id}",
    "/api/v1/campaign-lab/campaigns",
    "/api/v1/campaign-lab/campaigns/{campaign_id}",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/artifacts",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/audit",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/backtests",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/calibrations",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/cohorts",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/compliance/reviews",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/compliance/runs/{run_id}",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/cultural-evaluations",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/interviews",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/reports",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/research",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/simulations",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/forms",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/forms/{form_id}",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/forms/{form_id}/responses",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/surveys/import",
    "/api/v1/campaign-lab/campaigns/{campaign_id}/variants",
    "/api/v1/campaign-lab/interviews/runs/{run_id}",
    "/api/v1/campaign-lab/interviews/{artifact_id}",
    "/api/v1/campaign-lab/reports/runs/{run_id}",
    "/api/v1/campaign-lab/reports/{artifact_id}",
    "/api/v1/campaign-lab/research/runs/{run_id}",
    "/api/v1/campaign-lab/simulations/{run_id}",
    "/api/v1/campaign-lab/simulations/{run_id}/cancel",
    "/api/v1/campaign-lab/simulations/{run_id}/clone",
    "/api/v1/campaign-lab/simulations/{run_id}/events",
    "/api/v1/campaign-lab/simulations/{run_id}/results",
    "/api/v1/campaign-lab/simulations/{run_id}/status",
    "/api/v1/campaign-lab/surveys/runs/{run_id}",
    "/api/v1/exports/{export_id}",
    "/api/v1/me",
    "/api/v1/methodology/registry",
    "/api/v1/organization-invitations/accept",
    "/api/v1/organizations",
    "/api/v1/organizations/{organization_id}/admin-summary",
    "/api/v1/organizations/{organization_id}/audiences",
    "/api/v1/organizations/{organization_id}/audit",
    "/api/v1/organizations/{organization_id}/dashboard",
    "/api/v1/organizations/{organization_id}/feature-flags",
    "/api/v1/organizations/{organization_id}/feature-flags/{flag_key}",
    "/api/v1/organizations/{organization_id}/feedback",
    "/api/v1/organizations/{organization_id}/invitations",
    "/api/v1/organizations/{organization_id}/projects",
    "/api/v1/platform-admin/dashboard",
    "/api/v1/projects/{project_id}",
    "/api/v1/projects/{project_id}/methodology-previews",
    "/api/v1/projects/{project_id}/runs",
    "/api/v1/projects/{project_id}/simulation-configurations",
    "/api/v1/projects/{project_id}/stimuli",
    "/api/v1/projects/{project_id}/variant-groups",
    "/api/v1/report-shares/{share_id}",
    "/api/v1/reports/{report_id}/exports",
    "/api/v1/reports/{report_id}/shares",
    "/api/v1/runs/{run_id}",
    "/api/v1/runs/{run_id}/cancel",
    "/api/v1/runs/{run_id}/methodology-reports",
    "/api/v1/runs/{run_id}/provenance",
    "/api/v1/runs/{run_id}/report",
    "/api/v1/runs/{run_id}/reports",
    "/api/v1/runs/{run_id}/result",
    "/api/v1/shared-reports/{token}",
    "/api/v1/stimuli/{stimulus_id}/versions",
    "/api/v1/variant-groups/{variant_group_id}/comparison",
    "/health/live",
    "/health/ready",
  ]);
  assert.ok(document.paths["/api/v1/audiences/demo"].get);
  assert.ok(document.paths["/api/v1/auth-events"].post);
  assert.ok(document.paths["/api/v1/organizations"].post);
  assert.ok(document.paths["/api/v1/platform-admin/dashboard"].get);
  assert.ok(document.paths["/api/v1/projects/{project_id}/runs"].post);
  assert.ok(document.paths["/api/v1/runs/{run_id}/cancel"].post);
  assert.ok(document.paths["/api/v1/runs/{run_id}/provenance"].get);
  assert.ok(document.paths["/api/v1/runs/{run_id}/result"].get);
  assert.ok(document.paths["/api/v1/reports/{report_id}/shares"].post);
  assert.ok(document.paths["/api/v1/shared-reports/{token}"].get);
  assert.ok(
    document.paths["/api/v1/variant-groups/{variant_group_id}/comparison"].get,
  );
  assert.ok(
    document.paths["/api/v1/organizations"].post.responses["422"].content[
      "application/problem+json"
    ],
  );
  assert.equal(document.components.schemas.HTTPValidationError, undefined);
  assert.deepEqual(document["x-simula-stable-problem-codes"], [
    "dependency_unavailable",
    "forbidden",
    "idempotency_key_reused",
    "internal_error",
    "invalid_request",
    "method_not_allowed",
    "not_found",
    "queue_backpressure",
    "quota_exceeded",
    "rate_limited",
    "request_deadline_exceeded",
    "request_too_large",
    "run_not_cancelable",
    "unauthenticated",
    "unsupported_media_type",
    "unsupported_scope",
    "validation_error",
    "version_conflict",
  ]);
  assert.equal(
    document.paths["/api/v1/runs/{run_id}/cancel"].post.responses["202"]
      .description,
    "Successful Response",
  );
});

test("P2-04 result schema is generated from the deterministic result authority", async () => {
  const schema = JSON.parse(
    await readFile(new URL("../result.schema.json", import.meta.url), "utf8"),
  );

  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema_version.const, "1.0.0");
  assert.ok(schema.properties.outputs);
  assert.ok(schema.properties.provenance);
  assert.equal(schema.not, undefined);
});

test("behavioral report schema is generated from the governed engine authority", async () => {
  const schema = JSON.parse(
    await readFile(
      new URL("../behavioral-report.schema.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.validation_label.const, "experimental");
  assert.deepEqual(schema.properties.scores.prefixItems, [
    { $ref: "#/$defs/BehavioralScore" },
    { $ref: "#/$defs/BehavioralScore" },
    { $ref: "#/$defs/BehavioralScore" },
  ]);
  assert.deepEqual(schema.$defs.BehavioralScore.properties.key.enum, [
    "attention",
    "resonance",
    "trust",
  ]);
  assert.equal(schema.$defs.BehavioralScore.additionalProperties, false);
});

test("context and evaluation schemas preserve provenance and benchmark-only labels", async () => {
  const [contextGraph, evaluationReport] = await Promise.all(
    [
      new URL("../context-graph.schema.json", import.meta.url),
      new URL("../behavioral-evaluation-report.schema.json", import.meta.url),
    ].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  );

  assert.equal(contextGraph.additionalProperties, false);
  assert.ok(contextGraph.properties.nodes);
  assert.ok(contextGraph.$defs.EvidenceProvenance);
  assert.equal(
    evaluationReport.properties.validation_label.const,
    "benchmark_only",
  );
  assert.ok(evaluationReport.properties.observation_sha256);
  assert.ok(evaluationReport.properties.limitations);
});

test("matched comparison schema forbids winner and lift claims", async () => {
  const schema = JSON.parse(
    await readFile(
      new URL("../behavioral-comparison.schema.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(schema.additionalProperties, false);
  assert.equal(
    schema.properties.interpretation.const,
    "experimental_matched_synthetic_difference",
  );
  assert.equal(schema.properties.winner.type, "null");
  assert.deepEqual(
    schema.properties.metric_deltas.prefixItems.map((item) => item.$ref),
    ["#/$defs/MetricDelta", "#/$defs/MetricDelta", "#/$defs/MetricDelta"],
  );
  assert.ok(
    schema.properties.limitations.default.some((item) =>
      item.includes("No variant winner"),
    ),
  );
});

test("NestJS migration contract remains separate and fail-closed", async () => {
  const document = JSON.parse(
    await readFile(
      new URL("../../../apps/api/openapi.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(document.openapi, "3.1.0");
  assert.equal(document.info.title, "SIMULA Control Plane");
  assert.deepEqual(Object.keys(document.paths).sort(), [
    "/api/v2/audiences/demo",
    "/api/v2/auth-events",
    "/api/v2/campaign-evidence/{evidence_id}",
    "/api/v2/campaign-evidence/{evidence_id}/cancel",
    "/api/v2/campaign-evidence/{evidence_id}/events",
    "/api/v2/exports/{export_id}",
    "/api/v2/me",
    "/api/v2/methodology/registry",
    "/api/v2/organizations",
    "/api/v2/organizations/{organization_id}/audiences",
    "/api/v2/organizations/{organization_id}/dashboard",
    "/api/v2/organizations/{organization_id}/deletion",
    "/api/v2/organizations/{organization_id}/projects",
    "/api/v2/projects/{project_id}",
    "/api/v2/projects/{project_id}/behavioral-demo-runs",
    "/api/v2/projects/{project_id}/campaign-evidence/backtests",
    "/api/v2/projects/{project_id}/campaign-evidence/survey-calibrations",
    "/api/v2/projects/{project_id}/methodology-previews",
    "/api/v2/projects/{project_id}/runs",
    "/api/v2/projects/{project_id}/simulation-configurations",
    "/api/v2/projects/{project_id}/stimuli",
    "/api/v2/projects/{project_id}/variant-groups",
    "/api/v2/reports/{report_id}/exports",
    "/api/v2/runs/{run_id}",
    "/api/v2/runs/{run_id}/audit-history",
    "/api/v2/runs/{run_id}/behavioral-comparison",
    "/api/v2/runs/{run_id}/behavioral-evidence",
    "/api/v2/runs/{run_id}/behavioral-result",
    "/api/v2/runs/{run_id}/cancel",
    "/api/v2/runs/{run_id}/methodology-reports",
    "/api/v2/runs/{run_id}/provenance",
    "/api/v2/runs/{run_id}/report",
    "/api/v2/runs/{run_id}/result",
    "/api/v2/stimuli/{stimulus_id}/assets",
    "/api/v2/stimuli/{stimulus_id}/versions",
    "/api/v2/stimulus-assets/{asset_id}/content",
    "/api/v2/stimulus-assets/{asset_id}/deletion",
    "/api/v2/stimulus-assets/{asset_id}/visual-profile",
    "/api/v2/variant-groups/{variant_group_id}/comparison",
    "/health/live",
    "/health/ready",
  ]);
  assert.equal(
    document.paths["/api/v2/me"].get.operationId,
    "getCurrentIdentity",
  );
  assert.equal(
    document.paths["/api/v2/organizations"].get.operationId,
    "listOrganizations",
  );
  const organizationDeletion =
    document.paths["/api/v2/organizations/{organization_id}/deletion"].post;
  assert.equal(organizationDeletion.operationId, "deleteOrganization");
  assert.deepEqual(organizationDeletion.security, [{ supabase: [] }]);
  assert.equal(
    organizationDeletion.parameters.find(
      (parameter) => parameter.name === "Idempotency-Key",
    ).required,
    true,
  );
  assert.equal(
    document.components.schemas.OrganizationDeleteDto.additionalProperties,
    false,
  );
  assert.deepEqual(document.components.schemas.OrganizationDeleteDto.required, [
    "confirmation",
  ]);
  assert.deepEqual(
    Object.keys(
      document.components.schemas.OrganizationDeletionResponseDto.properties,
    ).sort(),
    [
      "completed_at",
      "organization_id",
      "replayed",
      "request_id",
      "requested_at",
      "status",
    ],
  );
  assert.ok(
    organizationDeletion.responses["503"].content["application/problem+json"],
  );
  assert.equal(
    document.paths["/api/v2/projects/{project_id}/behavioral-demo-runs"].post
      .operationId,
    "createBehavioralDemoRun",
  );
  assert.equal(
    document.paths["/api/v2/projects/{project_id}/runs"].post.operationId,
    "createSimulationRun",
  );
  assert.equal(
    document.paths["/api/v2/runs/{run_id}/audit-history"].get.operationId,
    "getRunAuditHistory",
  );
  assert.deepEqual(
    Object.keys(document.components.schemas.RunAuditEventDto.properties).sort(),
    [
      "actor_type",
      "attempt_number",
      "correlation_id",
      "created_at",
      "event_id",
      "new_state",
      "previous_state",
      "safe_reason",
    ],
  );
  assert.equal(
    document.paths["/api/v2/runs/{run_id}/behavioral-comparison"].get
      .operationId,
    "getBehavioralComparison",
  );
  assert.equal(
    document.paths["/api/v2/runs/{run_id}/behavioral-evidence"].get.operationId,
    "getBehavioralEvidence",
  );
  assert.equal(
    document.paths["/api/v2/runs/{run_id}/behavioral-result"].get.operationId,
    "getBehavioralResult",
  );
  assert.equal(
    document.paths["/api/v2/runs/{run_id}/result"].get.operationId,
    "getSimulationResult",
  );
  assert.equal(
    document.paths["/api/v2/runs/{run_id}/provenance"].get.operationId,
    "getSimulationProvenance",
  );
  assert.equal(
    document.paths["/api/v2/stimuli/{stimulus_id}/assets"].post.operationId,
    "reserveStimulusAsset",
  );
  assert.equal(
    document.paths["/api/v2/stimulus-assets/{asset_id}/content"].put
      .operationId,
    "uploadStimulusAssetContent",
  );
  assert.equal(
    document.paths["/api/v2/stimulus-assets/{asset_id}/content"].get
      .operationId,
    "downloadStimulusAssetContent",
  );
  assert.equal(
    document.paths["/api/v2/stimulus-assets/{asset_id}/deletion"].post
      .operationId,
    "deleteStimulusAsset",
  );
  const assetSchema = document.components.schemas.StimulusAssetResponseDto;
  assert.equal(assetSchema.additionalProperties, false);
  assert.deepEqual(Object.keys(assetSchema.properties).sort(), [
    "asset_id",
    "byte_size",
    "content_sha256",
    "created_at",
    "expected_byte_size",
    "expected_content_sha256",
    "filename",
    "media_type",
    "organization_id",
    "replayed",
    "retention_until",
    "status",
    "stimulus_id",
  ]);
  assert.equal(assetSchema.properties.byte_size.type, "integer");
  assert.equal(assetSchema.properties.byte_size.nullable, true);
  assert.equal(assetSchema.properties.content_sha256.type, "string");
  assert.equal(assetSchema.properties.content_sha256.nullable, true);
  assert.deepEqual(
    Object.keys(
      document.paths["/api/v2/stimulus-assets/{asset_id}/content"].put
        .requestBody.content,
    ).sort(),
    ["application/pdf", "image/jpeg", "image/png", "image/webp", "video/mp4"],
  );
  assert.ok(
    document.paths["/api/v2/me"].get.responses["401"].content[
      "application/problem+json"
    ],
  );
  assert.ok(
    document.paths["/api/v2/me"].get.responses["429"].content[
      "application/problem+json"
    ],
  );
  assert.ok(
    document.paths["/api/v2/organizations"].get.responses["429"].content[
      "application/problem+json"
    ],
  );
  assert.ok(
    document.paths["/api/v2/organizations"].get.responses["422"].content[
      "application/problem+json"
    ],
  );
  assert.ok(
    document.paths["/api/v2/projects/{project_id}"].patch.responses["409"]
      .content["application/problem+json"],
  );
  assert.ok(
    document.paths["/api/v2/projects/{project_id}/runs"].post.responses["429"]
      .content["application/problem+json"],
  );
  assert.ok(
    document.paths["/api/v2/runs/{run_id}/result"].get.responses["404"].content[
      "application/problem+json"
    ],
  );
  assert.ok(document.paths["/health/live"].get);
  assert.ok(document.paths["/health/ready"].get.responses["503"]);
});

test("NestJS v2 overlapping domain surface matches the FastAPI golden contract", async () => {
  const [fastApi, nestJs] = await Promise.all(
    [
      new URL("../openapi.json", import.meta.url),
      new URL("../../../apps/api/openapi.json", import.meta.url),
    ].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  );

  assert.deepEqual(
    nestJs["x-simula-stable-problem-codes"],
    fastApi["x-simula-stable-problem-codes"],
  );
  for (const [v1Path, v2Path] of DOMAIN_GOLDEN_PATHS) {
    const v1 = fastApi.paths[v1Path];
    const v2 = nestJs.paths[v2Path];
    assert.ok(v1, `missing FastAPI golden path ${v1Path}`);
    assert.ok(v2, `missing NestJS parity path ${v2Path}`);
    assert.deepEqual(Object.keys(v2).sort(), Object.keys(v1).sort());

    for (const method of Object.keys(v1)) {
      const v1Operation = v1[method];
      const v2Operation = v2[method];
      assert.equal(v1Operation.security.length, 1);
      assert.equal(v2Operation.security.length, 1);
      assert.deepEqual(
        Object.keys(v2Operation.responses).sort(),
        Object.keys(v1Operation.responses).sort(),
      );

      const v1Body = resolvedSchema(
        fastApi,
        v1Operation.requestBody?.content?.["application/json"]?.schema,
      );
      const v2Body = resolvedSchema(
        nestJs,
        v2Operation.requestBody?.content?.["application/json"]?.schema,
      );
      assert.deepEqual(contractFields(v2Body), contractFields(v1Body));

      for (const status of Object.keys(v1Operation.responses)) {
        const mediaType = status.startsWith("2")
          ? "application/json"
          : "application/problem+json";
        assert.ok(
          v2Operation.responses[status].content?.[mediaType],
          `${method.toUpperCase()} ${v2Path} ${status} lacks ${mediaType}`,
        );
        if (!status.startsWith("2")) {
          continue;
        }
        const v1Response = resolvedSchema(
          fastApi,
          v1Operation.responses[status].content?.["application/json"]?.schema,
        );
        const v2Response = resolvedSchema(
          nestJs,
          v2Operation.responses[status].content?.["application/json"]?.schema,
        );
        assert.deepEqual(
          contractFields(v2Response),
          contractFields(v1Response),
        );
        if (v2Response.type === "string") {
          assert.equal(v2Path, "/api/v2/exports/{export_id}");
          assert.equal(v2Response.format, "binary");
        } else {
          assert.equal(v2Response.additionalProperties, false);
        }
      }
    }
  }
});
