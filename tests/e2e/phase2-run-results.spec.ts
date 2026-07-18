import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const FIXTURE_OWNER_EMAIL =
  process.env.SIMULA_E2E_OWNER_EMAIL ?? "owner-a@simula.local";
const FIXTURE_OWNER_PASSWORD = process.env.SIMULA_E2E_OWNER_PASSWORD;
const POLL_RUN_ID = "00000000-0000-4000-8000-000000000099";
const CREATED_AT = "2026-07-18T00:00:00Z";
const CHECKSUM = "a".repeat(64);
const E2E_ORIGIN = new URL(
  process.env.SIMULA_E2E_BASE_URL ?? "http://127.0.0.1:3000",
).origin;
const API_CORS_HEADERS = {
  "access-control-allow-origin": E2E_ORIGIN,
  "access-control-expose-headers": "X-Correlation-ID",
};

function requiredFixturePassword(): string {
  if (!FIXTURE_OWNER_PASSWORD) {
    throw new Error(
      "SIMULA_E2E_OWNER_PASSWORD is required for local browser tests",
    );
  }
  return FIXTURE_OWNER_PASSWORD;
}

function runFixture(state: "queued" | "succeeded") {
  return {
    id: POLL_RUN_ID,
    organization_id: "00000000-0000-4000-8000-000000000002",
    project_id: "00000000-0000-4000-8000-000000000003",
    stimulus_version_id: "00000000-0000-4000-8000-000000000004",
    audience_version_id: "00000000-0000-4000-8000-000000000005",
    state,
    schema_version: 1,
    dispatch_generation: 1,
    job_id: `run:${POLL_RUN_ID}:dispatch:1`,
    version: 1,
    created_at: CREATED_AT,
  };
}

function resultFixture() {
  return {
    run_id: POLL_RUN_ID,
    schema_version: 1,
    artifact_sha256: CHECKSUM,
    created_at: CREATED_AT,
    result: {
      schema_version: "1.0.0",
      run_id: POLL_RUN_ID,
      validation_label: "experimental",
      outputs: [
        {
          output_id: "reaction_fixture",
          kind: "demo_fixture_distribution",
          label: "Pipeline demo values",
          value: {
            unit: "share",
            categories: [
              { key: "clear", value: 0.6 },
              { key: "unclear", value: 0.3 },
              { key: "needs_human_review", value: 0.1 },
            ],
          },
          uncertainty: {
            status: "not_applicable",
            reason: "authored deterministic fixture",
          },
          limitations: [
            "Estimates nobody and is not representative of any population.",
          ],
        },
      ],
      qualitative: [
        {
          kind: "generated_qualitative",
          synthetic: true,
          text: "A deterministic mock observation used only to test rendering.",
          source_output_ids: ["reaction_fixture"],
        },
      ],
      recommendations: [
        {
          kind: "recommendation",
          text: "Verify wording with appropriately recruited human participants before acting.",
          source_output_ids: ["reaction_fixture"],
        },
      ],
      provenance: {
        method_version: "phase2_demo_v1",
        provider_id: "deterministic_mock",
        provider_version: 1,
        frozen_manifest_sha256: CHECKSUM,
        deterministic_seed: "1",
        output_schema_version: 1,
      },
      limitations: [
        "Estimates nobody and is not representative of any population.",
      ],
    },
  };
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(FIXTURE_OWNER_EMAIL);
  await page.getByLabel("Password").fill(requiredFixturePassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/organizations$/);
}

async function createTerminalRun(page: Page): Promise<void> {
  const marker = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  await signIn(page);
  await page.getByLabel("Organization name").fill(`P2 browser ${marker}`);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/organizations\/[^/]+\/projects$/);
  await page.getByLabel("Project name").fill(`Result proof ${marker}`);
  await page
    .getByLabel("Objective")
    .fill("Pressure-test fictional wording before human research.");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await page.getByLabel("Stimulus name").fill("Fictional message");
  await page
    .getByLabel("Text", { exact: true })
    .fill("A neutral fictional local browser-test message.");
  await page.getByRole("button", { name: "Add immutable stimulus" }).click();
  await page.getByRole("button", { name: "Run version 1" }).click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Complete" })).toBeVisible({
    timeout: 30_000,
  });
}

