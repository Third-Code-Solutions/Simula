import { expect, test, type Page } from "@playwright/test";

const LIVE_E2E = process.env.SIMULA_LIVE_E2E === "true";
const OWNER_EMAIL =
  process.env.SIMULA_E2E_OWNER_EMAIL ?? "owner-a@simula.local";
const OWNER_PASSWORD = process.env.SIMULA_E2E_OWNER_PASSWORD;

type Scenario = {
  language: "fil" | "taglish";
  purpose: "commercial_marketing" | "public_service";
};

type RunEvidence = {
  simulation?: Record<string, unknown>;
  interview?: Record<string, unknown>;
};

async function signIn(page: Page) {
  if (!OWNER_PASSWORD) throw new Error("SIMULA_E2E_OWNER_PASSWORD is required");
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/organizations$/);
}

async function createProject(page: Page): Promise<string> {
  const marker = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  await signIn(page);
  await expect(page.getByLabel("Loading organizations")).toHaveCount(0);
  const existingWorkspace = page
    .getByRole("link", { name: /Live Campaign Lab/ })
    .first();
  if (await existingWorkspace.isVisible()) {
    await existingWorkspace.click();
  } else {
    await page
      .getByLabel("Organization name")
      .fill(`Live Campaign Lab ${marker}`);
    await page.getByRole("button", { name: "Create empty workspace" }).click();
  }
  await expect(page).toHaveURL(/\/organizations\/[^/]+\/dashboard$/);
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByLabel("Project name").fill(`Four-flow proof ${marker}`);
  await page
    .getByLabel("Objective")
    .fill("Verify four bounded live Campaign Lab research flows.");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  const projectId = new URL(page.url()).pathname.split("/").at(-1);
  if (!projectId) throw new Error("Created project URL has no project id");
  return projectId;
}

async function terminalRunStatus(
  page: Page,
  selector: string,
  timeout: number,
) {
  const heading = page.locator(selector).getByRole("heading", { level: 2 });
  await expect
    .poll(async () => (await heading.textContent())?.trim() ?? "", { timeout })
    .toMatch(/^(succeeded|failed|canceled)$/);
  const status = (await heading.textContent())?.trim();
  if (status !== "succeeded") {
    const safeProblem = await page
      .locator('[role="alert"]')
      .first()
      .textContent();
    throw new Error(
      `Campaign Lab run ended ${status ?? "without status"}: ${safeProblem?.trim() ?? "no safe problem summary"}`,
    );
  }
}

