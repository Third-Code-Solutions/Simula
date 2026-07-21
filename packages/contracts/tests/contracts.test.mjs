import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