test("E2E-RESULT-001 and A11Y-AXE-001: a terminal run explains deterministic limits", async ({
  page,
}) => {
  await createTerminalRun(page);

  await expect(
    page.getByRole("heading", { name: "Pipeline demo values", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByText("Estimates nobody", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/not human research and must not guide a decision/i),
  ).toBeVisible();
  const disclosure = page.locator("details.provenance-panel");
  const summary = disclosure.locator("summary");
  const runId = new URL(page.url()).pathname.split("/").at(-1);
  if (!runId) {
    throw new Error("terminal run route did not include a run identifier");
  }
  await summary.focus();
  await expect(summary).toBeFocused();
  const provenanceResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(
        `/api/v1/runs/${runId}/provenance`,
      ) && response.status() === 200,
  );
  await page.keyboard.press("Space");
  await expect(disclosure).toHaveAttribute("open", "");
  expect((await provenanceResponse).ok()).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Frozen stimulus" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Frozen execution" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Authored demo audience" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Frozen limits and timestamps" }),
  ).toBeVisible();
  await expect(
    page.getByText("A neutral fictional local browser-test message."),
  ).toBeVisible();
  await expect(disclosure).toContainText("authored_demo");
  await expect(page.getByText("phase2_deterministic_mock_v1")).toBeVisible();
  await expect(disclosure).toContainText("phase2_2026_07_17");
  await expect(disclosure).toContainText("30 seconds");
  await expect(disclosure.locator("code")).toHaveCount(3);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const mobileAccessibility = await new AxeBuilder({ page }).analyze();
  expect(mobileAccessibility.violations).toEqual([]);
});

test("E2E-ERROR-001: inaccessible run identifiers expose only a safe problem", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/runs/${POLL_RUN_ID}`);

  const problem = page.locator(".problem[role='alert']");
  await expect(problem).toBeVisible();
  await expect(problem).not.toContainText(/traceback|postgresql|password/i);
});

test("E2E-POLL-001: a run poll transitions once and stops at terminal state", async ({
  page,
}) => {
  let statusRequests = 0;
  const requestEvents: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(`/api/v1/runs/${POLL_RUN_ID}`)) {
      requestEvents.push(request.method());
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().endsWith(`/api/v1/runs/${POLL_RUN_ID}`)) {
      requestEvents.push(`failed:${request.failure()?.errorText ?? "unknown"}`);
    }
  });
  await page.route(
    new RegExp(`/api/v1/runs/${POLL_RUN_ID}$`),
    async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          headers: {
            ...API_CORS_HEADERS,
            "access-control-allow-headers": "authorization,accept",
            "access-control-allow-methods": "GET, OPTIONS",
          },
          status: 204,
        });
        return;
      }
      statusRequests += 1;
      await route.fulfill({
        contentType: "application/json",
        headers: API_CORS_HEADERS,
        body: JSON.stringify(
          runFixture(statusRequests === 1 ? "queued" : "succeeded"),
        ),
      });
    },
  );
  await page.route(
    new RegExp(`/api/v1/runs/${POLL_RUN_ID}/result$`),
    async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          headers: {
            ...API_CORS_HEADERS,
            "access-control-allow-headers": "authorization,accept",
            "access-control-allow-methods": "GET, OPTIONS",
          },
          status: 204,
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        headers: API_CORS_HEADERS,
        body: JSON.stringify(resultFixture()),
      });
    },
  );

  await signIn(page);
  await page.goto(`/runs/${POLL_RUN_ID}`);
  await expect(page.getByRole("heading", { name: "Queued" })).toBeVisible();
  await expect.poll(() => statusRequests).toBe(2);
  expect(requestEvents).toEqual(["GET", "GET"]);
  await expect(page.getByRole("heading", { name: "Complete" })).toBeVisible({
    timeout: 5_000,
  });
  await page.waitForTimeout(1_500);
  expect(statusRequests).toBe(2);
});