async function runScenario(page: Page, scenario: Scenario) {
  const evidence: RunEvidence = {};
  page.on("response", async (response) => {
    if (!response.ok()) return;
    const path = new URL(response.url()).pathname;
    if (/\/campaign-lab\/simulations\/[^/]+\/results$/.test(path)) {
      evidence.simulation = (await response.json()) as Record<string, unknown>;
    } else if (/\/campaign-lab\/interviews\/runs\/[^/]+$/.test(path)) {
      const value = (await response.json()) as Record<string, unknown>;
      if (value.status === "succeeded") evidence.interview = value;
    }
  });

  const name = `Live ${scenario.language} ${scenario.purpose}`;
  const campaignName = page.getByLabel("Campaign name");
  if (!(await campaignName.isVisible())) {
    await page.getByText("Create a new message test", { exact: true }).click();
  }
  await page.getByLabel("Starter scenario").selectOption(scenario.purpose);
  await campaignName.fill(name);
  await page
    .getByLabel("Decision objective")
    .fill(`Local QA for ${scenario.language} ${scenario.purpose}.`);
  await page.getByRole("button", { name: "Create message test" }).click();
  await page
    .getByRole("link", { name: "2. Test messages", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Set up your message comparison" }),
  ).toBeVisible();

  await page.getByLabel("Wika ng mensahe").selectOption(scenario.language);
  const provider = page.getByLabel("Simulation provider");
  await expect(
    provider.locator('option[value="openai_compatible"]'),
  ).toBeEnabled();
  await provider.selectOption("openai_compatible");
  await page
    .getByRole("button", { name: "Load editable starter scenario" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Live: openai_compatible" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "1. Prepare", exact: true }).click();
  await page.getByLabel("Research file").setInputFiles({
    name: `${scenario.language}-${scenario.purpose}.txt`,
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Local QA source: explain message clarity, concrete terms, and missing evidence. This authored text is not respondent research.",
    ),
  });
  await page.getByRole("button", { name: "Queue research ingestion" }).click();
  await expect(
    page.locator('p:has-text("Research ingestion:") strong', {
      hasText: "succeeded",
    }),
  ).toBeVisible({ timeout: 120_000 });

  await page
    .getByRole("link", { name: "2. Test messages", exact: true })
    .click();
  await page.getByRole("button", { name: "Queue repeated simulation" }).click();
  await terminalRunStatus(page, "#agent-activity", 900_000);
  await expect.poll(() => evidence.simulation).toBeTruthy();
  const simulation = evidence.simulation?.result as
    Record<string, unknown> | undefined;
  const providerExecution = simulation?.provider_execution as
    Record<string, unknown> | undefined;
  const expectedCalls = scenario.purpose === "public_service" ? 60 : 66;
  expect(providerExecution?.provider_calls).toBe(expectedCalls);
  expect(providerExecution?.cost_microusd).toBeGreaterThan(0);
  expect(providerExecution?.cost_microusd).toBeLessThanOrEqual(1_000_000);
  const receipts = providerExecution?.receipts as
    ReadonlyArray<Record<string, unknown>> | undefined;
  expect(receipts?.length).toBe(expectedCalls);
  expect(
    receipts?.every((receipt) => receipt.language === scenario.language),
  ).toBe(true);
  await expect(
    page.getByText(
      /Generated by openai_compatible · model deepseek-v4\.1-flash/,
    ),
  ).toBeVisible();
  if (scenario.purpose === "public_service") {
    expect(simulation?.analysis_mode).toBe("qualitative_public_service");
    await expect(
      page.getByRole("heading", { name: "Mga tanong at simulation evidence" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Walang ranking, persuasion score/),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Repeated component findings" }),
    ).toHaveCount(0);
  }

  const interviewButton = page.getByRole("button", {
    name: "Queue synthetic interview",
  });
  await expect(interviewButton).toBeEnabled();
  const interviewResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/campaign-lab\/campaigns\/[^/]+\/interviews$/.test(
        new URL(response.url()).pathname,
      ),
  );
  await interviewButton.click();
  expect((await interviewResponse).status()).toBe(201);
  const interviewStatus = page.locator('p:has-text("Interview:") strong');
  await expect(interviewStatus).toHaveText(/^(succeeded|failed|canceled)$/, {
    timeout: 180_000,
  });
  await expect(interviewStatus).toHaveText("succeeded");
  await expect.poll(() => evidence.interview).toBeTruthy();
  const interviewResult = evidence.interview?.result as
    Record<string, unknown> | undefined;
  const citedEvents = interviewResult?.evidence_event_ids as
    ReadonlyArray<string> | undefined;
  const diagnostics = simulation?.behavioral_diagnostics as
    | {
        variants?: ReadonlyArray<{
          interviewable_agents?: ReadonlyArray<{
            evidence_event_ids?: ReadonlyArray<string>;
          }>;
        }>;
      }
    | undefined;
  const persistedEvents = new Set(
    diagnostics?.variants?.flatMap((variant) =>
      (variant.interviewable_agents ?? []).flatMap(
        (agent) => agent.evidence_event_ids ?? [],
      ),
    ),
  );
  expect(citedEvents?.length).toBeGreaterThan(0);
  expect(citedEvents?.every((eventId) => persistedEvents.has(eventId))).toBe(
    true,
  );

  await page.getByRole("link", { name: "4. Review", exact: true }).click();
  await page.getByRole("button", { name: "Choose report evidence" }).click();
  await page
    .getByLabel("Saved simulation for report")
    .selectOption({ index: 1 });
  await page.getByRole("button", { name: "Create report draft" }).click();
  await expect(
    page.locator('p:has-text("Report:") strong', { hasText: "succeeded" }),
  ).toBeVisible({ timeout: 120_000 });
  await expect(
    page.getByRole("heading", { name: "Experimental report draft" }),
  ).toBeVisible();
  await expect(
    page.getByText("Awaiting independent review", { exact: true }),
  ).toBeVisible();
}

test.describe("Campaign Lab live provider", () => {
  test.skip(
    !LIVE_E2E,
    "Set SIMULA_LIVE_E2E=true to authorize live-provider QA",
  );
  test.setTimeout(1_000_000);

  for (const scenario of [
    { language: "fil", purpose: "commercial_marketing" },
    { language: "taglish", purpose: "commercial_marketing" },
    { language: "fil", purpose: "public_service" },
    { language: "taglish", purpose: "public_service" },
  ] as const satisfies readonly Scenario[]) {
    test(`${scenario.language} ${scenario.purpose}`, async ({ page }) => {
      const projectId = await createProject(page);
      await page.goto(`/projects/${projectId}/campaign-lab`);
      await expect(
        page.getByRole("heading", { name: "Campaign Simulation Lab" }),
      ).toBeVisible();
      await runScenario(page, scenario);
    });
  }
});
