import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Elevay / LeadSens E2E tests.
 *
 * Seeding strategy: each test run gets a unique tenant slug via the
 * `/api/test-e2e/seed` endpoint (see src/app/api/test-e2e/seed/route.ts).
 * That endpoint is gated on NODE_ENV !== "production" so it can
 * never ship in prod builds. Tests cleanup by calling
 * /api/test-e2e/cleanup with the tenant id.
 *
 * Auth strategy: each test drives the /sign-in Credentials form with
 * the seeded email/password. NextAuth writes a JWT-signed cookie and
 * the test proceeds with a real session — no JWT forgery.
 */

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_SERVER
    ? undefined
    : {
        command: `next dev --turbopack --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          NODE_ENV: "development",
          ENABLE_E2E_SEED: "1",
          // WS-0 — give the PostHog analytics layer a fake key so
          // `captureEvent` and `trackEvent` actually issue the fetch
          // call we intercept in tests. Without a key they no-op.
          NEXT_PUBLIC_POSTHOG_KEY: "phc_e2e_test",
          NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
        },
      },
});
