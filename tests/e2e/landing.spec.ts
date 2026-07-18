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
    page.getByRole("link", { name: "Start a rehearsal" }),
  ).toHaveAttribute("href", "/organizations");

  const frameTab = page.getByRole("tab", { name: "Frame" });
  await expect(frameTab).toHaveAttribute("aria-selected", "true");
  await frameTab.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Rehearse" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Decide" }).click();
  await expect(
    page
      .locator("#rehearsal-story-panel")
      .getByText("Estimates nobody", { exact: true }),
  ).toBeVisible();

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
