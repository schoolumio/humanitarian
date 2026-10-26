import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV } from "./tests/e2e/support/env";

/**
 * End-to-end tests run against a production build (`npm run build` first) on port 3100 with a
 * dedicated, disposable database and the sandbox payment provider. No real services are used.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/support/global-setup.ts",
  use: {
    baseURL: E2E_ENV.APP_BASE_URL,
    trace: "retain-on-failure",
    ...devices["Pixel 7"], // mobile-first: affordable Android viewport
  },
  projects: [
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npx next start -p 3100",
    url: `${E2E_ENV.APP_BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: E2E_ENV,
  },
});
