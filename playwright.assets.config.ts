import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "stimulus-assets.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 45_000,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  webServer: {
    command:
      "pnpm --filter @simula/web exec vite ../../tests/browser-fixtures/stimulus-assets --config ../../tests/browser-fixtures/stimulus-assets/vite.config.ts --host 127.0.0.1 --port 4173 --strictPort",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    url: "http://127.0.0.1:4173",
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    launchOptions: {
      args: ["--disable-gpu"],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
    ...devices["Desktop Chrome"],
  },
});
