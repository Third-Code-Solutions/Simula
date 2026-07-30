import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("E2E-ASSET-001: governed file moves through verified preview and deletion", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByText(/has not analyzed, interpreted, or scored/i),
  ).toBeVisible();
  await page.getByLabel("Attach file to Launch concept").setInputFiles({
    buffer: PNG_1X1,
    mimeType: "image/png",
    name: "campaign-concept.png",
  });
  await page.getByRole("button", { exact: true, name: "Attach file" }).click();

  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await expect(page.getByText(/verified and available/i)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.__simulaAssetFixtureEvents.join(",")),
    )
    .toBe("list,reserve,upload");

  await page.getByRole("button", { name: "Profile technical signals" }).click();
  await expect(
    page.getByRole("heading", { name: /image signals · 1×1 · square/i }),
  ).toBeVisible();
  await expect(
    page.getByText(/No objects, text, meaning, emotion, persuasion/i),
  ).toBeVisible();
  await expect(page.getByText(/not observed human evidence/i)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.__simulaAssetFixtureEvents.join(",")),
    )
    .toBe("list,reserve,upload,profile");

  await page.getByRole("button", { name: "Verify and preview" }).click();
  const preview = page.getByRole("img", {
    name: "Private preview of campaign-concept.png",
  });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() =>
      page.evaluate(() => window.__simulaAssetFixtureEvents.join(",")),
    )
    .toBe("list,reserve,upload,profile,download");

  await page.getByRole("button", { name: "Delete file" }).click();
  await expect(page.getByText("Delete permanently?")).toBeVisible();
  await page.getByRole("button", { name: "Confirm deletion" }).click();

  await expect(page.getByText("Deleted", { exact: true })).toBeVisible();
  await expect(preview).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => window.__simulaAssetFixtureEvents.join(",")),
    )
    .toBe("list,reserve,upload,profile,download,delete");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
