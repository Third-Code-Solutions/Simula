import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  expect,
  test,
  type Page,
  type Response,
  type TestInfo,
} from "@playwright/test";

const API_ORIGIN = "http://127.0.0.1:52141";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} was not provided by global setup`);
  return value;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectDocumentTitle(page: Page): Promise<void> {
  await expect.poll(() => page.title()).not.toBe("");
}

async function attachVisual(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const outputDirectory = resolve("output", "playwright");
  const screenshotPath = resolve(
    outputDirectory,
    `m2-${testInfo.project.name}-${name}.png`,
  );
  await mkdir(outputDirectory, { recursive: true });
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: screenshotPath,
  });
  await testInfo.attach(name, {
    contentType: "image/png",
    path: screenshotPath,
  });
}

test("authenticated browser exposes empty state and conceals foreign organization resources", async ({
  page,
}, testInfo) => {
  const email = requiredEnvironment("SIMULA_M2_BROWSER_EMAIL");
  const password = requiredEnvironment("SIMULA_M2_BROWSER_PASSWORD");
  const foreignOrganizationId = requiredEnvironment(
    "SIMULA_M2_FOREIGN_ORGANIZATION_ID",
  );
  const foreignOrganizationName = requiredEnvironment(
    "SIMULA_M2_FOREIGN_ORGANIZATION_NAME",
  );
  const foreignProjectId = requiredEnvironment("SIMULA_M2_FOREIGN_PROJECT_ID");
  const foreignProjectName = requiredEnvironment(
    "SIMULA_M2_FOREIGN_PROJECT_NAME",
  );
  const foreignProjectObjective = requiredEnvironment(
    "SIMULA_M2_FOREIGN_PROJECT_OBJECTIVE",
  );
  const browserErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: Readonly<{ status: number; url: string }>[] = [];
  let organizationResponse: Response | undefined;
  let foreignDashboardResponse: Response | undefined;
  let foreignProjectsResponse: Response | undefined;
  let foreignProjectResponse: Response | undefined;
  let releaseOrganizationRequest: (() => void) | undefined;
  const organizationRequestReleased = new Promise<void>((resolve) => {
    releaseOrganizationRequest = resolve;
  });
  let organizationRequestIntercepted = false;

  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 400) {
      failedResponses.push({ status: response.status(), url });
    }
    if (
      response.request().method() === "GET" &&
      (url === `${API_ORIGIN}/api/v2/organizations` ||
        url.startsWith(`${API_ORIGIN}/api/v2/organizations?`))
    ) {
      organizationResponse = response;
    }
    if (
      response.request().method() === "GET" &&
      url ===
        `${API_ORIGIN}/api/v2/organizations/${foreignOrganizationId}/dashboard`
    ) {
      foreignDashboardResponse = response;
    }
    if (
      response.request().method() === "GET" &&
      url ===
        `${API_ORIGIN}/api/v2/organizations/${foreignOrganizationId}/projects`
    ) {
      foreignProjectsResponse = response;
    }
    if (
      response.request().method() === "GET" &&
      url === `${API_ORIGIN}/api/v2/projects/${foreignProjectId}`
    ) {
      foreignProjectResponse = response;
    }
  });

  await page.route(`${API_ORIGIN}/api/v2/organizations*`, async (route) => {
    if (organizationRequestIntercepted) {
      await route.continue();
      return;
    }
    organizationRequestIntercepted = true;
    await organizationRequestReleased;
    await route.continue();
  });
  await page.goto("/sign-in?next=%2Forganizations");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/organizations$/);
  await expect.poll(() => organizationRequestIntercepted).toBe(true);
  await expect(page.getByLabel("Loading organizations")).toBeVisible();
  releaseOrganizationRequest?.();
  await expect(
    page.getByRole("heading", { name: "No workspace yet" }),
  ).toBeVisible();
  expect(organizationResponse?.status()).toBe(200);
  await expect
    .poll(async () => organizationResponse?.json())
    .toEqual({ items: [], next_cursor: null });
  await expect(page.getByText(foreignOrganizationName)).toHaveCount(0);
  await expect(page.getByText(foreignOrganizationId)).toHaveCount(0);

  await expectDocumentTitle(page);
  const emptyStateAccessibility = await new AxeBuilder({ page }).analyze();
  expect(emptyStateAccessibility.violations).toEqual([]);
  await expectNoHorizontalOverflow(page);
  await attachVisual(page, testInfo, "organization-empty");

  await page.goto(`/organizations/${foreignOrganizationId}/dashboard`);
  await expect(
    page.getByRole("heading", { name: "Dashboard unavailable" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The requested resource was not found." }),
  ).toBeVisible();
  expect(foreignDashboardResponse?.status()).toBe(404);
  let visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toContain(foreignOrganizationName);
  expect(visibleText).not.toContain(foreignOrganizationId);
  expect(visibleText).not.toContain(foreignProjectName);
  expect(visibleText).not.toContain(foreignProjectObjective);
  expect(visibleText).not.toContain(foreignProjectId);
  await expectDocumentTitle(page);
  const dashboardDenialAccessibility = await new AxeBuilder({ page }).analyze();
  expect(dashboardDenialAccessibility.violations).toEqual([]);
  await expectNoHorizontalOverflow(page);
  await attachVisual(page, testInfo, "dashboard-denial");

  await page.goto(`/organizations/${foreignOrganizationId}/projects`);
  await expect(
    page.getByRole("heading", { name: "Projects", level: 1 }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The requested resource was not found." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry projects" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No projects yet. Create the first project for this organization.",
    ),
  ).toHaveCount(0);
  expect(foreignProjectsResponse?.status()).toBe(404);
  visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toContain(foreignOrganizationName);
  expect(visibleText).not.toContain(foreignOrganizationId);
  expect(visibleText).not.toContain(foreignProjectName);
  expect(visibleText).not.toContain(foreignProjectObjective);
  expect(visibleText).not.toContain(foreignProjectId);
  await expectDocumentTitle(page);
  const projectsDenialAccessibility = await new AxeBuilder({ page }).analyze();
  expect(projectsDenialAccessibility.violations).toEqual([]);
  await expectNoHorizontalOverflow(page);
  await attachVisual(page, testInfo, "projects-denial");

  await page.goto(`/projects/${foreignProjectId}`);
  await expect(page.locator("p.problem[role='alert']")).toContainText(
    "The requested resource was not found.",
  );
  expect(foreignProjectResponse?.status()).toBe(404);
  await expect
    .poll(async () => foreignProjectResponse?.json())
    .toMatchObject({
      code: "not_found",
      detail: "The requested resource was not found.",
      status: 404,
      title: "Resource not found",
    });
  visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toContain(foreignOrganizationName);
  expect(visibleText).not.toContain(foreignOrganizationId);
  expect(visibleText).not.toContain(foreignProjectName);
  expect(visibleText).not.toContain(foreignProjectObjective);
  expect(visibleText).not.toContain(foreignProjectId);

  await expectDocumentTitle(page);
  const denialAccessibility = await new AxeBuilder({ page }).analyze();
  expect(denialAccessibility.violations).toEqual([]);
  await expectNoHorizontalOverflow(page);
  await attachVisual(page, testInfo, "project-denial");
  expect(browserErrors).toEqual([]);
  expect(failedResponses.length).toBeGreaterThan(0);
  expect(
    failedResponses.every(
      (failure) =>
        failure.status === 404 &&
        [
          `${API_ORIGIN}/api/v2/organizations/${foreignOrganizationId}/dashboard`,
          `${API_ORIGIN}/api/v2/organizations/${foreignOrganizationId}/projects`,
          `${API_ORIGIN}/api/v2/projects/${foreignProjectId}`,
        ].includes(failure.url),
    ),
  ).toBe(true);
  expect(consoleErrors.length).toBe(failedResponses.length);
  expect(
    consoleErrors.every(
      (message) =>
        message ===
        "Failed to load resource: the server responded with a status of 404 (Not Found)",
    ),
  ).toBe(true);
});

test("owner permanently deletes a terminal disposable workspace", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One disposable deletion fixture is consumed by the desktop proof.",
  );
  const email = requiredEnvironment("SIMULA_M2_BROWSER_OWNER_EMAIL");
  const password = requiredEnvironment("SIMULA_M2_BROWSER_PASSWORD");
  const organizationId = requiredEnvironment(
    "SIMULA_M2_DELETION_ORGANIZATION_ID",
  );
  const organizationName = requiredEnvironment(
    "SIMULA_M2_DELETION_ORGANIZATION_NAME",
  );
  const browserErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  for (const resource of ["invitations", "feature-flags", "audit"]) {
    await page.route(
      `${API_ORIGIN}/api/v1/organizations/${organizationId}/${resource}`,
      async (route) => {
        await route.fulfill({
          body: JSON.stringify({ items: [] }),
          contentType: "application/json",
          status: 200,
        });
      },
    );
  }

  await page.goto(
    `/sign-in?next=${encodeURIComponent(
      `/organizations/${organizationId}/dashboard`,
    )}`,
  );
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/organizations/${organizationId}/dashboard$`),
  );
  await expect(
    page.getByRole("heading", { name: "Delete workspace" }),
  ).toBeVisible();
  await page
    .getByLabel(`Enter ${organizationName} to confirm`)
    .fill("Wrong workspace");
  await page
    .getByRole("button", { name: "Permanently delete workspace" })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Enter the exact workspace name before permanent deletion.",
    }),
  ).toBeVisible();

  await page
    .getByLabel(`Enter ${organizationName} to confirm`)
    .fill(organizationName);
  const deletionResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url() ===
        `${API_ORIGIN}/api/v2/organizations/${organizationId}/deletion`,
  );
  await attachVisual(page, testInfo, "organization-deletion-confirmation");
  await page
    .getByRole("button", { name: "Permanently delete workspace" })
    .click();

  const response = await deletionResponse;
  expect(response.status()).toBe(200);
  await expect
    .poll(async () => response.json())
    .toMatchObject({
      organization_id: organizationId,
      status: "completed",
      replayed: false,
    });
  await expect(page).toHaveURL(/\/organizations$/);
  await expect(page.getByText(organizationName)).toHaveCount(0);
  await attachVisual(page, testInfo, "organization-deletion-completed");
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await expectNoHorizontalOverflow(page);
  expect(browserErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
