import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("P2-03 OpenAPI is generated from the FastAPI authority", async () => {
  const document = JSON.parse(
    await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
  );

  assert.equal(document.info.title, "SIMULA API");
  assert.ok(document.paths["/health/live"]);
  assert.ok(document.paths["/health/ready"]);
  assert.deepEqual(Object.keys(document.paths).sort(), [
    "/api/v1/me",
    "/api/v1/organizations",
    "/api/v1/organizations/{organization_id}/projects",
    "/api/v1/projects/{project_id}",
    "/api/v1/projects/{project_id}/stimuli",
    "/api/v1/stimuli/{stimulus_id}/versions",
    "/health/live",
    "/health/ready",
  ]);
  assert.ok(document.paths["/api/v1/organizations"].post);
  assert.ok(
    document.paths["/api/v1/organizations"].post.responses["422"].content[
      "application/problem+json"
    ],
  );
  assert.equal(document.components.schemas.HTTPValidationError, undefined);
});

test("result schema fails closed before P2-04", async () => {
  const schema = JSON.parse(
    await readFile(new URL("../result.schema.json", import.meta.url), "utf8"),
  );

  assert.deepEqual(schema.not, {});
});
