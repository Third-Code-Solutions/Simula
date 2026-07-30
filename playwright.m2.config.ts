import { defineConfig, devices } from "@playwright/test";

const AUTH_ORIGIN = "http://127.0.0.1:52140";
const API_ORIGIN = "http://127.0.0.1:52141";
const WEB_ORIGIN = "http://127.0.0.1:52142";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "m2-cross-tenant.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  globalSetup: "./apps/api/test/e2e/m2-global-setup.ts",
  retries: 0,
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "node apps/web/.next/standalone/apps/web/server.js",
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      NEXT_PUBLIC_SIMULA_API_URL: API_ORIGIN,
      NEXT_PUBLIC_SIMULA_DOMAIN_API_VERSION: "v2",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_m2_browser_local",
      NEXT_PUBLIC_SUPABASE_URL: AUTH_ORIGIN,
      SIMULA_BEHAVIORAL_DEMO_ENABLED: "false",
      SIMULA_ENVIRONMENT: "test",
      SIMULA_PRIVATE_ASSET_WORKFLOW_ENABLED: "false",
      SIMULA_RELEASE_SHA: "a".repeat(40),
      SIMULA_TECHNICAL_VISUAL_PROFILE_ENABLED: "false",
      PORT: "52142",
    },
    reuseExistingServer: false,
    timeout: 30_000,
    url: WEB_ORIGIN,
  },
  use: {
    baseURL: WEB_ORIGIN,
    browserName: "chromium",
    launchOptions: { args: ["--disable-gpu"] },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
});
