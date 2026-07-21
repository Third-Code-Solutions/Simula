import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectLandingQuality(page: Page): Promise<void> {
  await page.goto("/");

  await expect(page).toHaveTitle(/SIMULA/);
  await expect(
    page.getByRole("heading", {
      name: "Rehearse the decision. Keep the doubt.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start a rehearsal" }).first(),
  ).toHaveAttribute("href", "/organizations");

  await expect(
    page.getByRole("heading", { name: /One decision.*Five inspectable moves/ }),
  ).toBeVisible();

  const frameStep = page.getByRole("button", { name: "Frame", exact: true });
  if (await frameStep.isVisible()) {
    await expect(frameStep).toHaveAttribute("aria-current", "step");
    await page.getByRole("button", { name: "Rehearse", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Rehearse", exact: true }),
    ).toHaveAttribute("aria-current", "step");
    await page.getByRole("button", { name: "Decide", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Decide", exact: true }),
    ).toHaveAttribute("aria-current", "step");
  }

  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBe(width.client);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
}

test("landing page is responsive and accessible on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1000, width: 1440 });
  await expectLandingQuality(page);
});

test("landing page is responsive and accessible on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await expectLandingQuality(page);
});

test("skip link transfers keyboard focus to the main content", async ({
  page,
}) => {
  await page.goto("/");
  const skipLink = page.getByRole("link", { name: "Skip to content" });

  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.locator("#main-content")).toBeFocused();
});

test("sign-in shell is responsive and accessible", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/sign-in");

  await expect(
    page.getByRole("heading", { level: 1, name: "Sign in" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "SIMULA home" })).toBeVisible();
  await expect(
    page.getByText("Built for rehearsal, not prediction."),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "SIMULA product assurances" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1440);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
